import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { copyBook, getS3PrefixFromPath, getTemporaryS3Credentials } from "./s3";

// TODO combine with the parallel method on uploadStart
export async function handleUploadFinish(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  src: "prod" | "dev"
): Promise<void> {
  switch (req.method) {
    case "GET":
      await handleUploadFinishGet(context, req, userInfo, src);
      return;
    default:
      context.res = {
        status: 400,
        body: "Unhandled HTTP method",
      };
      return;
  }
}

async function handleUploadFinishGet( // TODO rename
  context: Context,
  req: HttpRequest,
  userInfo: any,
  src: "prod" | "dev"
) {
  const queryParams = req.query;

  const randomString = ""; // TODO
  // const prefix = `${randomString}/${userInfo.email}/${bookInstanceId}/`;
  const prefix = "noel_chou@sil.org/testCopyBook2/"; // TODO just for testing

  const existingBookId = queryParams["existing-book-id"];
  if (existingBookId !== undefined) {
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      existingBookId
    );
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    if (!canModifyBook(userInfo, existingBookInfo)) {
      context.res = {
        status: 400,
        body: "Please provide a valid session ID and book path",
      };
      return;
    }

    const existingBookPath = getS3PrefixFromPath(existingBookInfo.baseUrl, src);
    try {
      await copyBook(
        "dev",
        existingBookPath, // e.g. "noel_chou@sil.org/16acc3c8-5e44-4f03-b30f-83fbfb9546bb/"
        prefix
      );
    } catch (err) {
      console.log(err);
      return; // TODO what to do here?
    }
  }
  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix);
  } catch (err) {
    console.log(err);
    return; // TODO what to do here?
  }

  context.res = {
    status: 200,
    body: {
      path: prefix, // TODO a fuller url?
      credentials: tempCredentials,
    },
  };
}

// Check if user has permission to modify the book
function canModifyBook(userInfo, bookInfo) {
  var a = bookInfo == undefined;
  return (
    bookInfo !== undefined && bookInfo.uploader.objectId === userInfo.objectId
  );
}
