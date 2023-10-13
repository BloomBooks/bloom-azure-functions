import BloomParseServer, { Environment } from "./BloomParseServer";

describe("BloomParseServer", () => {
  beforeAll(() => {
    //  project = Project.fromDirectory("sample data/Edolo sample");
  });
  beforeEach(() => {});
  it("getLanguages() returns a reasonable number of languages", async () => {
    BloomParseServer.Source = Environment.PRODUCTION;
    const langs = await BloomParseServer.getLanguages();
    expect(langs.length).toBeGreaterThan(500);
  });

  /* This is extremely fragile, as it relies on certain books being there AND being a certain number of days old!
    I haven't thought of an affordable way to just keep it working.  Therefore you pretty much have to customize it
    to run it

  it("getBooks() returns expected number of Hausa books, using embargo days", async () => {
    BloomParseServer.Source = Environment.DEVELOPMENT;
    const allFoobarBooks = await BloomParseServer.getBooks("de", 0);
    expect(allFoobarBooks.length).toBe(4);
    const oldFoobarBooks = await BloomParseServer.getBooks("de", 194);
    expect(oldFoobarBooks.length).toBe(3);
  });


  */
});
