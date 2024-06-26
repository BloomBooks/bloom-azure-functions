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
    myUserId = userInfo!.objectId;
  });
  beforeEach(() => {});

  afterAll(async function () {
    const testBooks = (
      await parseServer.getBooks(
        `{"bookInstanceId":{"$eq":"${testBookInstanceId}"}}`
      )
    ).books;
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

  // This is actually testing parse cloud code; we didn't find a good way to test the logic there.
  // Originally, this test lived in BloomDesktop but we moved it here so we could get rid of all traces of parse server from the editor.
  // Eventually, we will likely move the code which handles setting the tag and harvestState out of cloud code into uploadFinish. But we can't do that until all upload clients are using the API.
  it("parse cloud code sets system:Incoming and harvestState", async () => {
    const newBookRecord = {
      title: "test book",
      bookInstanceId: testBookInstanceId,
      updateSource: "BloomDesktop_azureFunctionUnitTest (new book)",
      uploadPendingTimestamp: 123456,
      inCirculation: false,
      uploader: {
        __type: "Pointer",
        className: "_User",
        objectId: myUserId,
      },
      languageDescriptors: [testLangParams],
    };
    const bookObjectId = await parseServer.createBookRecord(
      newBookRecord,
      token
    );
    const book = await parseServer.getBookByDatabaseId(bookObjectId);
    expect(book.tags[0]).toBe("system:Incoming");
    expect(book.harvestState).toBe("New");

    const sessionToken = await parseServer.loginAsUnitTestUser();
    await parseServer.modifyBookRecord(
      bookObjectId,
      {
        updateSource: "BloomDesktop azureFunctionUnitTest",
        harvestState: "bogusHarvestState",
        tags: ["bogusTag"],
      },
      sessionToken
    );
    const modifiedBook = await parseServer.getBookByDatabaseId(bookObjectId);
    expect(modifiedBook.harvestState).toBe("Updated");
    expect(modifiedBook.tags).toContain("system:Incoming");
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
    const book = await parseServer.getBookByDatabaseId(bookObjectId);
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
    const book2 = await parseServer.getBookByDatabaseId(bookObjectId);
    expect(book2.title).toBe("new title");
    expect(book2.uploadPendingTimestamp).toBeFalsy();

    await parseServer.deleteBookRecord(bookObjectId, token);
    const shouldBeDeletedBook = await parseServer.getBookByDatabaseId(
      bookObjectId
    );
    expect(shouldBeDeletedBook).toBeFalsy();
  });

  const testLangParams = {
    isoCode: "foo",
    name: "bar",
    ethnologueCode: "baz",
  };

  it("can get, create and delete languages", async () => {
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

  it("getBookCountByLanguage returns expected number of books", async () => {
    const testLanguageId = await parseServer.getOrCreateLanguage(
      testLangParams
    );
    const oldBooksWithTestLang = (
      await parseServer.getBooks(
        `{"langPointers":{"$in":[{"__type":"Pointer","className":"language","objectId":"${testLangParams.isoCode}"}]}}`
      )
    ).books;
    for (const book of oldBooksWithTestLang) {
      await parseServer.deleteBookRecord(book.objectId, token);
    }
    // create 3 books in the test language
    for (let i = 0; i < 3; i++) {
      const newBookRecord = {
        title: `testGetBookCountByLanguage book ${i}`,
        bookInstanceId: "testGetBookCountByLanguage",
        updateSource: "AzureFunctionsUnitTest",
        uploader: {
          __type: "Pointer",
          className: "_User",
          objectId: myUserId,
        },
        langPointers: [
          {
            __type: "Pointer",
            className: "language",
            objectId: testLanguageId,
          },
        ],
      };
      await parseServer.createBookRecord(newBookRecord, token);
    }

    const count = await parseServer.getBookCountByLanguage(
      testLangParams.isoCode
    );
    expect(count).toBe(3);
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
