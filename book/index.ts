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

  const userInfo = await getUserFromSession(parseServer, req);
  if (!userInfo) {
    context.res = {
      status: 400,
      body: "Unable to validate user. Did you include a valid session token header?",
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

export default book;
