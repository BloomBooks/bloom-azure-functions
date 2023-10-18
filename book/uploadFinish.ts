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

  let sessionToken = req.headers["session-token"];

  const bookId = queryParams["transaction-id"];
  if (bookId === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a valid book ID",
    };
    return;
  }
  const bookInfo = await BloomParseServer.getBookInfoByObjectId(bookId);
  if (!BloomParseServer.canModifyBook(userInfo, bookInfo)) {
    context.res = {
      status: 400,
      body: "Please provide a valid session ID and book ID",
    };
    return;
  }

  let newBookRecord = req.body;
  const newBaseUrl = newBookRecord.baseUrl;
  if (newBaseUrl === undefined) {
    context.res = {
      status: 400,
      body: "Please provide valid book info, including a baseURl, in the body",
    };
    return;
  }

  if (!newBaseUrl.startsWith(getS3UrlFromPrefix(bookId, env))) {
    context.res = {
      status: 400,
      body: "Invalid book base URL. Please use the prefix provided by the upload start function",
    };
    return;
  }

  try {
    const newPrefix = getS3PrefixFromEncodedPath(newBaseUrl, env);
    await allowPublicRead(newPrefix, env);
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error setting new book to allow public read",
    };
    return;
  }

  const oldBaseURl = bookInfo.baseUrl;

  delete newBookRecord.uploader; // don't modify uploader
  newBookRecord["uploadPendingTimestamp"] = undefined;
  try {
    await BloomParseServer.modifyBookRecord(
      bookId,
      newBookRecord,
      sessionToken
    );
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error updating parse book record",
    };
    return;
  }

  try {
    if (oldBaseURl) await deleteBook(oldBaseURl, env);
  } catch (e) {
    console.log(e);
    // TODO future work: we want this to somehow notify us of the now-orphan old book files
  }

  context.res = {
    status: 200,
    body: "Successfully updated book",
  };
}
