import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  getS3PrefixFromEncodedPath,
  getTemporaryS3Credentials,
} from "../common/s3";
import { Environment } from "../common/utils";

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
    return;
  }

  const sessionToken = req.headers["session-token"];

  const queryParams = req.query;
  const currentTime = Date.now();
  let bookRecord = { ...req.body, uploadPendingTimestamp: currentTime };

  const bookTitle = bookRecord.title;
  if (bookTitle === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a valid book record including a title in the request body",
    };
    return;
  }

  let bookObjectId = queryParams["book-object-id"];
  const isNewBook = bookObjectId === undefined;
  if (isNewBook) {
    try {
      bookObjectId = await BloomParseServer.createBookRecord(
        bookRecord,
        sessionToken
      );
    } catch (err) {
      context.res = {
        status: 400,
        body: "Unable to create book record",
      };
      return;
    }
  }

  const prefix = `noel_chou@sil.org/uploadTest/${bookObjectId}/${currentTime}/${bookTitle}/`; // TODO just for testing
  // const prefix = `${bookObjectId}/${currentTime}/${bookTitle}/`;

  if (!isNewBook) {
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      bookObjectId
    );
    if (!BloomParseServer.canModifyBook(userInfo, existingBookInfo)) {
      context.res = {
        status: 400,
        body: "Please provide a valid session ID and book path",
      };
      return;
    }

    const existingBookPath = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );
    try {
      await copyBook(existingBookPath, prefix, env);
    } catch (err) {
      context.res = {
        status: 500,
        body: "Unable to copy book",
      };
      return;
    }

    // TODO note, this could overwrite fields of the book record
    BloomParseServer.modifyBookRecord(bookObjectId, bookRecord, sessionToken);
  }

  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix);
  } catch (err) {
    context.res = {
      status: 500,
      body: "Error generatinog temporary credentials",
    };
    return;
  }

  context.res = {
    status: 200,
    body: {
      "s3-path": prefix,
      credentials: tempCredentials,
    },
  };
}

//TODO
// test case where failure beteween uplaod start and upload fail, and then upload start again. Make sure it happens in the case where upload fail after cleanup
// write some cleanup task
