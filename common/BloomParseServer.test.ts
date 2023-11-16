import BloomParseServer from "../common/BloomParseServer";
import { Environment } from "./utils";

// give all the books we create here this bookInstanceId by which to delete them all after
const testBookInstanceId = "azureFunctionBloomParseServerTests";

let parseServer: BloomParseServer;
let token: string;
let myUserId: string;
describe("BloomParseServer", () => {
  beforeAll(async function () {
    parseServer = new BloomParseServer(Environment.UNITTEST);

    token = await parseServer.loginAsUser("unittest@example.com", "unittest");
    const userInfo = await parseServer.getLoggedInUserInfo(token);
    myUserId = userInfo.objectId;
  });
  beforeEach(() => {});

  afterAll(async function () {
    const testBooks = await parseServer.getBooks(
      `{"bookInstanceId":{"$eq":"${testBookInstanceId}"}}`
    );
    for (const book of testBooks) {
      await parseServer.deleteBookRecord(book.objectId, token);
    }
  });

  it("getLanguages() returns a reasonable number of languages", async () => {
    const langs = await new BloomParseServer(
      Environment.PRODUCTION
    ).getLanguages();
    expect(langs.length).toBeGreaterThan(500);
  });

  it("successfully creates, modifies, and deletes Book records", async () => {
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
    const bookObjectId = await parseServer.createBookRecord(
      newBookRecord,
      token
    );
    const book = await parseServer.getBookInfoByObjectId(bookObjectId);
    expect(book.title).toBe(newBookRecord.title);
    expect(book.bookInstanceId).toBe(newBookRecord.bookInstanceId);
    expect(book.updateSource).toBe(newBookRecord.updateSource);
    expect(book.uploadPendingTimestamp).toBe(
      newBookRecord.uploadPendingTimestamp
    );
    expect(book.inCirculation).toBe(newBookRecord.inCirculation);
    expect(book.uploader.objectId).toBe(newBookRecord.uploader.objectId);

    await parseServer.modifyBookRecord(
      bookObjectId,
      { title: "new title", uploadPendingTimestamp: null },
      token
    );
    const book2 = await parseServer.getBookInfoByObjectId(bookObjectId);
    expect(book2.title).toBe("new title");
    expect(book2.uploadPendingTimestamp).toBeFalsy();

    await parseServer.deleteBookRecord(bookObjectId, token);
    const shouldBeDeletedBook = await parseServer.getBookInfoByObjectId(
      bookObjectId
    );
    expect(shouldBeDeletedBook).toBeFalsy();
  });

  it("can get, create and delete languages", async () => {
    const testLangParams = {
      isoCode: "foo",
      name: "bar",
      ethnologueCode: "baz",
    };
    const testLangParamString = JSON.stringify(testLangParams);
    const oldUnitTestLang = await parseServer.getLanguage(testLangParamString);
    const oldUnitTestLangId = oldUnitTestLang?.objectId;
    if (oldUnitTestLangId) {
      await parseServer.deleteLanguage(oldUnitTestLangId, token);
    }

    const oldLangIsStillThere = await parseServer.getLanguage(
      testLangParamString
    );
    expect(oldLangIsStillThere).toBeFalsy();

    const langId = await parseServer.getOrCreateLanguage(testLangParamString);
    expect(langId).toBeTruthy();
    const langId2 = await parseServer.getOrCreateLanguage(testLangParamString);
    expect(langId2).toBe(langId);
  });

  /* This is extremely fragile, as it relies on certain books being there AND being a certain number of days old!
    I haven't thought of an affordable way to just keep it working.  Therefore you pretty much have to customize it
    to run it

  it("getBooksForCatalog() returns expected number of Hausa books, using embargo days", async () => {
    BloomParseServer.setServer(Environment.DEVELOPMENT);
    const allFoobarBooks = await BloomParseServer.getBooksForCatalog("de", 0);
    expect(allFoobarBooks.length).toBe(4);
    const oldFoobarBooks = await BloomParseServer.getBooksForCatalog("de", 194);
    expect(oldFoobarBooks.length).toBe(3);
  });


  */
});
