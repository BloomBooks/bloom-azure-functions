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
        body: "Invalid action type for POST method",
      };
      return;
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
}
