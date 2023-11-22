import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { validateQueryParam } from "../common/utils";

export async function handleGet(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  userInfo: User
) {
  switch (req.params.action) {
    case "get-book-count-by-language":
      await getBookCountByLanguage(context, req, parseServer);
      return;
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

// Get the number of books on bloomlibrary.org that are in the given language. Query should get all books where the isoCode matches the given languageCode
// and 'rebrand' is not true and 'inCirculation' is not false and 'draft' is not true.
// In the future, we may need to parameterize those filters, but for now, it fits our current use case (Bloom editor's count of books uploaded).
async function getBookCountByLanguage(
  context: Context,
  req: HttpRequest,
  parseServer: BloomParseServer
) {
  const queryParams = req.query;
  const languageTag = queryParams["language-tag"];
  const count = await parseServer.getBookCountByLanguage(languageTag);

  context.res = {
    status: 200,
    body: count,
  };
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
