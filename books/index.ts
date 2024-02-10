import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { getEnvironment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";
import { getIdAndAction } from "./utils";

const books: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<any> {
  const env = getEnvironment(req);
  const parseServer = new BloomParseServer(env);

  const [bookId, action] = getIdAndAction(req.params["id-and-action"]);
  req.params.id = bookId;
  req.params.action = action;

  let userInfo: User | null = null;
  if (requiresAuthentication(req.method, action)) {
    userInfo = await getUserFromSession(parseServer, req);
    // for actions for which we need to validate the authentication token
    if (!userInfo) {
      context.res = {
        status: 400,
        body: "Unable to validate user. Did you include a valid Authentication-Token header?",
      };
      return context.res;
    }
  }

  if (bookId) {
    if (!action) {
      // Query for a specific book
      // TODO: implement
    }

    switch (action) {
      case "upload-start":
        return await handleUploadStart(context, req, userInfo, env);
      case "upload-finish":
        return await handleUploadFinish(context, req, userInfo, env);

      default:
        context.res = {
          status: 400,
          body: "Invalid action type",
        };
        return context.res;
    }
  }

  // Endpoint is /books
  // i.e. no book ID, no action
  // We are querying for a collection of books.
  return await findBooks(context, req, parseServer);
};

async function findBooks(
  context: Context,
  req: HttpRequest,
  parseServer: BloomParseServer
) {
  let bookRecords = [];

  // Hacking in this specific use case for now.
  // This is used by the editor to get a set of books by bookInstanceIds.
  // We use a POST because the list of instanceIds might be too long for a GET request.
  if (req.method === "POST" && req.body?.instanceIds?.length) {
    bookRecords = await parseServer.getBooksWithInstanceIds(
      req.body.instanceIds
    );
    context.res = {
      status: 200,
      body: { results: bookRecords, count: bookRecords.length },
    };
    return context.res;
  }

  // Hacking in this specific use case for now.
  // This is used by the editor to get the count of books in a language.
  if (req.query.lang && req.query.limit && req.query.limit === "0") {
    const count = await parseServer.getBookCountByLanguage(req.query.lang);
    context.res = {
      status: 200,
      body: { results: bookRecords, count },
    };
    return context.res;
  }

  // General query for books... not implemented yet
  context.res = {
    status: 200,
    body: { results: bookRecords, count: bookRecords.length },
  };
  return context.res;
}

// Validate the session token and return the user info
async function getUserFromSession(
  parseServer: BloomParseServer,
  req: HttpRequest
): Promise<User | null> {
  // Note that req.headers' keys are all lower case.
  const authenticationToken = req.headers["authentication-token"];
  return await parseServer.getLoggedInUserInfo(authenticationToken);
}

// We want this written in such a way that new actions require authentication by default.
function requiresAuthentication(method: string, action: string): boolean {
  if (method === "DELETE") return true;

  // Usually any POST request would need authentication,
  // but we use POST when the url might be too long for a GET request.

  if (action) return true;
}

export default books;
