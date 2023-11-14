import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { getEnvironment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";

const book: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const env = getEnvironment(req);
  const parseServer = new BloomParseServer(env);

  if (req.method === "POST") {
    const userInfo = await getUserFromSession(parseServer, req);
    if (!userInfo) {
      context.res = {
        status: 400,
        body: "Unable to validate user. Did you include a valid authentication token header?",
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
) {
  // Note that req.headers' keys are all lower case.
  const authenticationToken = req.headers["authentication-token"];
  return await parseServer.getLoggedInUserInfo(authenticationToken);
}

// Get the number of books on bloomlibrary.org that are in the given language. Query should get all books where the isoCode matches the given languageCode
// and 'rebrand' is not true and 'inCirculation' is not false and 'draft' is not true.
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

export default book;
