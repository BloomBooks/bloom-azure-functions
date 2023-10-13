import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { allowPublicRead, deleteBook, getS3UrlFromPrefix } from "./s3";

// TODO combine with the parallel method on uploadStart
export async function handleUploadFinish(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  env: "prod" | "dev"
): Promise<void> {
  switch (req.method) {
    case "GET":
      await handleUploadFinishGet(context, req, userInfo, env);
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
  env: "prod" | "dev"
) {
  const queryParams = req.query;

  //   upload-finish()
  // Using Parse, set Book.baseUrl field to the new folder
  // In this phase, we’re relying on Bloom Editor’s ParseClient to still be making the Parse Book Record, Language records, etc.
  // Delete the old folder
  // If needed, remove the public write permissions on the folder
  // In the end, the new folder should have public read

  const bookId = queryParams["book-id"];
  if (bookId === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a valid book ID",
    };
    return;
  }
  const newS3Path = queryParams["s3-path"];
  if (newS3Path === undefined) {
    context.res = {
      status: 400,
      body: "Please provide a valid S3 path of the book to upload",
    };
    return;
  }

  // TODO a lot of repeated code with uploadStart
  const bookInfo = await BloomParseServer.getBookInfoByObjectId(bookId);

  if (!BloomParseServer.canModifyBook(userInfo, bookInfo)) {
    context.res = {
      status: 400,
      body: "Please provide a valid session ID and book ID",
    };
    return;
  }
  const oldBaseURl = bookInfo.baseUrl;
  let sessionToken = req.headers["session-token"];
  // make sure user has permission to modify the book
  try {
    await BloomParseServer.updateBaseUrl(
      bookId,
      getS3UrlFromPrefix(newS3Path, env),
      sessionToken
    );
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error updating baseUrl in Parse",
    };
    return;
  }

  try {
    await allowPublicRead(newS3Path, env);
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error setting new book to allow public read",
    };
    return;
  }

  try {
    await deleteBook(oldBaseURl, env);
    context.res = {
      status: 200,
      body: "Successfully updated book",
    };
  } catch (e) {
    context.res = {
      status: 500,
      body: "Error deleting old book",
    };
  }
}

// TODO: prefix vs path, and which to pass to and from bloomdesktop
// test credentials
// all error handling

// https://s3.amazonaws.com/BloomLibraryBooks-Sandbox/noel_chou%40sil.org%2f0246f675-41fc-4a1c-a385-40dc1b034c8b%2fWindy+Day++AI+Experiment%2f
