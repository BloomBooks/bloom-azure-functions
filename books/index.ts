import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import { Environment, getEnvironment } from "../common/utils";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const env = getEnvironment(req);
  const parseServer = new BloomParseServer(env);

  const [bookDatabaseId, action] = getIdAndAction(req.params["id-and-action"]);
  req.params.id = bookDatabaseId;
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

  if (bookDatabaseId) {
    // Do this before validating the book ID; see comment about 204/404 in handleDelete.
    if (req.method === "DELETE")
      return await handleDelete(context, userInfo, bookDatabaseId, parseServer);

    if (!isValidBookId(bookDatabaseId)) {
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
        bookDatabaseId,
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
        return await handlePermissions(
          context,
          userInfo,
          bookDatabaseId,
          parseServer
        );

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

  const isForClientUnitTest =
    parseServer.getEnvironment() === Environment.UNITTEST;
  const bookRecords = rawBookRecordsAndCount.books.map((book) =>
    reshapeBookRecord(book, query.expand, isForClientUnitTest)
  );

  context.res = {
    status: 200,
    // Properties aren't included in objects if the value is undefined, so count
    // won't be returned if it is undefined (meaning the user didn't ask for it).
    body: { results: bookRecords, count: rawBookRecordsAndCount.count },
  };
  return context.res;
}

async function handlePermissions(
  context: Context,
  userInfo: User,
  bookDatabaseId: string,
  parseServer: BloomParseServer
) {
  const bookInfo = await parseServer.getBookByDatabaseId(bookDatabaseId);

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
  bookDatabaseId: string,
  expandParam: string,
  parseServer: BloomParseServer
) {
  const parseFieldsToExpand = convertExpandParamToParseFields(expandParam);

  const rawParseBook = await parseServer.getBookByDatabaseId(
    bookDatabaseId,
    parseFieldsToExpand
  );
  if (!rawParseBook) {
    context.res = {
      status: 404,
      body: "Book not found",
    };
    return context.res;
  }
  const isForClientUnitTest =
    parseServer.getEnvironment() === Environment.UNITTEST;
  const bookRecord = reshapeBookRecord(
    rawParseBook,
    expandParam,
    isForClientUnitTest
  );
  context.res = {
    status: 200,
    body: bookRecord,
  };
  return context.res;
}

async function handleDelete(
  context: Context,
  userInfo: User,
  bookDatabaseId: string,
  parseServer: BloomParseServer
) {
  try {
    const bookInfo = await parseServer.getBookByDatabaseId(bookDatabaseId, [
      "uploader",
    ]);

    if (bookInfo) {
      const isUploaderOrCollectionEditor =
        await BloomParseServer.isUploaderOrCollectionEditor(userInfo, bookInfo);

      let isModerator = false;
      if (!isUploaderOrCollectionEditor)
        isModerator = await parseServer.isModerator(userInfo);

      if (isUploaderOrCollectionEditor || isModerator) {
        let superUserSessionToken = null;
        if (!isModerator) {
          superUserSessionToken = await parseServer.loginAsApiSuperUserIfNeeded(
            userInfo,
            bookInfo
          );
        }

        await parseServer.deleteBookRecord(
          bookDatabaseId,
          superUserSessionToken ?? userInfo.sessionToken
        );
      }
    }

    // Always return 204, even if the book wasn't found or the user didn't have permission.
    // That's on the recommendation of https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
    // which we've generally been trying to follow.
    context.res = {
      status: 204,
    };
    return context.res;
  } catch (e) {
    // If parse gives us a 404, still return a 204.
    // That's on the recommendation of https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
    // which we've generally been trying to follow.
    if (e.response.status === 404) {
      context.res = {
        status: 204,
      };
      return context.res;
    }

    context.res = {
      status: 500,
      body: "Unable to delete book",
    };
    return context.res;
  }
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

function isValidBookId(bookDatabaseId: string): boolean {
  // Special case
  if (bookDatabaseId === "new") return true;

  // Check that it's a valid parse database ID
  return BloomParseServer.isValidDatabaseId(bookDatabaseId);
}

export default books;
