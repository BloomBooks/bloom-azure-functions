import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { getEnvironment } from "../common/utils";
import { handleUploadStart } from "./uploadStart";
import { handleUploadFinish } from "./uploadFinish";
import { getIdAndAction } from "./utils";
import {
  convertApiQueryParamsIntoParseAdditionalParams,
  convertApiQueryParamsIntoParseWhere,
  convertExpandParamToParseFields,
  reshapeBookRecord,
} from "./parseAdapters";

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
    if (!isValidBookId(bookId)) {
      context.res = {
        status: 400,
        body: "Invalid book ID",
      };
      return context.res;
    }

    if (!action) {
      // Query for a specific book
      return await handleGetOneBook(
        context,
        bookId,
        req.query.expand,
        parseServer
      );
    }

    switch (action) {
      case "upload-start":
        return await handleUploadStart(context, req, userInfo, env);
      case "upload-finish":
        return await handleUploadFinish(context, req, userInfo, env);
      case "permissions":
        return await handlePermissions(context, userInfo, bookId, parseServer);

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
  // Hacking in this specific use case for now.
  // This is used by the editor to get the count of books in a language.
  if (
    req.query.lang &&
    req.query.limit &&
    req.query.limit === "0" &&
    req.query.count &&
    req.query.count === "true"
  ) {
    const count = await parseServer.getBookCountByLanguage(req.query.lang);
    context.res = {
      status: 200,
      // A GET/POST to /books always returns an array of books, even if it's empty.
      // In this temporary, hacked use case, it is always empty.
      body: { results: [], count },
    };
    return context.res;
  }

  const query = { ...req.query };
  if (req.method === "POST" && req.body?.instanceIds?.length) {
    // POST to /books is a special case.
    // We treat it basically the same as a GET, but know we have to look
    // for something (so far, just instanceIds) in the body to tell us which books to return
    // (rather than just the query parameters).
    // We use a POST because the list of instanceIds might be too long for a GET request.
    // This is used by the editor to get a set of books by bookInstanceIds for the blorg status badges.
    query.instanceIds = req.body.instanceIds.join(",");
  }
  const where = convertApiQueryParamsIntoParseWhere(query);
  const rawBookRecordsAndCount = await parseServer.getBooks(
    where,
    convertExpandParamToParseFields(query.expand),
    convertApiQueryParamsIntoParseAdditionalParams(query)
  );
  const bookRecords = rawBookRecordsAndCount.books.map((book) =>
    reshapeBookRecord(book, query.expand)
  );
  context.res = {
    status: 200,
    // Count isn't included if it is undefined (meaning the user didn't ask for it).
    body: { results: bookRecords, count: rawBookRecordsAndCount.count },
  };
  return context.res;
}

async function handlePermissions(
  context: Context,
  userInfo: User,
  bookId: string,
  parseServer: BloomParseServer
) {
  const bookInfo = await parseServer.getBookByDatabaseId(bookId);

  if (!bookInfo) {
    context.res = {
      status: 400,
      body: "Invalid book ID",
    };
    return context.res;
  }

  const isUploaderOrCollectionEditor =
    await BloomParseServer.isUploaderOrCollectionEditor(userInfo, bookInfo);
  const isModerator = await parseServer.isModerator(userInfo);

  context.res = {
    status: 200,
    body: {
      // Must be uploader or collection editor
      reupload: isUploaderOrCollectionEditor,
      becomeUploader: isUploaderOrCollectionEditor,

      // Must be uploader, collection editor, or moderator
      delete: isUploaderOrCollectionEditor || isModerator,
      editSurfaceMetadata: isUploaderOrCollectionEditor || isModerator,

      // Must be moderator
      editAllMetadata: isModerator,
    },
  };
  return context.res;
}

async function handleGetOneBook(
  context: Context,
  bookId: string,
  expandParam: string,
  parseServer: BloomParseServer
) {
  const parseFieldsToExpand = convertExpandParamToParseFields(expandParam);

  const rawParseBook = await parseServer.getBookByDatabaseId(
    bookId,
    parseFieldsToExpand
  );
  if (!rawParseBook) {
    context.res = {
      status: 404,
      body: "Book not found",
    };
    return context.res;
  }
  const bookRecord = reshapeBookRecord(rawParseBook, expandParam);
  context.res = {
    status: 200,
    body: bookRecord,
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
function requiresAuthentication(
  method: string,
  action: string | null
): boolean {
  if (method === "DELETE") return true;

  // Usually any POST request would need authentication,
  // but we use POST when the url might be too long for a GET request.

  if (action) return true;

  return false;
}

function isValidBookId(bookId: string): boolean {
  // Special case
  if (bookId === "new") return true;

  // Check that it's a valid objectId; 10-character alphanumeric string
  return /^[0-9a-z]{10}$/i.test(bookId);
}

export default books;
