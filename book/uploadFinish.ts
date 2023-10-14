import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { allowPublicRead, deleteBook } from "../common/s3";
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

  const newS3Path = req.body.baseUrl;
  if (newS3Path === undefined) {
    context.res = {
      status: 400,
      body: "Please provide valid book info, including a baseURl, in the body",
    };
    return;
  }

  let sessionToken = req.headers["session-token"];

  const bookId = queryParams["book-object-id"];
  if (bookId === undefined) {
    try {
      BloomParseServer.createBookRecord(req.body, sessionToken);
    } catch (e) {
      context.res = {
        status: 500,
        body: "Error creating parse book record",
      };
      return;
    }
  } else {
    const bookInfo = await BloomParseServer.getBookInfoByObjectId(bookId);
    if (!BloomParseServer.canModifyBook(userInfo, bookInfo)) {
      context.res = {
        status: 400,
        body: "Please provide a valid session ID and book ID",
      };
      return;
    }

    const oldBaseURl = bookInfo.baseUrl;
    // make sure user has permission to modify the book
    try {
      await BloomParseServer.modifyBookRecord(
        bookId,
        req.body, // TODO is this right
        sessionToken
      );
    } catch (e) {
      context.res = {
        status: 500,
        body: "Error updating parse book record",
      };
      return;
    }
    await deleteBook(oldBaseURl, env);
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

  context.res = {
    status: 200,
    body: "Successfully updated book",
  };
}

// TODO get the baseUrl with then new s3 path out of the body on finish. We will decide whether it will be url encoded. It will be parsebookid/timestamp/title
