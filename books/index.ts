import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
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
import * as df from "durable-functions";

export async function books(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const env = getEnvironment(request);
  const parseServer = new BloomParseServer(env);

  const [bookDatabaseId, action] = getIdAndAction(
    request.params["id-and-action"]
  );

  request.params.id = bookDatabaseId;
  request.params.action = action;

  let userInfo: User | null = null;
  if (requiresAuthentication(request.method, action)) {
    userInfo = await getUserFromSession(parseServer, request);
    // for actions for which we need to validate the authentication token
    if (!userInfo) {
      return {
        status: 400,
        body: "Unable to validate user. Did you include a valid Authentication-Token header?",
      };
    }
  }

  if (bookDatabaseId) {
    // Do this before validating the book ID; see comment about 204/404 in handleDelete.
    if (request.method === "DELETE")
      return await handleDelete(context, userInfo, bookDatabaseId, parseServer);

    if (!isValidBookId(bookDatabaseId)) {
      return {
        status: 400,
        body: "Invalid book ID",
      };
    }

    if (!action) {
      // Query for a specific book
      return await handleGetOneBook(
        context,
        bookDatabaseId,
        request.query.get("expand"),
        parseServer
      );
    }

    switch (action) {
      case "upload-start":
        return await handleUploadStart(request, context, userInfo, env);
      case "upload-finish":
        return await handleUploadFinish(request, context, userInfo, env);
      case "permissions":
        return await handlePermissions(
          context,
          userInfo,
          bookDatabaseId,
          parseServer
        );

      default:
        return {
          status: 400,
          body: "Invalid action type",
        };
    }
  }

  // Endpoint is /books
  // i.e. no book ID, no action
  // We are querying for a collection of books.
  return await findBooks(context, request, parseServer);
}

async function findBooks(
  context: InvocationContext,
  request: HttpRequest,
  parseServer: BloomParseServer
): Promise<HttpResponseInit> {
  // Hacking in this specific use case for now.
  // This is used by the editor to get the count of books in a language.
  const lang = request.query.get("lang");
  const limit = request.query.get("limit");
  const count = request.query.get("count");

  if (lang && limit === "0" && count === "true") {
    const count = await parseServer.getBookCountByLanguage(lang);
    return {
      status: 200,
      // A GET/POST to /books always returns an array of books, even if it's empty.
      // In this temporary, hacked use case, it is always empty.
      jsonBody: { results: [], count },
    };
  }

  let instanceIds: string;
  if (request.method === "POST") {
    // POST to /books is a special case.
    // We treat it basically the same as a GET, but know we have to look
    // for something (so far, just instanceIds) in the body to tell us which books to return
    // (rather than just the query parameters).
    // We use a POST because the list of instanceIds might be too long for a GET request.
    // This is used by the editor to get a set of books by bookInstanceIds for the blorg status badges.
    const body = (await request.json()) as any;
    if (body?.instanceIds?.length) {
      instanceIds = body.instanceIds.join(",");
    }
  }

  const where = convertApiQueryParamsIntoParseWhere(request.query, instanceIds);
  const rawBookRecordsAndCount = await parseServer.getBooks(
    where,
    convertExpandParamToParseFields(request.query.get("expand")),
    convertApiQueryParamsIntoParseAdditionalParams(request.query)
  );

  const isForClientUnitTest =
    parseServer.getEnvironment() === Environment.UNITTEST;
  const bookRecords = rawBookRecordsAndCount.books.map((book) =>
    reshapeBookRecord(book, request.query.get("expand"), isForClientUnitTest)
  );

  return {
    status: 200,
    // Properties aren't included in objects if the value is undefined, so count
    // won't be returned if it is undefined (meaning the user didn't ask for it).
    jsonBody: { results: bookRecords, count: rawBookRecordsAndCount.count },
  };
}

