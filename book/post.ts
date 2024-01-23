import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { Environment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";

export async function handlePost(
  parseServer: BloomParseServer,
  context: Context,
  req: HttpRequest,
  userInfo: User,
  env: Environment
) {
  switch (req.params.action) {
    case "upload-start":
      return await handleUploadStart(context, req, userInfo, env);
    case "upload-finish":
      return await handleUploadFinish(context, req, userInfo, env);
    case "get-books":
      if (req.body.bookInstanceIds !== undefined) {
        return await getBooksWithIds(
          context,
          req.body.bookInstanceIds,
          parseServer
        );
      } else {
        context.res = {
          status: 400,
          body: "Please provide bookInstanceIds in the body to get-books",
        };
      }
      return context.res;
    default:
      context.res = {
        status: 400,
        body: "Invalid action type for POST method",
      };
      return context.res;
  }
}

export async function getBooksWithIds(
  context: Context,
  bookInstanceIds: string[],
  parseServer: BloomParseServer
) {
  const bookRecords = await parseServer.getBooksWithIds(bookInstanceIds);

  context.res = {
    status: 200,
    body: { bookRecords },
  };
  return context.res;
}
