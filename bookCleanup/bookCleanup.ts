import BloomParseServer from "../common/BloomParseServer";
import { deleteBook } from "../common/s3";
import { Environment } from "../common/utils";

export async function bookCleanupInternal(env: Environment) {
  const parseServer = new BloomParseServer(env);

  const sessionToken = await parseServer.loginAsBookCleanupUser();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
  const booksToBeCleanedUp = await parseServer.getBooks(
    `{"uploadPendingTimestamp":{"$lt":${cutoff}}}`
  );
  for (const book of booksToBeCleanedUp) {
    const bookPrefixToDelete = `${book.objectId}/${book.uploadPendingTimestamp}`;
    await deleteBook(bookPrefixToDelete, env);
    if (book.baseUrl === undefined) {
      await parseServer.deleteBookRecord(book.objectId, sessionToken);
    } else {
      await parseServer.modifyBookRecord(
        book.objectId,
        {
          uploadPendingTimestamp: null,
        },
        sessionToken
      );
    }
  }
}
