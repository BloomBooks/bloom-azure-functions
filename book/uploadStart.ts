import { Context, HttpRequest } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import {
  copyBook,
  deleteFiles,
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getTemporaryS3Credentials,
  listPrefixContentsKeys,
} from "../common/s3";
import { Environment } from "../common/utils";

const kPendingString = "pending";

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
    return;
  }

  const sessionToken = req.headers["session-token"];

  const queryParams = req.query;
  const currentTime = Date.now();

  let bookObjectId = queryParams["existing-book-object-id"];
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
      bookObjectId = await BloomParseServer.createBookRecord(
        newBookRecord,
        sessionToken
      );
    } catch (err) {
      context.res = {
        status: 400,
        body: "Unable to create book record",
      };
      return;
    }
  }

  const prefix = `${bookObjectId}/${currentTime}/`;

  if (!isNewBook) {
    // we are modifying an existing book. Check that we have permission, then copy old book to new folder for efficient syncing
    const existingBookInfo = await BloomParseServer.getBookInfoByObjectId(
      bookObjectId
    );
    if (!BloomParseServer.canModifyBook(userInfo, existingBookInfo)) {
      context.res = {
        status: 400,
        body: "Please provide a valid session ID and book object id if present",
      };
      return;
    }

    let existingBookPath = getS3PrefixFromEncodedPath(
      existingBookInfo.baseUrl,
      env
    );

    // If another upload of this book has been started but not finished, delete its files
    // This is safe because we copy the book files in uploadStart just for efficiency,
    // Bloom Desktop will upload any files that are not there
    if (existingBookInfo.uploadPendingTimestamp) {
      const allFilesForThisBook = await listPrefixContentsKeys(
        bookObjectId,
        env
      );
      const currentlyUsedFilesForThisBook = await listPrefixContentsKeys(
        existingBookPath,
        env
      );
      const filesToDelete = allFilesForThisBook.filter(
        (file) => !currentlyUsedFilesForThisBook.includes(file)
      );
      try {
        await deleteFiles(filesToDelete, env);
      } catch (err) {
        context.res = {
          status: 500,
          body: "Unable to delete files",
        };
        return;
      }
    }

    //book path is in the form of bookId/timestamp/title
    //We want everything before the title; take everything up to the second slash in existingBookPath
    const secondSlashIndex = existingBookPath.indexOf(
      "/",
      existingBookPath.indexOf("/") + 1
    );
    const existingBookPathBeforeTitle = existingBookPath.substring(
      0,
      secondSlashIndex + 1
    );

    try {
      await copyBook(existingBookPathBeforeTitle, prefix, env);
    } catch (err) {
      context.res = {
        status: 500,
        body: "Unable to copy book",
      };
      return;
    }
    try {
      BloomParseServer.modifyBookRecord(
        bookObjectId,
        {
          uploadPendingTimestamp: currentTime,
        },
        sessionToken
      );
    } catch (err) {
      context.res = {
        status: 500,
        body: "Unable to modify book record",
      };
      return;
    }
  }

  try {
    var tempCredentials = await getTemporaryS3Credentials(prefix, env);
  } catch (err) {
    context.res = {
      status: 500,
      body: "Error generating temporary credentials",
    };
    return;
  }

  const s3Path = getS3UrlFromPrefix(prefix, env);
  context.res = {
    status: 200,
    body: {
      url: s3Path,
      "transaction-id": bookObjectId,
      credentials: tempCredentials,
    },
  };
}
