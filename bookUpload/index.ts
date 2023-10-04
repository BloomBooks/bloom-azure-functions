import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, {
  BloomParseServerMode,
} from "../common/BloomParseServer";
import { createPresignedUrl } from "./s3";

//Sample query: http://localhost:7071/v1/book-upload/get-update-url?src=dev&session-token=r:d49f9797f0bcb7ae3fbc4f1c1affe43f&book-instance-id=eeaddab4-fbdd-4c50-8967-e7f9401fd657

const bookUpload: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const queryParams = req.query;
  const src = queryParams["src"] as BloomParseServerMode;
  if (src === "prod") {
    BloomParseServer.setServer("prod");
  } else {
    BloomParseServer.setServer("dev");
  }

  const userInfo = await getUserFromSession(context, req);
  if (!userInfo) return;

  switch (req.method) {
    case "GET":
      await handleGet(context, req, userInfo, src);
      return;
    default:
      context.res = {
        status: 400,
        body: "Unhandled HTTP method",
      };
      return;
  }
};

async function handleGet(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  src: "prod" | "dev"
) {
  const queryParams = req.query;
  var bookInstanceId;
  const actionType: string = req.params.actionType;
  if (actionType === "get-update-url") {
    const book = await BloomParseServer.getBookInfoByObjectId(
      queryParams["book-object-id"]
    );
    if (!canModifyBook(userInfo, book)) {
      context.res = {
        status: 400,
        body: "Please provide a valid parse book ID and session ID",
      };
      return;
    }
    bookInstanceId = book.bookInstanceId;
  } else if (actionType === "get-new-book-url") {
    bookInstanceId = queryParams["book-instance-id"];
    if (!bookInstanceId) {
      context.res = {
        status: 400,
        body: "Please provide a book instance ID",
      };
      return;
    }
    const matchingBook =
      await BloomParseServer.getBookInfoByInstanceIdAndUploaderObjectId(
        bookInstanceId,
        userInfo.objectId
      );
    if (matchingBook !== undefined) {
      context.res = {
        status: 400,
        body: "A book already exists for this user and book instance ID",
      };
      return;
    }
  } else {
    context.res = {
      status: 400,
      body: "Invalid action type - must be either 'get-update-url' or 'get-new-book-url'",
    };
    return;
  }

  // If everything checks out, return a presigned S3 url to be used for uploading the book to S3
  const key = `${userInfo.email}/${bookInstanceId}/`;
  const clientUrl = await createPresignedUrl(src, key);
  context.res = {
    status: 200,
    body: clientUrl,
  };
}

// Validate the session token and return the user info
async function getUserFromSession(context: Context, req: HttpRequest) {
  let sessionToken = req.headers["Session-Token"];
  if (!sessionToken) {
    sessionToken = req.headers["X-Parse-Session-Token"];
  }
  if (!sessionToken) {
    sessionToken = req.query["session-token"];
  }
  const userInfo = await BloomParseServer.getLoggedInUserInfo(sessionToken);
  if (!userInfo) {
    context.res = {
      status: 400,
      body: "Invalid session token",
    };
    return;
  }
  return userInfo;
}

// Check if user has permission to modify the book
function canModifyBook(userInfo, book) {
  return book !== undefined && book.uploader.objectId === userInfo.objectId;
}

export default bookUpload;
