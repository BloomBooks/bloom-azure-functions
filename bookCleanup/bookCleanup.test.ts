import BloomParseServer from "../common/BloomParseServer";
import {
  deleteFilesByPrefix,
  listPrefixContentsKeys,
  uploadTestFileToS3,
} from "../common/s3";
import { Environment } from "../common/utils";
import { bookCleanupInternal } from "./bookCleanup";

const testBookInstanceId = "azureFunctionBookCleanupTests";
const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
const recentTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

let parseServer: BloomParseServer;
let sessionToken: string;

const testBookEntries = {
  A: {
    title: "unit test book A", // old failed upload of new book
    bookInstanceId: testBookInstanceId,
    updateSource: "AzureFunctionsUnitTest",
    uploadPendingTimestamp: oldTimestamp,
    inCirculation: false,
    uploader: {
      __type: "Pointer",
      className: "_User",
      objectId: "testUserId",
    },
  },

  B: {
    title: "unit test book B", // recent incomplete upload of new book
    bookInstanceId: testBookInstanceId,
    updateSource: "AzureFunctionsUnitTest",
    uploadPendingTimestamp: recentTimestamp,
    inCirculation: false,
    uploader: {
      __type: "Pointer",
      className: "_User",
      objectId: "testUserId",
    },
  },
  C: {
    title: "unit test book C", // old failed upload of existing book
    bookInstanceId: testBookInstanceId,
    updateSource: "AzureFunctionsUnitTest",
    uploadPendingTimestamp: oldTimestamp,
    inCirculation: false,
    uploader: {
      __type: "Pointer",
      className: "_User",
      objectId: "testUserId",
    },
    baseUrl:
      "https://s3.amazonaws.com/BloomLibraryBooks/testBookId/someTimestamp/",
  },
};

const testBookIds = { A: "", B: "", C: "" };

async function cleanupParse() {
  // delete the entries created as part of these tests
  const remainingTestBookEntries = (
    await parseServer.getBooks(
      `{"bookInstanceId":{"$eq":"${testBookInstanceId}"}}`
    )
  ).books;
  for (const book of remainingTestBookEntries) {
    await parseServer.deleteBookRecord(book.objectId, sessionToken);
  }
}

async function cleanupS3Files() {
  // delete the files created as part of these tests
  for (const bookId of Object.values<string>(testBookIds)) {
    if (bookId) {
      await deleteFilesByPrefix(bookId.toString(), Environment.UNITTEST);
    }
  }
}

describe("bookCleanup", () => {
  beforeAll(async function () {
    parseServer = new BloomParseServer(Environment.UNITTEST);
    sessionToken = await parseServer.loginAsUser(
      "unittest@example.com",
      "unittest"
    );

    await cleanupParse();

    for (const bookLabel of Object.keys(testBookEntries)) {
      const bookEntry = testBookEntries[bookLabel];
      const bookId: string = await parseServer.createBookRecord(
        bookEntry,
        sessionToken
      );
      expect(bookId).toBeTruthy(); // make sure book records were successfully created
      testBookIds[bookLabel] = bookId; // keep track of ids for the tests to use
      await uploadTestFileToS3(
        // upload a file into the new book folder so we can see whether it gets deleted
        `${bookId}/${bookEntry.uploadPendingTimestamp}`,
        Environment.UNITTEST
      );
    }

    await uploadTestFileToS3(
      //book C imitates a preexisting book getting modified; upload "old" book file to make sure it doesn't get deleted
      `${testBookIds.C}/someOtherTimestamp`,
      Environment.UNITTEST
    );

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await bookCleanupInternal(Environment.UNITTEST, () => {});
  });
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  beforeEach(async function () {});
  afterAll(async () => {
    await cleanupParse();
    await cleanupS3Files();
  });

  it("deletes parse records for old failed uploads of new books", async () => {
    const bookAAfterCleaning = await parseServer.getBookByDatabaseId(
      testBookIds.A
    );
    expect(bookAAfterCleaning).toBeFalsy();
  });

  it("does not mess with recently created parse records of incomplete book uploads", async () => {
    const bookBAfterCleaning = await parseServer.getBookByDatabaseId(
      testBookIds.B
    );
    expect(bookBAfterCleaning).toBeTruthy();
    expect(bookBAfterCleaning.uploadPendingTimestamp).toBeTruthy();
  });
  it("removes the uploadPendingTimestamp but not the record for old failed updates of preexisting books", async () => {
    const bookCAfterCleaning = await parseServer.getBookByDatabaseId(
      testBookIds.C
    );
    expect(bookCAfterCleaning).toBeTruthy();
    expect(bookCAfterCleaning.uploadPendingTimestamp).toBeFalsy(); // test that we deleted the timestamp when cleaning up this old book
  });
  it("deletes s3 files for old failed uploads of new books", async () => {
    const bookARemainingFiles = await listPrefixContentsKeys(
      testBookIds.A,
      Environment.UNITTEST
    );
    expect(bookARemainingFiles.length).toBe(0);
  });
  it("does not delete the s3 files uploaded as part of a recent incomplete book upload", async () => {
    const bookBRemainingFiles = await listPrefixContentsKeys(
      testBookIds.B,
      Environment.UNITTEST
    );
    expect(bookBRemainingFiles.length).not.toBe(0);
  });
  it("deletes the s3 files uploaded as part of an old failed update of a preexisting book", async () => {
    const bookCFailedUploadFiles = await listPrefixContentsKeys(
      `${testBookIds.C}/${oldTimestamp}`,
      Environment.UNITTEST
    );
    expect(bookCFailedUploadFiles.length).toBe(0);
  });
  it("does not delete the original s3 files of a preexisting book after a failed update", async () => {
    const bookCOrigUploadFiles = await listPrefixContentsKeys(
      `${testBookIds.C}/someOtherTimestamp`,
      Environment.UNITTEST
    );
    expect(bookCOrigUploadFiles.length).not.toBe(0);
  });
});
