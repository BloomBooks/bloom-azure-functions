import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { getEnvironment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";
import { handleDelete } from "./delete";
import { handleGet } from "./get";

const book: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const env = getEnvironment(req);
  const parseServer = new BloomParseServer(env);

  let userInfo = null;

  if (req.method === "GET") {
    await handleGet(parseServer, context, req, req.params.action, userInfo);
    return;
  }
  if (req.method === "DELETE") {
    await handleDelete(parseServer, context, req, userInfo);
    return;
  }

  if (req.method === "POST") {
    const userInfo = await getUserFromSession(parseServer, req);
    // for actions for which we need to validate the authentication token
    if (!userInfo && req.params.action in ["upload-start", "upload-finish"]) {
      context.res = {
        status: 400,
        body: "Unable to validate user. Did you include a valid Authentication-Token header?",
      };
      return;
    }

    switch (req.params.action) {
      case "upload-start":
        await handleUploadStart(context, req, parseServer, userInfo, env);
        return;
      case "upload-finish":
        await handleUploadFinish(context, req, parseServer, userInfo, env);
        return;
      case "get-books":
        if (req.body.bookInstanceIds !== undefined) {
          await getBooksWithIds(context, req.body.bookInstanceIds, parseServer);
        } else {
          context.res = {
            status: 400,
            body: "Please provide bookInstanceIds in the body to get-books",
          };
        }
        return;
      default:
        context.res = {
          status: 400,
          body: "Invalid action type",
        };
        return;
    }
  } else {
    switch (req.params.action) {
      case "get-book-count-by-language":
        await getBookCountByLanguage(context, req, parseServer);
        return;
      default:
        context.res = {
          status: 400,
          body: "Invalid action type",
        };
        return;
    }
  }
};

// Validate the session token and return the user info
async function getUserFromSession(
  parseServer: BloomParseServer,
  req: HttpRequest
): Promise<User | null> {
  // Note that req.headers' keys are all lower case.
  const authenticationToken = req.headers["authentication-token"];
  return await parseServer.getLoggedInUserInfo(authenticationToken);
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

async function getBooksWithIds(
  context: Context,
  bookInstanceIds: string[],
  parseServer: BloomParseServer
) {
  const bookRecords = await parseServer.getBooksWithIds(bookInstanceIds);

  context.res = {
    status: 200,
    body: { bookRecords },
  };
}

export default book;
