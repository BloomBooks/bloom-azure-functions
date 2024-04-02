import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { User } from "../common/BloomParseServer";
import {
  IBookFileInfo,
  copyBook,
  deleteFilesByPrefix,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getTemporaryS3Credentials,
  isArrayOfIBookFileInfo,
  processFileHashes,
} from "../common/s3";
import { Environment } from "../common/utils";
import {
  createResponseWithAcceptedStatusAndStatusUrl,
  LongRunningAction,
  startLongRunningAction,
} from "../longRunningActions/utils";
import {
  BookUploadErrorCode,
  handleBookUploadError,
  canClientUpload,
} from "./utils";

const kPendingString = "pending";

// upload-start is a long-running function (see status/README.md).
// The client calls it to initiate the upload of a new or existing book.
// It creates or modifies a book record in Parse, and returns an S3 URL and credentials to upload files.
// The reason it is long-running is, for existing books, it copies the existing book files to a new folder.
// That copy will be the starting point for the client to sync book files to S3.
export async function handleUploadStart(
  context: Context,
  req: HttpRequest,
  userInfo: User,
  env: Environment
) {
  if (req.method !== "POST") {
    context.res = {
      status: 400,
      body: "Unhandled HTTP method",
    };
    return context.res;
  }

  const bookIdOrNew = req.params.id;
  if (!bookIdOrNew) {
    context.res = {
      status: 400,
      body: 'book ID is required: /books/{id}:upload-start (id is "new" for a new book)',
    };
    return context.res;
  }

  // The new API design is for "name", but we first implemented it with "title".
  // So we accept either for now. With the next breaking change, we can remove "title".
  const bookTitle: string = req.body["name"] || req.body["title"] || "";

  let bookFiles: IBookFileInfo[];
  try {
    bookFiles = JSON.parse(req.body["files"]);
    if (!bookFiles?.length || !isArrayOfIBookFileInfo(bookFiles))
      throw new Error();
  } catch (error) {
    // Handle parsing/validation errors
    context.res = {
      status: 400,
      body: '"files" must be an array of objects, each with a path and hash property',
    };
    return context.res;
  }

  const bloomClientVersion = req.body["clientVersion"];

  const instanceId = await startLongRunningAction(
    context,
    LongRunningAction.UploadStart,
    {
      bookIdOrNew,
      bookTitle,
      bookFiles,
      bloomClientVersion,
      userInfo,
      env,
    }
  );

  context.res = createResponseWithAcceptedStatusAndStatusUrl(
    instanceId,
    req.url
  );
  return context.res;
}

export async function longRunningUploadStart(
  input: {
    bookIdOrNew: string;
    bookTitle: string | undefined;
    bookFiles: IBookFileInfo[] | undefined;
    bloomClientVersion: string;
    userInfo: User;
    env: Environment;
  },
  context: Context
) {
  const userInfo = input.userInfo;
  const env = input.env;
  const bookIdOrNew = input.bookIdOrNew;
  const parseServer = new BloomParseServer(env);

  const currentTime = Date.now();

  const canUpload = await canClientUpload(input.bloomClientVersion, env);
  if (!canUpload) {
    return handleBookUploadError(
      BookUploadErrorCode.ClientOutOfDate,
      context,
      null
    );
  }

  const isNewBook = bookIdOrNew === "new";
  let bookId: string;
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
      bookId = await parseServer.createBookRecord(
        newBookRecord,
        userInfo.sessionToken
      );
    } catch (err) {
      return handleBookUploadError(
        BookUploadErrorCode.ErrorCreatingBookRecord,
        context,
        err
      );
    }
  } else {
    // We'll look it up below which will serve to validate it as a real, single, book ID.
    bookId = bookIdOrNew;
  }

  let bookFilesParentDirectory = input.bookTitle;
  if (bookFilesParentDirectory && !bookFilesParentDirectory.endsWith("/"))
    bookFilesParentDirectory += "/";

  const newS3Prefix = `${bookId}/${currentTime}/`;

  let filesToUpload: string[] = [];
  if (isNewBook) {
    // Some day we may have more complicated logic, including being able to restart a failed upload.
    // But for now, this is a simple pass-through of the files the client sent.
    filesToUpload = input.bookFiles.map((file) => file.path);
  } else {
    // We are modifying an existing book.
    // Check that we have permission,
    // then copy unmodified book files to the new folder for a more efficient upload.
    // (So the client only has to upload new or modified files.)
    const existingBookInfo = await parseServer.getBookByDatabaseId(bookId);
    if (
      !(await BloomParseServer.isUploaderOrCollectionEditor(
        userInfo,
        existingBookInfo
      ))
    ) {
      return handleBookUploadError(
        BookUploadErrorCode.UnableToValidatePermission,
        context,
        null
      );
    }

    // In the form bookObjectId/timestamp/
    const existingS3Prefix = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );

    // Delete any prior incomplete upload(s) for this book.
    // In other words, delete all the files under our book ID except the ones with the timestamp in the current baseUrl.
    // We will set a new uploadPendingTimestamp below which will be used for the new set of files.
    if (existingBookInfo.uploadPendingTimestamp) {
      try {
        const prefixToDelete = bookId;
        const prefixToExclude = existingS3Prefix;
        await deleteFilesByPrefix(prefixToDelete, env, prefixToExclude);
      } catch (err) {
        return handleBookUploadError(
          BookUploadErrorCode.ErrorDeletingPreviousFiles,
          context,
          err
        );
      }
    }

    try {
      const apiSuperUserSessionToken =
        await parseServer.loginAsApiSuperUserIfNeeded(
          userInfo,
          existingBookInfo
        );
      await parseServer.modifyBookRecord(
        bookId,
        {
          uploadPendingTimestamp: currentTime,
        },
        apiSuperUserSessionToken ?? userInfo.sessionToken
      );
    } catch (err) {
      return handleBookUploadError(
        BookUploadErrorCode.ErrorUpdatingBookRecord,
        context,
        err
      );
    }

    let filesToCopy: string[] = [];
    try {
      [filesToUpload, filesToCopy] = await processFileHashes(
        input.bookFiles,
        existingS3Prefix,
        env
      );
    } catch (err) {
      return handleBookUploadError(
        BookUploadErrorCode.ErrorProcessingFileHashes,
        context,
        err
      );
    }

    if (filesToCopy.length) {
      try {
        // existingBookPath is in the form bookId/timestamp/title.
        // s3Prefix only has bookId/timestamp.
        // The client must provide the new title (bookFilesParentDirectory); it could have changed.
        await copyBook(
          existingS3Prefix,
          newS3Prefix + bookFilesParentDirectory,
          filesToCopy,
          env
        );
      } catch (err) {
        return handleBookUploadError(
          BookUploadErrorCode.ErrorCopyingBookFiles,
          context,
          err
        );
      }
    }
  }

  let tempCredentials;
  try {
    tempCredentials = await getTemporaryS3Credentials(newS3Prefix, env);
  } catch (err) {
    return handleBookUploadError(
      BookUploadErrorCode.ErrorGeneratingTemporaryCredentials,
      context,
      err
    );
  }

  const s3Path = getS3UrlFromPrefix(newS3Prefix, env);
  const body = {
    transactionId: bookId,
    credentials: tempCredentials,
    url: s3Path + bookFilesParentDirectory,
    filesToUpload,
  };
  return body;
}
