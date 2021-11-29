import Catalog, { CatalogType, setNeglectXmlNamespaces } from "./catalog";
import { setResultXml, xexpect as expect } from "../common/xmlUnitTestUtils";
import BloomParseServer, {
  BloomParseServerMode,
} from "../common/BloomParseServer";

describe("OPDS Catalog Root", () => {
  beforeAll(async () => {
    jest.setTimeout(1000 * 10);
    Catalog.DefaultEmbargoDays = 0; // otherwise the counts will change with time even if noone touches the books
    setNeglectXmlNamespaces();
    const xml = await Catalog.getCatalog("https://base-url-for-unit-test", {});
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});

  it("has navigation links required by opds spec", async () => {
    expect('feed/link[@rel="self"]').toHaveCount(1);
    expect("feed/link[@rel='start']").toHaveCount(1);
    expect("feed/link[@rel='up']").toHaveCount(1);
  });

  it("has reasonable number of language links", () => {
    expect("feed").toHaveCount(1);
    expect("feed/link").toHaveAtLeast(400); // note, this will be < the number of language rows, because we have to consolidate duplicates
  });
  it("does not list any books", () => {
    expect("feed/entry").toHaveCount(0);
  });
});

async function makeCatalog(
  params: object,
  requiresCatalogElementsThatRequireQueryingExternalServer?: boolean
) {
  const xml = await Catalog.getCatalog(
    "https://example.org",
    params,
    undefined,
    !requiresCatalogElementsThatRequireQueryingExternalServer
  );
  //console.log(xml);
  setResultXml(xml);
}
describe("OPDS Catalog language links", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
    await makeCatalog({}, true);
  });

  it("does not list the same language (by isoCode) twice", async () => {
    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and @iso="fr"]'
    ).toHaveCount(1);
  });

  it("adds up all the usages of the various duplicate languages (by isoCode)", async () => {
    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and @iso="fr"]/@atMost'
    ).toBeIntGreaterThan(400);
  });
  it("uses the language name that is mostly commonly used among duplicates", async () => {
    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and @iso="fr"]/@title'
    ).toHaveText("French");
  });
  /* enhance: this capability not implemented AND writing the test will be expensive (currently we're testing against live and changeable database, sigh.)
  it("adds up the usage count of all duplicate languages (by isoCode)", async () => {});
  */
});

describe("OPDS Catalog navigation hrefs", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
  });

  it("hrefs in navigation links carry the src param", async () => {
    await makeCatalog({ src: BloomParseServerMode.DEVELOPMENT });
    expect('feed/link[@rel="self"]/@href').toContainText("src=dev");

    // since production is the default, we don't want to list it when it is chosen
    await makeCatalog({ src: BloomParseServerMode.PRODUCTION });
    expect('feed/link[@rel="self" and contains(@href,"src")]').toHaveCount(0);

    await makeCatalog({});
    expect('feed/link[@rel="self" and contains(@href,"src")]').toHaveCount(0);
  });

  it("hrefs in navigation links carry the type param", async () => {
    await makeCatalog({ type: CatalogType.EPUB });
    expect('feed/link[@rel="self"]/@href').toContainText("type=epub");

    // since "all" artifact types is the default, we don't want to list it when it is chosen
    await makeCatalog({ type: CatalogType.ALL });
    expect('feed/link[@rel="self" and contains(@href,"type")]').toHaveCount(0);

    await makeCatalog({});
    expect('feed/link[@rel="self" and contains(@href,"type")]').toHaveCount(0);
  });

  it("hrefs in navigation links carry the lang param", async () => {
    await makeCatalog({ lang: "fod" });
    expect('feed/link[@rel="self"]/@href').toContainText("lang=fod");

    // don't mention language if we want all of them
    await makeCatalog({});
    expect('feed/link[@rel="self" and contains(@href,"lang")]').toHaveCount(0);
  });

  it("hrefs in navigation links carry the apiAccount key param", async () => {
    await makeCatalog({ key: "pat@example.com:123abcd" });
    expect('feed/link[@rel="self"]/@href').toContainText(
      "key=pat%40example.com%3A123abcd"
    );

    // don't mention language if don't have a key (eventually we plan to always require a key, but not yet)
    await makeCatalog({});
    expect('feed/link[@rel="self" and contains(@href,"key")]').toHaveCount(0);
  });

  it("hrefs in language links carry the apiAccount key param", async () => {
    await makeCatalog({ key: "pat@example.com:123abcd" }, true);
    expect('feed/link[@rel="http://opds-spec.org/facet"]/@href').toContainText(
      "key=pat%40example.com%3A123abcd"
    );

    // don't mention language if don't have a key (eventually we plan to always require a key, but not yet)
    await makeCatalog({}, true);
    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and contains(@href,"key")]'
    ).toHaveCount(0);
  });

  // Note: The language link tests are expensive because they hit the ParseServer.
  // They don't need to exhaustively check each parameter... the hrefs are are running
  // the same code as the previous tests on the navigation links, which have already
  // been tested above.
  // It is enough to test that one param is getting included,
  // and then that the "activeFacet" is working.
  it("hrefs in language links carry the type param", async () => {
    // since "all" artifact types is the default, we don't want to list it when it is chosen
    await makeCatalog(
      {
        type: CatalogType.EPUB,
        src: BloomParseServerMode.PRODUCTION,
        lang: "fr",
      },
      true
    );
    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and contains(@href,"type")]'
    ).toHaveAtLeast(300);

    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and contains(@href,"lang")]'
    ).toHaveAtLeast(300);

    expect(
      'feed/link[@rel="http://opds-spec.org/facet" and contains(@href,"lang=fr") and @facetGroup="Languages" and @activeFacet="true"]'
    ).toHaveCount(1);
  });
});

describe("OPDS Tibetan language page", () => {
  beforeAll(async () => {
    setNeglectXmlNamespaces();
    Catalog.DefaultEmbargoDays = 0; // otherwise the counts will change with time even if noone touches the books
    BloomParseServer.Source = BloomParseServerMode.PRODUCTION;
    const xml = await Catalog.getCatalog("https://base-url-for-unit-test", {
      lang: "bo",
    });
    //console.log(xml);
    setResultXml(xml);
  });
  beforeEach(() => {});

  it("has some entries", async () => {
    expect("feed/entry").toHaveAtLeast(17); // in Nov 2021 there are 19 with 2 out of circulation, though really it's just 2 books repeated
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
