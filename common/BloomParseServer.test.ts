import BloomParseServer from "./BloomParseServer";

describe("BloomParseServer", () => {
  beforeAll(() => {
    //  project = Project.fromDirectory("sample data/Edolo sample");
  });
  beforeEach(() => {});
  it("getLanguages() returns a reasonable number of languages", async () => {
    const langs = await BloomParseServer.getLanguages();
    expect(langs.length).toBeGreaterThan(500);
  });
});
