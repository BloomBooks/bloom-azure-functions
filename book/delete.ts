import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";

export async function handleDelete(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  userInfo
) {
  const actionType: string = req.params.actionType;
  if (actionType !== "delete-book") {
    context.res = {
      status: 400,
      body: "Invalid action type for DELETE method",
    };
    return;
  }
  const bookObjectId = req.query["book-object-id"];
  if (!bookObjectId) {
    context.res = {
      status: 400,
      body: "Please provide a valid book object ID",
    };
    return;
  }
  const bookInfo = await parseServer.getBookInfoByObjectId(bookObjectId);
  if (!(await BloomParseServer.canModifyBook(userInfo, bookInfo))) {
    context.res = {
      status: 400,
      body: "Please provide a valid book ID and Authentication-Token",
    };
    return;
  }

  try {
    const deleteResult = await parseServer.deleteBookRecord(
      bookObjectId,
      userInfo.sessionToken
    );
    context.res = {
      status: deleteResult.status,
      body: deleteResult.data,
    };
  } catch (e) {
    context.res = {
      status: e.response.status,
      body: e.response.data,
    };
  }
}
