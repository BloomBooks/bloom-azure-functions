import Catalog from "./catalog";
import {
  setResultXml,
  xexpect as expect,
  count,
  value,
} from "../common/xmlUnitTestUtils";

describe("OPDS Root", () => {
  beforeAll(async () => {
    const xml = await Catalog.getCatalog("foo", { skip_namespaces: "true" });
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});
  it("root has reasonable number of language links", () => {
    expect("feed").toHaveCount(1);
    expect("feed/link").toHaveAtLeast(500);
    expect("feed/entry").toHaveCount(0);
  });
});

describe("OPDS Gawri language page", () => {
  beforeAll(async () => {
    const xml = await Catalog.getCatalog("foo", {
      skip_namespaces: "true",
      lang: "gwc",
    });
    setResultXml(xml);
  });
  beforeEach(() => {});
  it("Has some entries", async () => {
    expect("feed/entry").toHaveAtLeast(10);
  });
});
