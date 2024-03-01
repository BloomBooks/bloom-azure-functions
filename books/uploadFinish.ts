import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import {
  deleteFilesByPrefix,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
} from "../common/s3";
import { Environment } from "../common/utils";
import {
  createResponseWithAcceptedStatusAndStatusUrl,
  handleError,
  LongRunningAction,
  startLongRunningAction,
} from "../longRunningActions/utils";

// upload-finish is a long-running function (see status/README.md).
// The client calls it to finalize the upload of a new or existing book.
// On parse-server, it creates a language record if needed and modifies the book record.
// The reason it is long-running is, for existing books, it deletes the previous copy of the book files on S3.
export async function handleUploadFinish(
  context: Context,
  req: HttpRequest,
  userInfo: User,
  env: Environment
) {
  if (req.method !== "POST") {
    context.res = {
      status: 400,
      body: "Unhandled HTTP method",
    };
    return context.res;
  }

  const bookId = req.params.id;
  if (!bookId) {
    context.res = {
      status: 400,
      body: "book ID is required: /books/{id}:upload-finish",
    };
    return context.res;
  }

  const metadata = req.body.metadata;
  if (!metadata) {
    context.res = {
      status: 400,
      body: "Please provide a valid metadata object in the body",
    };
    return context.res;
  }

  const transactionId = req.body.transactionId;
  if (!transactionId || transactionId !== bookId) {
    // With this initial implementation, transaction ID is always the book ID.
    // But the API allows for them to be different some day.
    context.res = {
      status: 400,
      body: "Please provide a valid transactionId in the body",
    };
    return context.res;
  }

  const becomeUploader: boolean = req.body.becomeUploader === true;

  const instanceId = await startLongRunningAction(
    context,
    LongRunningAction.UploadFinish,
    { bookRecord: metadata, userInfo, env, bookId, becomeUploader }
  );

  context.res = createResponseWithAcceptedStatusAndStatusUrl(
    instanceId,
    req.url
  );
  return context.res;
}

export async function longRunningUploadFinish(
  input: {
    bookRecord: any;
    userInfo: User;
    env: Environment;
    bookId: string;
    becomeUploader: boolean;
  },
  context: Context
) {
  const bookRecord = input.bookRecord;
  const userInfo = input.userInfo;
  const env = input.env;
  const bookId = input.bookId;
  const becomeUploader = input.becomeUploader;
  const parseServer = new BloomParseServer(env);

  const bookInfo = await parseServer.getBookByDatabaseId(bookId);
  if (
    !(await BloomParseServer.isUploaderOrCollectionEditor(userInfo, bookInfo))
  ) {
    return handleError(
      400,
      "Please provide a valid Authentication-Token and book ID",
      context,
      null
    );
  }

  const newBaseUrl = bookRecord?.baseUrl;
  if (newBaseUrl === undefined) {
    return handleError(
      400,
      "Please provide valid book info, including a baseUrl, in the body",
      context,
      null
    );
  }

  if (!newBaseUrl.startsWith(getS3UrlFromPrefix(bookId, env))) {
    return handleError(
      400,
      "Invalid book base URL. Please use the prefix provided by the upload-start function",
      context,
      null
    );
  }

  // For performance reasons, we are letting uploadStart's copy process (for existing, unchanged files)
  // and the client (for new and modified files) do this instead.
  // try {
  //   const newPrefix = getS3PrefixFromEncodedPath(newBaseUrl, env);
  //   await allowPublicRead(newPrefix, env);
  // } catch (e) {
  //   return handleError(
  //     500,
  //     "Error setting book files to allow public read",
  //     context,
  //     e
  //   );
  // }

  const oldBaseURl = bookInfo.baseUrl;
  const isNewBook = !oldBaseURl;

  if (isNewBook) {
    // Since the creation of a new book is now a two-step process
    // (upload-start creates an empty record and upload-finish fills it in),
    // we need to indicate to the parse cloud code that this is a new book
    // so it can appropriately set the harvestState field.
    bookRecord.updateSource += " (new book)";

    // When upload-start created the initial record, we set inCirculation to false
    // to prevent blorg and other book consumers from showing the book before it's ready.
    // Now that we have a real book ready, we need to set it to true.
    bookRecord.inCirculation = true;
  }

  delete bookRecord.uploader; // don't modify uploader

  if ("languageDescriptors" in bookRecord) {
    bookRecord.langPointers = [];
    for (let i = 0; i < bookRecord.languageDescriptors?.length; i++) {
      const languageId = await parseServer.getOrCreateLanguage(
        bookRecord.languageDescriptors[i]
      );
      bookRecord.langPointers.push({
        __type: "Pointer",
        className: "language",
        objectId: languageId,
      });
    }

    delete bookRecord.languageDescriptors;
  }

  bookRecord.uploadPendingTimestamp = null;
  bookRecord.lastUploaded = {
    __type: "Date",
    iso: new Date().toISOString(),
  };
  if (becomeUploader) {
    bookRecord.uploader = {
      __type: "Pointer",
      className: "_User",
      objectId: userInfo.objectId,
    };

    // Switch ACL (row-level permissions) to the new uploader
    bookRecord.ACL = bookInfo.ACL;
    bookRecord.ACL[userInfo.objectId] = { write: true };
    delete bookRecord.ACL[bookInfo.uploader.objectId];
  }
  try {
    const apiSuperUserSessionToken =
      await parseServer.loginAsApiSuperUserIfNeeded(userInfo, bookInfo);
    await parseServer.modifyBookRecord(
      bookId,
      bookRecord,
      apiSuperUserSessionToken ?? userInfo.sessionToken
    );
  } catch (e) {
    return handleError(500, "Error updating parse book record", context, e);
  }

  try {
    if (oldBaseURl) {
      const bookPathPrefix = getS3PrefixFromEncodedPath(oldBaseURl, env);
      await deleteFilesByPrefix(bookPathPrefix, env);
    }
  } catch (e) {
    console.log(e);
    // TODO future work: we want this to somehow notify us of the now-orphan old book files
  }
  return {};
}
