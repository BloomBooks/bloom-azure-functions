import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, {
  BloomParseServerMode,
} from "../common/BloomParseServer";
import { createPresignedUrl } from "./s3";

// Check if user has permission to upload book, and if return a presigned S3 url to be used for that upload

function canUpdateBook(userInfo, book) {
  return book !== undefined && book.uploader.objectId === userInfo.objectId;
}

//Sample query: http://localhost:7071/v1/book-upload/get-update-url?src=dev&session-token=r:d49f9797f0bcb7ae3fbc4f1c1affe43f&book-instance-id=eeaddab4-fbdd-4c50-8967-e7f9401fd657

const bookUpload: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const queryParams = req.query;
  const src = queryParams["src"] as BloomParseServerMode;
  let s3BucketName;
  if (src === "prod") {
    BloomParseServer.setServer("prod");
  } else {
    BloomParseServer.setServer("dev");
  }

  const userInfo = await BloomParseServer.getLoggedInUserInfo(
    queryParams["session-token"]
  );
  if (!userInfo) {
    context.res = {
      status: 400,
      body: "Invalid session token",
    };
    return;
  }

  var bookInstanceId;
  const actionType: string = req.params.actionType;
  if (actionType === "get-update-url") {
    const book = await BloomParseServer.getBookInfoByObjectId(
      queryParams["book-object-id"]
    );
    if (!canUpdateBook(userInfo, book)) {
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

  const key = `${userInfo.email}/${bookInstanceId}/`;
  const clientUrl = await createPresignedUrl(src, key);
  context.res = {
    status: 200,
    body: clientUrl,
  };
};

export default bookUpload;
