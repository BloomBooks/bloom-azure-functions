import Catalog, { setNeglectXmlNamespaces } from "./catalog";
import {
  select,
  setResultXml,
  logTailResultXml,
  xexpect as expect,
} from "../common/xmlUnitTestUtils";

describe("OPDS Root", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
    const xml = await Catalog.getCatalog("unused", {});
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});
  it("has reasonable number of language links", () => {
    expect("feed").toHaveCount(1);
    expect("feed/link").toHaveAtLeast(500);
  });
  it("does not list any books", () => {
    expect("feed/entry").toHaveCount(0);
  });
});

describe("OPDS Tibetan language page", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
    const xml = await Catalog.getCatalog("unused", {
      lang: "bo",
    });
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});
  it("has some entries", async () => {
    expect("feed/entry").toHaveAtLeast(16); // there are 16 in Nov 2021, though really it's just 2 books repeated
    expect("feed/entry").toHaveAtMost(500); // I wanted a small number to catch likely errors, but didn't make it through review :-)
  });

  it("when multiple subjects are available, each gets its own element", async () => {
    // there was some mystery around the title... I couldn't just match the whole thing
    const xpath = "feed/entry[title[contains(text(),'Tashi')]]";
    expect(xpath).toHaveCount(1);
    expect(xpath + "/subject[1]").toMatch("community living");
    expect(xpath + "/subject[2]").toMatch("culture");
  });

  it("has various links", async () => {
    // there was some mystery around the title... I couldn't just match the whole thing
    const xpath = "feed/entry[title[contains(text(),'Tashi')]]";
    expect(xpath).toHaveCount(1);

    //logTailResultXml(500);

    expect(xpath + "/link[@title='Bloom Library Page']").toHaveCount(1);

    expect(xpath + "/link[@title='Bloom Library Page']").toHaveAttributeValue(
      "href",
      "https://bloomlibrary.org/book/NXVaHwbNTH"
    );
    expect(
      xpath + "/link[@title='Read On Bloom Library']"
    ).toHaveAttributeValue(
      "href",
      "https://bloomlibrary.org/player/NXVaHwbNTH"
    );
    expect(xpath + "/link[@title='bloomPUB']").toHaveAttributeValue(
      "href",
      "https://api.bloomlibrary.org/v1/fs/harvest/NXVaHwbNTH/I+Am+Tashi.bloomd"
    );
  });
});

describe("OPDS Waray-Waray language page", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
    const xml = await Catalog.getCatalog("unused", {
      lang: "war",
    });
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});

  it("if book has no topic, no subject is given", async () => {
    const xpath = "feed/entry[title[text()='Kunta Huybes kada Adlaw']]";
    expect(xpath).toHaveCount(1);
    expect(xpath + "/subject").toHaveCount(0);
  });
});
