import { Context, HttpRequest } from "@azure/functions";
import * as df from "durable-functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  deleteFiles,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getTemporaryS3Credentials,
  listPrefixContentsKeys,
} from "../common/s3";
import { Environment } from "../common/utils";
import {
  createResponseWithAcceptedStatusAndStatusUrl,
  handleError,
  LongRunningAction,
  startLongRunningAction,
} from "../longRunningActions/utils";

const kPendingString = "pending";

// upload-start is a long-running function (see status/README.md).
// The client calls it to initiate the upload of a new or existing book.
// It creates or modifies a book record in Parse, and returns an S3 URL and credentials to upload files.
// The reason it is long-running is, for existing books, it copies the existing book files to a new folder.
// That copy will be the starting point for the client to sync book files to S3.
export async function handleUploadStart(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  env: Environment
) {
  if (req.method !== "POST") {
    context.res = {
      status: 400,
      body: "Unhandled HTTP method",
    };
    return context.res;
  }

  const bookObjectId = req.query["existing-book-object-id"];
  const instanceId = await startLongRunningAction(
    context,
    LongRunningAction.UploadStart,
    { bookObjectId, userInfo, env }
  );

  context.res = createResponseWithAcceptedStatusAndStatusUrl(
    instanceId,
    req.url
  );
  return context.res;
}

export async function longRunningUploadStart(
  input: {
    bookObjectId: string | undefined;
    userInfo: any;
    env: Environment;
  },
  context: Context
) {
  const userInfo = input.userInfo;
  const env = input.env;
  let bookObjectId = input.bookObjectId;
  const parseServer = new BloomParseServer(env);

  const currentTime = Date.now();

  const isNewBook = bookObjectId === undefined;
  if (isNewBook) {
    const newBookRecord = {
      title: kPendingString,
      bookInstanceId: kPendingString,
      updateSource: "BloomDesktop via API",
      uploadPendingTimestamp: currentTime,
      inCirculation: false, // prevent various things from displaying it until upload-finish makes it a complete record
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: userInfo.objectId,
      },
    };

    try {
      bookObjectId = await parseServer.createBookRecord(
        newBookRecord,
        userInfo.sessionToken
      );
    } catch (err) {
      return handleError(400, "Unable to create book record", context, err);
    }
  }

  const prefix = `${bookObjectId}/${currentTime}/`;

  if (!isNewBook) {
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    const existingBookInfo = await parseServer.getBookInfoByObjectId(
      bookObjectId
    );
    if (!BloomParseServer.canModifyBook(userInfo, existingBookInfo)) {
      return handleError(
        400,
        "Please provide a valid Authentication-Token and existing-book-object-id (if book exists)",
        context,
        null
      );
    }

    const existingBookPath = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );

    // If another upload of this book has been started but not finished, delete its files
    // This is safe because we copy the book files in uploadStart just for efficiency,
    // Bloom Desktop will upload any files that are not there
    if (existingBookInfo.uploadPendingTimestamp) {
      const allFilesForThisBook = await listPrefixContentsKeys(
        bookObjectId, // pass bookObjectId as the prefix; we want all files under the book object id
        env
      );
      const currentlyUsedFilesForThisBook = await listPrefixContentsKeys(
        existingBookPath, // we don't want to delete any files prefixed by the currently active baseUrl
        env
      );
      const filesToDelete = allFilesForThisBook.filter(
        (file) => !currentlyUsedFilesForThisBook.includes(file)
      );
      try {
        await deleteFiles(filesToDelete, env);
      } catch (err) {
        return handleError(500, "Unable to delete files", context, err);
      }
    }

    //book path is in the form of bookId/timestamp/title
    //We want everything before the title; take everything up to the second slash in existingBookPath
    const secondSlashIndex = existingBookPath.indexOf(
      "/",
      existingBookPath.indexOf("/") + 1
    );
    const existingBookPathBeforeTitle = existingBookPath.substring(
      0,
      secondSlashIndex + 1
    );

    try {
      await copyBook(existingBookPathBeforeTitle, prefix, env);
    } catch (err) {
      return handleError(500, "Unable to copy book", context, err);
    }
    try {
      parseServer.modifyBookRecord(
        bookObjectId,
        {
          uploadPendingTimestamp: currentTime,
        },
        userInfo.sessionToken
      );
    } catch (err) {
      return handleError(500, "Unable to modify book record", context, err);
    }
  }

  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix, env);
  } catch (err) {
    return handleError(
      500,
      "Error generating temporary credentials",
      context,
      err
    );
  }

  const s3Path = getS3UrlFromPrefix(prefix, env);
  const body = {
    url: s3Path,
    "transaction-id": bookObjectId,
    credentials: tempCredentials,
  };
  return body;
}
