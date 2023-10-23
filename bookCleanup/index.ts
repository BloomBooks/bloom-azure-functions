import { AzureFunction, Context } from "@azure/functions";
import BloomParseServer from "../common/BloomParseServer";
import { deleteBook } from "../common/s3";
import { Environment } from "../common/utils";

const runEvenIfLocal: boolean = false;

const bookCleanup: AzureFunction = async function (
  context: Context,
  dailyTimer: any
): Promise<void> {
  context.log("bookCleanup trigger function started", new Date().toISOString());

  if (dailyTimer.isPastDue) {
    context.log("bookCleanup trigger function is running late");
  }

  try {
    await bookCleanupInternal(Environment.DEVELOPMENT);
    // TODO uncomment once this is thoroughly tested. We'll need to be careful since it involves deleting books!
    // await bookCleanupInternal(Environment.PRODUCTION);
    context.log("book cleanup succeeded");
  } catch (e) {
    context.log("book cleanup failed", e);
  }

  context.log(
    "bookCleanup trigger function finished",
    new Date().toISOString()
  );
  context.done();
};

async function bookCleanupInternal(env: Environment) {
  BloomParseServer.setServer(env);
  const sessionToken = await BloomParseServer.loginAsBookCleanupUser();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
  const booksToBeCleanedUp = await BloomParseServer.getBooks(
    `{"uploadPendingTimestamp":{"$lt":${cutoff}}}`
  );
  for (const book of booksToBeCleanedUp) {
    const bookPrefixToDelete = `${book.objectId}/${book.uploadPendingTimestamp}`;
    await deleteBook(bookPrefixToDelete, env);
    if (book.baseUrl === undefined) {
      await BloomParseServer.deleteBookRecord(book.objectId, sessionToken);
    } else {
      await BloomParseServer.modifyBookRecord(
        book.objectId,
        {
          uploadPendingTimestamp: null,
        },
        sessionToken
      );
    }
  }
}

export default bookCleanup;

// TODO make this back into a timer trigger
