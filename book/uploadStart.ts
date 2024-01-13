import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
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

  const bookTitle: string = req.body["title"] || "";

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

  const instanceId = await startLongRunningAction(
    context,
    LongRunningAction.UploadStart,
    {
      bookObjectId,
      bookTitle,
      bookFiles,
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
    bookObjectId: string | undefined;
    bookTitle: string | undefined;
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

  let bookFilesParentDirectory = input.bookTitle;
  if (bookFilesParentDirectory && !bookFilesParentDirectory.endsWith("/"))
    bookFilesParentDirectory += "/";

  const newS3Prefix = `${bookObjectId}/${currentTime}/`;

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
        const prefixToDelete = bookObjectId;
        const prefixToExclude = existingS3Prefix;
        await deleteFilesByPrefix(prefixToDelete, env, prefixToExclude);
      } catch (err) {
        return handleError(
          500,
          "Unable to delete files for previous pending upload",
          context,
          err
        );
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
        existingS3Prefix,
        env
      );
    } catch (err) {
      return handleError(500, "Unable to process file hashes", context, err);
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
        return handleError(500, "Unable to copy book", context, err);
      }
    }
  }

  let tempCredentials;
  try {
    tempCredentials = await getTemporaryS3Credentials(newS3Prefix, env);
  } catch (err) {
    return handleError(
      500,
      "Error generating temporary credentials",
      context,
      err
    );
  }

  const s3Path = getS3UrlFromPrefix(newS3Prefix, env);
  const body = {
    "transaction-id": bookObjectId,
    credentials: tempCredentials,
    url: s3Path + bookFilesParentDirectory,
    "files-to-upload": filesToUpload,
  };
  return body;
}
