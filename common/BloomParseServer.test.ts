import BloomParseServer from "../common/BloomParseServer";
import { Environment } from "./utils";

// give all the books we create here this bookInstanceId by which to delete them all after
const testBookInstanceId = "azureFunctionBloomParseServerTests";

let token: string;
let myUserId: string;
describe("BloomParseServer", () => {
  beforeAll(async function () {
    BloomParseServer.Source = Environment.UNITTEST;
    token = await BloomParseServer.loginAsUser(
      "unittest@example.com",
      "unittest"
    );
    const userInfo = await BloomParseServer.getLoggedInUserInfo(token);
    myUserId = userInfo.objectId;
  });
  beforeEach(() => {});

  afterAll(async function () {
    BloomParseServer.Source = Environment.UNITTEST;
    const testBooks = await BloomParseServer.getBooks(
      `{"bookInstanceId":{"$eq":"${testBookInstanceId}"}}`
    );
    for (const book of testBooks) {
      await BloomParseServer.deleteBookRecord(book.objectId, token);
    }
  });

  it("getLanguages() returns a reasonable number of languages", async () => {
    BloomParseServer.Source = Environment.PRODUCTION;
    const langs = await BloomParseServer.getLanguages();
    expect(langs.length).toBeGreaterThan(500);
  });

  it("succesfully creates, modifies, and deletes Book records", async () => {
    BloomParseServer.Source = Environment.UNITTEST;

    const newBookRecord = {
      title: "test book",
      bookInstanceId: testBookInstanceId,
      updateSource: "AzureFunctionsUnitTest",
      uploadPendingTimestamp: 123456,
      inCirculation: false,
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: myUserId,
      },
    };
    const bookObjectId = await BloomParseServer.createBookRecord(
      newBookRecord,
      token
    );
    const book = await BloomParseServer.getBookInfoByObjectId(bookObjectId);
    expect(book.title).toBe(newBookRecord.title);
    expect(book.bookInstanceId).toBe(newBookRecord.bookInstanceId);
    expect(book.updateSource).toBe(newBookRecord.updateSource);
    expect(book.uploadPendingTimestamp).toBe(
      newBookRecord.uploadPendingTimestamp
    );
    expect(book.uploadPendingTimestamp).not.toBeFalsy(); // we should have put an uploadPendingTimestamp so we can test clearing it below
    expect(book.inCirculation).toBe(newBookRecord.inCirculation);
    expect(book.uploader.objectId).toBe(newBookRecord.uploader.objectId);

    await BloomParseServer.modifyBookRecord(
      bookObjectId,
      { title: "new title", uploadPendingTimestamp: null },
      token
    );
    const book2 = await BloomParseServer.getBookInfoByObjectId(bookObjectId);
    expect(book2.title).toBe("new title");
    expect(book2.uploadPendingTimestamp).toBeFalsy();

    await BloomParseServer.deleteBookRecord(bookObjectId, token);
    const shouldBeDeletedBook = await BloomParseServer.getBookInfoByObjectId(
      bookObjectId
    );
    expect(shouldBeDeletedBook).toBeFalsy();
  });

  /* This is extremely fragile, as it relies on certain books being there AND being a certain number of days old!
    I haven't thought of an affordable way to just keep it working.  Therefore you pretty much have to customize it
    to run it

  it("getBooksForCatalog() returns expected number of Hausa books, using embargo days", async () => {
    BloomParseServer.Source = Environment.DEVELOPMENT;
    const allFoobarBooks = await BloomParseServer.getBooksForCatalog("de", 0);
    expect(allFoobarBooks.length).toBe(4);
    const oldFoobarBooks = await BloomParseServer.getBooksForCatalog("de", 194);
    expect(oldFoobarBooks.length).toBe(3);
  });


  */
});
