import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { getEnvironment } from "../common/utils";
import { handleDelete } from "./delete";
import { handleGet } from "./get";
import { handlePost } from "./post";

const book: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<any> {
  const env = getEnvironment(req);
  const parseServer = new BloomParseServer(env);

  const actionsWhichDoNotRequireAuthentication = [
    "get-books",
    "get-book-count-by-language",
  ];

  let userInfo = null;
  if (!(req.params.action in actionsWhichDoNotRequireAuthentication)) {
    userInfo = await getUserFromSession(parseServer, req);
    if (!userInfo) {
      context.res = {
        status: 400,
        body: "Unable to validate user. Did you include a valid Authentication-Token header?",
      };
      return context.res;
    }
  }

  if (req.method === "GET") {
    await handleGet(parseServer, context, req, userInfo);
    return;
  }
  if (req.method === "POST") {
    await handlePost(parseServer, context, req, userInfo, env);
    return;
  }
  if (req.method === "DELETE") {
    await handleDelete(parseServer, context, req, userInfo);
    return;
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

export default book;
