import BloomParseServer from "../common/BloomParseServer";
import { Environment } from "../common/utils";
import { bookCleanupInternal } from "./bookCleanup";

let token: string;
let myUserId: string;

async function testIfBookGetsCleanedUp(
  shouldGetCleanedUp: boolean,
  bookInfo: any
) {
  BloomParseServer.Source = Environment.UNITTEST;
  const bookBeforeCleaning = await BloomParseServer.createBookRecord(
    bookInfo,
    token
  );
  expect(bookBeforeCleaning).toBeTruthy();
  await bookCleanupInternal(Environment.UNITTEST);
  const bookAfterCleaning = await BloomParseServer.getBookInfoByObjectId(
    bookBeforeCleaning
  );
  if (shouldGetCleanedUp) {
    expect(bookAfterCleaning).toBeFalsy();
  } else {
    expect(bookAfterCleaning).toBeTruthy();
  }
}

describe("bookCleanup", () => {
  beforeAll(async function () {
    BloomParseServer.Source = Environment.UNITTEST;
    token = await BloomParseServer.loginAsUser(
      "unittest@example.com",
      "unittest"
    );
    const userInfo = await BloomParseServer.getLoggedInUserInfo(token);
    myUserId = userInfo.objectId;
  });
  beforeEach(async function () {});

  it("bookCleanupInternal() deletes books older than 24 hours", async () => {
    BloomParseServer.Source = Environment.UNITTEST;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const newBookRecordToBeCleanedUp = {
      title: "unit test book cleanup to be cleaned up",
      bookInstanceId: "testBookInstanceId",
      updateSource: "AzureFunctionsUnitTest",
      uploadPendingTimestamp: twoDaysAgo,
      inCirculation: false,
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: "testUserId",
      },
    };
    testIfBookGetsCleanedUp(true, newBookRecordToBeCleanedUp); // TODO this should fail...

    const newBookRecordToBeKept = {
      title: "unit test book cleanup to be kept",
      bookInstanceId: "testBookInstanceId",
      updateSource: "AzureFunctionsUnitTest",
      uploadPendingTimestamp: twoHoursAgo,
      inCirculation: false,
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: myUserId,
      },
    };
    testIfBookGetsCleanedUp(false, newBookRecordToBeKept);

    // TODO test books that do and don't have uploadPendingTimestamp, etc

    // const bookToBeCleanedId = await BloomParseServer.createBookRecord(
    //   newBookRecordToBeCleanedUp,
    //   token
    // );
    // const bookToBeCleaned = await BloomParseServer.getBookInfoByObjectId(
    //   bookToBeCleanedId
    // );
    // expect(bookToBeCleaned).toBeTruthy();
    // const newBookRecordToBeKept = {
    //   title: "unit test book cleanup to be kept",
    //   bookInstanceId: "testBookInstanceId",
    //   updateSource: "AzureFunctionsUnitTest",
    //   uploadPendingTimestamp: twoHoursAgo,
    //   inCirculation: false,
    //   uploader: {
    //     __type: "Pointer",
    //     className: "_User",
    //     objectId: myUserId,
    //   },
    // };
    // const bookToBeKeptId = await BloomParseServer.createBookRecord(
    //   newBookRecordToBeKept,
    //   token
    // );
    // const bookToBeKept = await BloomParseServer.getBookInfoByObjectId(
    //   bookToBeKeptId
    // );
    // expect(bookToBeKept).toBeTruthy();

    // await bookCleanupInternal(Environment.UNITTEST);

    // const bookToBeCleanedAfterCleanup =
    //   await BloomParseServer.getBookInfoByObjectId(bookToBeCleanedId);
    // expect(bookToBeCleanedAfterCleanup).toBeFalsy();
    // const bookToBeKeptAfterCleanup =
    //   await BloomParseServer.getBookInfoByObjectId(bookToBeKeptId);
    // expect(bookToBeKeptAfterCleanup).toBeTruthy();
  });
  afterAll(async () => {});
});
