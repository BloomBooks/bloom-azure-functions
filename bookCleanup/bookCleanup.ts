import BloomParseServer from "../common/BloomParseServer";
import { deleteFilesByPrefix } from "../common/s3";
import { Environment } from "../common/utils";

export async function bookCleanupInternal(env: Environment, log: Function) {
  const parseServer = new BloomParseServer(env);

  const runInSafeMode = env === Environment.PRODUCTION;

  const sessionToken = await parseServer.loginAsBookCleanupUser();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
  const booksToBeCleanedUp = (
    await parseServer.getBooks(`{"uploadPendingTimestamp":{"$lt":${cutoff}}}`)
  ).books;
  for (const book of booksToBeCleanedUp) {
    const bookPrefixToDelete = `${book.objectId}/${book.uploadPendingTimestamp}`;
    if (!runInSafeMode) {
      // Delete files from S3 for partial upload.
      await deleteFilesByPrefix(bookPrefixToDelete, env);
    }
    log(
      `${
        runInSafeMode ? "Safe Mode. Would have deleted" : "Deleted"
      } files with prefix ${bookPrefixToDelete} from S3.`
    );

    if (book.baseUrl === undefined) {
      if (!runInSafeMode) {
        // Delete new book record which was never fully created.
        await parseServer.deleteBookRecord(book.objectId, sessionToken);
      }
      log(
        `${
          runInSafeMode ? "Safe Mode. Would have deleted" : "Deleted"
        } book record with ID ${book.objectId}.`
      );
    } else {
      if (!runInSafeMode) {
        // Update book record to remove uploadPendingTimestamp.
        await parseServer.modifyBookRecord(
          book.objectId,
          {
            uploadPendingTimestamp: null,
          },
          sessionToken
        );
      }
      log(
        `${
          runInSafeMode ? "Safe Mode. Would have updated" : "Updated"
        } book record with ID ${
          book.objectId
        } to remove uploadPendingTimestamp.`
      );
    }
  }
}
