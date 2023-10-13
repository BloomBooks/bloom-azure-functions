import { xexpect as expect } from "../common/xmlUnitTestUtils";
import { getApiAccount } from "./apiAccount";
import BloomParseServer, { Environment } from "../common/BloomParseServer";

describe("OPDS API Key Handling using DEV database", () => {
  beforeAll(() => {
    jest.setTimeout(10 * 1000);
    BloomParseServer.DefaultSource = Environment.DEVELOPMENT;

    if (!process.env["bloomParseServerCatalogServicePassword"]) {
      throw Error(
        "bloomParseServerCatalogServicePassword needs to be in the environment variables. See README for more info."
      );
    }
  });
  it("gives error if no API key at all", async () => {
    expect((await getApiAccount("")).resultCode).toBe(401);
  });
  it("gives error if API key appears wrong", async () => {
    jest.setTimeout(1000 * 10);
    expect((await getApiAccount("bogus")).resultCode).toBe(403);
  });
  it("gives 503 error if API cannot be checked at the moment", async () => {
    expect((await getApiAccount("pretend-parse-server-down")).resultCode).toBe(
      503
    );
  });
  it("can login", async () => {
    jest.setTimeout(1000 * 10);
    const answer = await BloomParseServer.loginAsCatalogService();
    // console.log(answer);
    expect(answer).toBeTruthy();
  });

  it("finds the unit-test-account on dev server", async () => {
    if (!process.env["bloomParseSeverUnitTestApiAccountObjectId"]) {
      throw Error(
        "bloomParseSeverUnitTestApiAccountObjectId needs to be in the environment variables. See README for more info."
      );
    }
    const answer = await getApiAccount(
      `unit-test@example.com:${process.env["bloomParseSeverUnitTestApiAccountObjectId"]}`
    );
    // console.log(answer);
    expect(answer.errorMessage).toBeFalsy();
    expect(answer.resultCode).toBe(0);
    expect(answer.account).toBeTruthy();
    expect(answer.account?.embargoDays).toBe(undefined); // undefined means default. This is different from 0, which means no embargo.
    expect(answer.account?.user.username).toBe("unit-test@example.com");
    expect(answer.account?.referrerTag).toBe("unit-test-account");
  });
});
