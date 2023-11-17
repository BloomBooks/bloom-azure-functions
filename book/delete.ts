import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { validateQueryParam } from "../common/utils";

export async function handleDelete(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  userInfo: User
) {
  const actionType: string = req.params.action;
  if (actionType !== "delete-book") {
    context.res = {
      status: 400,
      body: "Invalid action type for DELETE method",
    };
    return;
  }

  const bookObjectId = validateQueryParam(context, req, "book-object-id");
  const bookInfo = await parseServer.getBookInfoByObjectId(bookObjectId);
  // REVIEW: should alt users actually be able to delete? Maybe they can only update?
  // Then we would need a strict param for canModifyBook or something.
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
