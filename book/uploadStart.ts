import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getTemporaryS3Credentials,
} from "../common/s3";
import { Environment } from "../common/utils";

const kPendingString = "pending";

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

  let bookObjectId = queryParams["book-object-id"];
  const isNewBook = bookObjectId === undefined;
  if (isNewBook) {
    const newBookRecord = {
      title: kPendingString,
      bookInstanceId: kPendingString,
      uploadPendingTimestamp: currentTime,
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: userInfo.objectId,
      },
    };

    try {
      bookObjectId = await BloomParseServer.createBookRecord(
        newBookRecord,
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

  const prefix = `${bookObjectId}/${currentTime}/`;

  if (!isNewBook) {
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      bookObjectId
    );
    if (!BloomParseServer.canModifyBook(userInfo, existingBookInfo)) {
      context.res = {
        status: 400,
        body: "Please provide a valid session ID and book object id if present",
      };
      return;
    }

    let existingBookPath = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );
    //if the last character of existingBookPath is a slash, remove it
    if (existingBookPath.endsWith("/")) {
      existingBookPath = existingBookPath.substring(
        0,
        existingBookPath.length - 1
      );
    }
    // take everything up and including the last slash (not including trailing slash)
    const existingBookPathBeforeTitle = existingBookPath.substring(
      0,
      existingBookPath.lastIndexOf("/") + 1
    );
    try {
      await copyBook(existingBookPathBeforeTitle, prefix, env);
    } catch (err) {
      context.res = {
        status: 500,
        body: "Unable to copy book",
      };
      return;
    }
  }

  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix, env);
  } catch (err) {
    context.res = {
      status: 500,
      body: "Error generating temporary credentials",
    };
    return;
  }

  const s3Path = getS3UrlFromPrefix(prefix, env);
  context.res = {
    status: 200,
    body: {
      "s3-path": s3Path,
      credentials: tempCredentials,
    },
  };
}
