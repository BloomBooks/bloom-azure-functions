import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { Environment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";
import { allowPublicRead } from "../common/s3";

const book: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const queryParams = req.query;
  const env = queryParams["env"] as Environment;
  if (env === Environment.UNITTEST) {
    BloomParseServer.setServer(Environment.UNITTEST);
  } else if (env === Environment.DEVELOPMENT) {
    BloomParseServer.setServer(Environment.DEVELOPMENT);
  } else {
    BloomParseServer.setServer(Environment.PRODUCTION);
  }

  const userInfo = await getUserFromSession(context, req);
  if (!userInfo) {
    context.res = {
      status: 400,
      body: "Invalid session token",
    };
    return;
  }

  switch (req.params.action) {
    case "upload-start":
      await handleUploadStart(context, req, userInfo, env);
      return;
    case "upload-finish":
      await handleUploadFinish(context, req, userInfo, env);
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
async function getUserFromSession(context: Context, req: HttpRequest) {
  // Note that req.headers' keys are all lower case.
  let sessionToken = req.headers["session-token"];
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

export default book;
