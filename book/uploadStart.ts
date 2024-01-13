import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  IBookFileInfo,
  copyBook,
  deleteFiles,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getTemporaryS3Credentials,
  isArrayOfIBookFileInfo,
  listPrefixContentsKeys,
  processFileHashes,
} from "../common/s3";
import { Environment } from "../common/utils";
import {
  createResponseWithAcceptedStatusAndStatusUrl,
  handleError,
  LongRunningAction,
  startLongRunningAction,
} from "../longRunningActions/utils";

const kPendingString = "pending";

// upload-start is a long-running function (see status/README.md).
// The client calls it to initiate the upload of a new or existing book.
// It creates or modifies a book record in Parse, and returns an S3 URL and credentials to upload files.
// The reason it is long-running is, for existing books, it copies the existing book files to a new folder.
// That copy will be the starting point for the client to sync book files to S3.
export async function handleUploadStart(
  context: Context,
  req: HttpRequest,
  userInfo: any,
  env: Environment
) {
  if (req.method !== "POST") {
    context.res = {
      status: 400,
      body: "Unhandled HTTP method",
    };
    return context.res;
  }

  const bookObjectId = req.query["existing-book-object-id"];

  let bookFilesNewPrefix: string | undefined;
  let bookFiles: IBookFileInfo[];
  if (bookObjectId) {
    const bookFilesRaw = req.body["files"];
    try {
      bookFiles = JSON.parse(bookFilesRaw);
      if (!bookFiles?.length || !isArrayOfIBookFileInfo(bookFiles))
        throw new Error();

      bookFilesNewPrefix = req.body["files-prefix"];
    } catch (error) {
      // Handle parsing/validation errors
      context.res = {
        status: 400,
        body: "files must be an array of objects, each with a path and hash property",
      };
      return context.res;
    }
  }

  const instanceId = await startLongRunningAction(
    context,
    LongRunningAction.UploadStart,
    { bookObjectId, bookFilesNewPrefix, bookFiles, userInfo, env }
  );

  context.res = createResponseWithAcceptedStatusAndStatusUrl(
    instanceId,
    req.url
  );
  return context.res;
}

export async function longRunningUploadStart(
  input: {
    bookObjectId: string | undefined;
    bookFilesNewPrefix: string | undefined;
    bookFiles: IBookFileInfo[] | undefined;
    userInfo: any;
    env: Environment;
  },
  context: Context
) {
  const userInfo = input.userInfo;
  const env = input.env;
  let bookObjectId = input.bookObjectId;
  const parseServer = new BloomParseServer(env);

  const currentTime = Date.now();

  const isNewBook = bookObjectId === undefined;
  if (isNewBook) {
    const newBookRecord = {
      title: kPendingString,
      bookInstanceId: kPendingString,
      updateSource: "BloomDesktop via API",
      uploadPendingTimestamp: currentTime,
      inCirculation: false, // prevent various things from displaying it until upload-finish makes it a complete record
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: userInfo.objectId,
      },
    };

    try {
      bookObjectId = await parseServer.createBookRecord(
        newBookRecord,
        userInfo.sessionToken
      );
    } catch (err) {
      return handleError(400, "Unable to create book record", context, err);
    }
  }

  const prefix = `${bookObjectId}/${currentTime}/`;

  let filesToUpload: string[] = [];
  if (!isNewBook) {
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    const existingBookInfo = await parseServer.getBookInfoByObjectId(
      bookObjectId
    );
    if (!BloomParseServer.canModifyBook(userInfo, existingBookInfo)) {
      return handleError(
        400,
        "Please provide a valid Authentication-Token and existing-book-object-id (if book exists)",
        context,
        null
      );
    }

    const existingBookPath = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );

    // If another upload of this book has been started but not finished, delete its files
    // This is safe because we copy the book files in uploadStart just for efficiency,
    // Bloom Desktop will upload any files that are not there
    if (existingBookInfo.uploadPendingTimestamp) {
      const allFilesForThisBook = await listPrefixContentsKeys(
        bookObjectId, // pass bookObjectId as the prefix; we want all files under the book object id
        env
      );
      const currentlyUsedFilesForThisBook = await listPrefixContentsKeys(
        existingBookPath, // we don't want to delete any files prefixed by the currently active baseUrl
        env
      );
      const filesToDelete = allFilesForThisBook.filter(
        (file) => !currentlyUsedFilesForThisBook.includes(file)
      );
      try {
        await deleteFiles(filesToDelete, env);
      } catch (err) {
        return handleError(500, "Unable to delete files", context, err);
      }
    }

    try {
      parseServer.modifyBookRecord(
        bookObjectId,
        {
          uploadPendingTimestamp: currentTime,
        },
        userInfo.sessionToken
      );
    } catch (err) {
      return handleError(500, "Unable to modify book record", context, err);
    }

    let filesToCopy: string[] = [];
    try {
      [filesToUpload, filesToCopy] = await processFileHashes(
        input.bookFiles,
        existingBookPath,
        env
      );
    } catch (err) {
      return handleError(500, "Unable to process file hashes", context, err);
    }

    if (filesToCopy.length) {
      try {
        // existingBookPath is in the form bookId/timestamp/title.
        // prefix only has bookId/timestamp. The client must provide the new title; it could have changed.
        await copyBook(
          existingBookPath,
          prefix + input.bookFilesNewPrefix,
          filesToCopy,
          env
        );
      } catch (err) {
        return handleError(500, "Unable to copy book", context, err);
      }
    }
  }

  let tempCredentials;
  try {
    tempCredentials = await getTemporaryS3Credentials(prefix, env);
  } catch (err) {
    return handleError(
      500,
      "Error generating temporary credentials",
      context,
      err
    );
  }

  const s3Path = getS3UrlFromPrefix(prefix, env);
  const body = {
    "transaction-id": bookObjectId,
    credentials: tempCredentials,
    url: s3Path,
    "files-to-upload": filesToUpload,
  };
  return body;
}
