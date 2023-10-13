import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  getS3PrefixFromEncodedPath,
  getTemporaryS3Credentials,
} from "./s3";

export async function handleUploadStart(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  env: "prod" | "dev" | "unit-test"
): Promise<void> {
  switch (req.method) {
    case "POST":
      await handleUploadStartPost(context, req, userInfo, env);
      return;
    default:
      context.res = {
        status: 400,
        body: "Unhandled HTTP method",
      };
      return;
  }
}

async function handleUploadStartPost( // TODO rename
  context: Context,
  req: HttpRequest,
  userInfo: any,
  env: "prod" | "dev" | "unit-test"
) {
  const queryParams = req.query;

  const randomString = ""; // TODO
  // const prefix = `${randomString}/${userInfo.email}/${bookInstanceId}/`;
  // TODO add book title?
  const prefix = "noel_chou@sil.org/testCopyBook6"; // TODO just for testing
  // TODO why an extra / directory?

  const existingBookId = queryParams["existing-book-id"];
  if (existingBookId !== undefined) {
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      existingBookId
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
      await copyBook(
        existingBookPath, // e.g. "noel_chou@sil.org/16acc3c8-5e44-4f03-b30f-83fbfb9546bb/"
        prefix,
        env
      );
    } catch (err) {
      context.res = {
        status: 400,
        body: "Error copying book",
      };
      return; // TODO what to do here?
    }
  }
  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix);
  } catch (err) {
    return; // TODO what to do here?
  }

  context.res = {
    status: 200,
    body: {
      "s3-path": prefix, // TODO a fuller url?
      credentials: tempCredentials,
    },
  };
}
