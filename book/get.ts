import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { validateQueryParam } from "../common/utils";

export async function handleGet(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  action: string,
  userInfo: User
) {
  switch (action) {
    case "can-modify-book":
      await canModifyBook(parseServer, context, req, userInfo);
      return;
    default:
      context.res = {
        status: 400,
        body: "Invalid action type for GET method",
      };
      return;
  }
}

async function canModifyBook(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  userInfo: User
): Promise<void> {
  const bookObjectId = validateQueryParam(context, req, "book-object-id");
  const bookInfo = await parseServer.getBookInfoByObjectId(bookObjectId);
  const canModify = await BloomParseServer.canModifyBook(userInfo, bookInfo);
  context.res.setHeader("Content-Type", "text/plain");
  context.res = {
    status: 200,
    body: canModify.toString(),
  };
}
