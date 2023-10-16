import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  getS3PrefixFromEncodedPath,
  getTemporaryS3Credentials,
  urlEncode,
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

  const queryParams = req.query;

  const bookTitle = queryParams["book-title"];
  if (bookTitle === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a book title",
    };
    return;
  }

  const currentTime = urlEncode(new Date().toISOString());
  const prefix = "noel_chou@sil.org/testCopyBook8/"; // TODO just for testing
  // const prefix = `${bookObjectId}/${currentTime}/${encodedBookTitle}/`;
  const bookObjectId = queryParams["book-object-id"];
  if (bookObjectId !== undefined) {
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      bookObjectId
    );
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
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
      "s3-path": prefix, // TODO return a url-safe encoded prefix...are we sure?
      credentials: tempCredentials,
    },
  };
}
