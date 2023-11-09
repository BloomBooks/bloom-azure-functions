import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  allowPublicRead,
  deleteBook,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
} from "../common/s3";
import { Environment } from "../common/utils";

export async function handleUploadFinish(
  context: Context,
  req: HttpRequest,
  parseServer: BloomParseServer,
  userInfo: any,
  env: Environment
) {
  if (req.method !== "POST") {
    context.res = {
      status: 400,
      body: "Unhandled HTTP method",
    };
    return;
  }

  const queryParams = req.query;
  const bookId = queryParams["transaction-id"];
  if (bookId === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a valid book ID",
    };
    return;
  }
  const bookInfo = await parseServer.getBookInfoByObjectId(bookId);
  if (!BloomParseServer.canModifyBook(userInfo, bookInfo)) {
    context.res = {
      status: 400,
      body: "Please provide a valid Authentication-Token and transaction-id",
    };
    return;
  }

  const bookRecord = req.body;
  const newBaseUrl = bookRecord.baseUrl;
  if (newBaseUrl === undefined) {
    context.res = {
      status: 400,
      body: "Please provide valid book info, including a baseUrl, in the body",
    };
    return;
  }

  if (!newBaseUrl.startsWith(getS3UrlFromPrefix(bookId, env))) {
    context.res = {
      status: 400,
      body: "Invalid book base URL. Please use the prefix provided by the upload-start function",
    };
    return;
  }

  try {
    const newPrefix = getS3PrefixFromEncodedPath(newBaseUrl, env);
    await allowPublicRead(newPrefix, env);
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error setting book files to allow public read",
    };
    return;
  }

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
    for (let i = 0; i < bookRecord.languageDescriptors.length; i++) {
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
  try {
    await parseServer.modifyBookRecord(
      bookId,
      bookRecord,
      userInfo.sessionToken
    );
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error updating parse book record",
    };
    return;
  }

  try {
    if (oldBaseURl) {
      const bookPathPrefix = getS3PrefixFromEncodedPath(oldBaseURl, env);
      await deleteBook(bookPathPrefix, env);
    }
  } catch (e) {
    console.log(e);
    // TODO future work: we want this to somehow notify us of the now-orphan old book files
  }

  context.res = {
    status: 200,
    body: "Successfully updated book",
  };
}