async function handlePermissions(
  context: InvocationContext,
  userInfo: User,
  bookDatabaseId: string,
  parseServer: BloomParseServer
): Promise<HttpResponseInit> {
  const bookInfo = await parseServer.getBookByDatabaseId(bookDatabaseId);

  if (!bookInfo) {
    return {
      status: 400,
      jsonBody: "Invalid book ID",
    };
  }

  const isModerator = await parseServer.isModerator(userInfo);
  if (isModerator) {
    return {
      status: 200,
      jsonBody: {
        reupload: true,
        becomeUploader: true,
        delete: true,
        editSurfaceMetadata: true,
        editAllMetadata: true,
      },
    };
  }

  const isUploaderOrCollectionEditor =
    await BloomParseServer.isUploaderOrCollectionEditor(userInfo, bookInfo);
  return {
    status: 200,
    jsonBody: {
      // Must be uploader or collection editor
      reupload: isUploaderOrCollectionEditor,
      becomeUploader: isUploaderOrCollectionEditor,
      delete: isUploaderOrCollectionEditor,
      editSurfaceMetadata: isUploaderOrCollectionEditor,

      // Must be moderator
      editAllMetadata: false,
    },
  };
}

async function handleGetOneBook(
  context: InvocationContext,
  bookDatabaseId: string,
  expandParam: string,
  parseServer: BloomParseServer
): Promise<HttpResponseInit> {
  const parseFieldsToExpand = convertExpandParamToParseFields(expandParam);

  const rawParseBook = await parseServer.getBookByDatabaseId(
    bookDatabaseId,
    parseFieldsToExpand
  );
  if (!rawParseBook) {
    return {
      status: 404,
      body: "Book not found",
    };
  }
  const isForClientUnitTest =
    parseServer.getEnvironment() === Environment.UNITTEST;
  const bookRecord = reshapeBookRecord(
    rawParseBook,
    expandParam,
    isForClientUnitTest
  );
  return {
    status: 200,
    jsonBody: bookRecord,
  };
}

async function handleDelete(
  context: InvocationContext,
  userInfo: User,
  bookDatabaseId: string,
  parseServer: BloomParseServer
): Promise<HttpResponseInit> {
  try {
    const bookInfo = await parseServer.getBookByDatabaseId(bookDatabaseId, [
      "uploader",
    ]);

    if (bookInfo) {
      const isUploaderOrCollectionEditor =
        await BloomParseServer.isUploaderOrCollectionEditor(userInfo, bookInfo);

      let isModerator = false;
      if (!isUploaderOrCollectionEditor) {
        isModerator = await parseServer.isModerator(userInfo);
      }

      if (isUploaderOrCollectionEditor || isModerator) {
        let superUserSessionToken = null;
        if (!isModerator) {
          // Moderators and the book uploader have row-level permission to modify or delete
          // the book record in the database. Users who have permission to modify the book because they are
          // collection editors must make use of the super user to gain that permission in the database.
          superUserSessionToken = await parseServer.loginAsApiSuperUserIfNeeded(
            userInfo,
            bookInfo
          );
        }

        await parseServer.deleteBookRecord(
          bookDatabaseId,
          superUserSessionToken ?? userInfo.sessionToken
        );
      } else {
        return {
          status: 403, // Forbidden
        };
      }
    }

    // Return 204 even if the book wasn't found.
    // That's on the recommendation of https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
    // which we've generally been trying to follow.
    return {
      status: 204,
    };
  } catch (e) {
    // This shouldn't happen. If the book record isn't there, we should have failed to get the book info above
    // (and returned a 204).
    // But in case two deletes happen at almost the same time, handle it again here.
    if (e.response.status === 404) {
      return {
        status: 204,
      };
    }

    return {
      status: 500,
      body: "Unable to delete book",
    };
  }
}

// Validate the session token and return the user info
async function getUserFromSession(
  parseServer: BloomParseServer,
  request: HttpRequest
): Promise<User | null> {
  // Note that req.headers' keys are all lower case.
  let authenticationToken: string;
  if (parseServer.getEnvironment() === Environment.UNITTEST) {
    authenticationToken = await parseServer.loginAsUnitTestUser();
  } else {
    authenticationToken = request.headers.get("authentication-token");
  }
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

app.http("books", {
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  route: "books/{id-and-action?}",
  handler: books,
  extraInputs: [
    {
      name: "starter",
      type: "orchestrationClient",
    },
  ],
});
