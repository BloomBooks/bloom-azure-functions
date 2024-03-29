import { setNeglectXmlNamespaces } from "./catalog";
import { setResultXml, xexpect as expect } from "../common/xmlUnitTestUtils";
import BookEntry, { getLevelText, getNumberValueFromTags } from "./bookentry";

var book: any = {};
const kTestBookId = "abcdef";
// It appears we extract the title from the baseUrl and then use that in totally different urls (bloomd)
const titleInTheBaseUrl = "titleFromTheBaseUrl";
const kTestBookBaseUrl = `https://s3.amazonaws.com/BloomLibraryBooks/uploader/${titleInTheBaseUrl}`;

function computeEntry() {
  const xml = BookEntry.getOpdsEntryForBook(book, false, "", "");
  // console.log(xml);
  setResultXml(xml);
}

describe("BookEntry", () => {
  beforeEach(() => {
    setNeglectXmlNamespaces();

    // we reset the values in our test book in `beforeEach()` so that a test can modify it before constructing the OPDS Entry
    book = {
      objectId: kTestBookId,
      tags: ["topic:Story Book", "computedLevel:3"],
      langPointers: [
        {
          objectId: "i6YEieQEDU",
          isoCode: "fil",
          name: "Filipino",
          ethnologueCode: "fil",
          createdAt: "2017-11-18T07:33:48.862Z",
          updatedAt: "2021-11-18T13:39:16.418Z",
          usageCount: 10,
          __type: "Object",
          className: "language",
        },
        {
          objectId: "vTo23jVYzz",
          isoCode: "en",
          name: "English",
          ethnologueCode: "eng",
          createdAt: "2014-06-05T21:39:29.436Z",
          updatedAt: "2021-11-18T13:39:15.293Z",
          englishName: "English",
          usageCount: 3607,
          __type: "Object",
          className: "language",
        },
        {
          objectId: "ktQwLG70lg",
          isoCode: "fr",
          name: "français",
          ethnologueCode: "fra",
          createdAt: "2014-06-30T20:35:42.321Z",
          updatedAt: "2021-11-18T13:39:15.652Z",
          usageCount: 142,
          englishName: "French",
          __type: "Object",
          className: "language",
        },
        {
          objectId: "ot9wdFBdII",
          isoCode: "bo",
          name: "Tibetan",
          createdAt: "2016-09-27T18:37:06.126Z",
          updatedAt: "2021-11-18T13:39:16.105Z",
          ethnologueCode: "bod",
          usageCount: 16,
          __type: "Object",
          className: "language",
        },
      ],
      bookInstanceId: "e62e76e7-da4d-4e6c-9c67-473f13272133",
      title: "my main title",
      allTitles:
        '{"bo":"ཟླ་དཀར་དང་ཞྭ་མོ།།","en":"The Moon and the Cap","fil":"Ang Buwan at ang Sombrero","fr":"La lune et la casquette"}',
      baseUrl: kTestBookBaseUrl,
      isbn: "",
      license: "cc-by",
      licenseNotes: null,
      copyright: "Copyright © 2018, Joselito B. Ucag",
      credits:
        'Originally published by Pratham Books,  a not-for-profit organization that publishes quality books for children in multiple Indian languages. Their mission is to "see a book in every child\'s hand" and democratize the joy of reading.\r\nwww.prathambooks.org',
      summary: null,
      pageCount: 17,
      uploader: {
        objectId: "0YpcRpEw66",
        id: "",
        username: "joe@example.com",
        emailVerified: true,
        createdAt: "2018-11-01T14:32:41.139Z",
        updatedAt: "2018-11-18T04:43:50.011Z",
        ACL: { "*": [Object], "0YpcRpEw66": [Object] },
        __type: "Object",
        className: "_User",
      },
      leveledReaderLevel: 0,

      createdAt: "2018-11-14T09:41:02.365Z",
      updatedAt: "2020-11-19T15:36:27.921Z",
      harvestStartedAt: { __type: "Date", iso: "2020-11-19T15:36:07.716Z" },
      harvestState: "Done",
      features: [],
      show: {
        pdf: {},
        epub: { harvester: true },
        bloomReader: { harvester: true },
        readOnline: { harvester: true },
      },
      originalPublisher: "Pratham Books",
    };
  });
  it("should be sensitive to epub Only setting", () => {
    book.show["epub"] = false;
    expect(BookEntry.getOpdsEntryForBook(book, true, "", "")).toBe(
      "<!-- omitting a book because of artifact settings -->"
    );
  });

  it("should be sensitive to DRAFT setting", () => {
    book.draft = true;
    expect(BookEntry.getOpdsEntryForBook(book, false, "", "")).toBe(
      "<!-- omitting a book because it is in DRAFT -->"
    );
  });

  it("should include referrer tag", () => {
    const xml = BookEntry.getOpdsEntryForBook(book, false, "", "example tag");
    setResultXml(xml);
    expect("//link[@title='ePUB']/@href").toContainText("ref=example%20tag");
    expect("//link[@title='PDF']/@href").toContainText("ref=example%20tag");
    expect("//link[@title='bloomPUB']/@href").toContainText(
      "ref=example%20tag"
    );
    expect("//link[@title='Read On Bloom Library']/@href").toContainText(
      "ref=example%20tag"
    );
    expect("//link[@title='Bloom Library Page']/@href").toContainText(
      "ref=example%20tag"
    );
  });

  // librarian needs to approve it first
  it("don't include if it has tag:incoming", () => {
    book.tags.push("system:Incoming");
    expect(BookEntry.getOpdsEntryForBook(book, false, "", "")).toBe(
      "<!-- omitting a book because it is awaiting site policy review -->"
    );
  });
  it("should be sensitive to inCirculation setting", () => {
    book.inCirculation = false;
    expect(BookEntry.getOpdsEntryForBook(book, false, "", "")).toBe(
      "<!-- omitting a book because it is out of circulation -->"
    );
  });
  it("should give PDF link if allowed", () => {
    testArtifactLink(
      "pdf",
      "PDF",
      `https://api.bloomlibrary.org/v1/fs/upload/${kTestBookId}/${titleInTheBaseUrl}.pdf`,
      true
    );
  });
  it("should give bloomPUB link if allowed", () => {
    testArtifactLink(
      "bloomReader",
      "bloomPUB",
      `https://api.bloomlibrary.org/v1/fs/harvest/${kTestBookId}/${titleInTheBaseUrl}.bloomd`
    );
  });

  // bloomSource is a new artifact type that we plan to implement
  it("should not crash if bloomSource 'show' isn't implemented yet", () => {
    book.show["bloomSource"] = undefined;
    computeEntry();
    const xpath = `entry/link[@title='bloomSource']`;
    expect(xpath).toHaveCount(0);
  });

  it("should give bloomSource link if exists & allowed", () => {
    testArtifactLink(
      "bloomSource",
      "bloomSource",
      `https://api.bloomlibrary.org/v1/fs/harvest/${kTestBookId}/${titleInTheBaseUrl}.bloomSource`
    );
  });
  it("should give epub link if allowed", () => {
    testArtifactLink(
      "epub",
      "ePUB",
      `https://api.bloomlibrary.org/v1/fs/harvest/${kTestBookId}/epub/${titleInTheBaseUrl}.epub`
    );
  });

  it("should give read online link if allowed", () => {
    testArtifactLink(
      "readOnline",
      "Read On Bloom Library",
      `https://bloomlibrary.org/player/${kTestBookId}`
    );
  });

  it("should always show link to Bloom Library Page", () => {
    //expect("entry/link[@title='Bloom Library Page']").toContainText("f");
    expect("entry/link[@title='Bloom Library Page']").toHaveCount(1);

    expect("entry/link[@title='Bloom Library Page']").toHaveAttributeValue(
      "href",
      `https://bloomlibrary.org/book/${kTestBookId}`
    );
  });

  it("should not give PDF link if artifact does not exist", () => {
    expect("entry/link[@title='PDF']").toHaveCount(1);

    book.show.pdf.exists = false;
    computeEntry();
    expect("entry/link[@title='PDF']").toHaveCount(0);
  });

  it("subject entry is present iff book has a topic", async () => {
    book.tags = ["topic:Dogs", "computedLevel:3"];
    computeEntry();
    expect("entry/subject").toHaveCount(1);
    expect("entry/subject").toHaveText("dogs");
    book.tags = ["computedLevel:3"];
    computeEntry();
    expect("entry/subject").toHaveCount(0);
  });

  it("should include bloom:level entry iff book has a level or computedLevel", async () => {
    // The real entries are bloom:level, but for unit tests, we ignore namespaces.

    book.tags = ["level:1"];
    computeEntry();
    expect(`entry/level`).toHaveCount(1);
    expect(`entry/level`).toHaveText(getLevelText(1));

    book.tags = ["computedLevel:2"];
    computeEntry();
    expect(`entry/level`).toHaveCount(1);
    expect(`entry/level`).toHaveText(getLevelText(2));

    // level wins over computedLevel
    book.tags = ["level:3", "computedLevel:4"];
    computeEntry();
    expect(`entry/level`).toHaveCount(1);
    expect(`entry/level`).toHaveText(getLevelText(3));

    // if there's no level or computedLevel, don't include the entry
    book.tags = ["topic:Dogs"];
    computeEntry();
    expect(`entry/level`).toHaveCount(0);
  });

  it("getNumberValueFromTags parses numbers, non-numbers, and missing tags correctly", () => {
    const tags = ["level:1", "computedLevel:0", "topic:Dogs"];
    let result;
    result = getNumberValueFromTags(tags, "level:");
    expect(result).toBe(1);

    result = getNumberValueFromTags(tags, "computedLevel:");
    expect(result).toBe(0);

    result = getNumberValueFromTags(tags, "topic:");
    expect(Number.isNaN(result)).toBeTruthy();

    result = getNumberValueFromTags(tags, "prefixNotPresent:");
    expect(result).toBe(undefined);
  });

  it("should include an hreflang attribute for each pdf and epub link", () => {
    computeEntry();
    // When we haven't added a langTag, none of the artifact links should have an hreflang attribute
    for (const artifactName of [
      "PDF",
      "ePUB",
      "Read On Bloom Library",
      "bloomPUB",
    ]) {
      const xpath = `entry/link[@title='${artifactName}']`;
      expect(xpath).toHaveCount(1);
      const xpathWithHreflang = `${xpath}[@hreflang]`;
      expect(xpathWithHreflang).toHaveCount(0);
    }
    // Add langTags for pdf and epub and check that they go into hreflang attributes
    book.show.pdf.langTag = "fr";
    book.show.epub.langTag = "fr";
    computeEntry();
    expect("entry/link[@title='PDF']").toHaveAttributeValue("hreflang", "fr");
    expect("entry/link[@title='ePUB']").toHaveAttributeValue("hreflang", "fr");
  });
});

function testArtifactLink(
  artifactName: string,
  linkTitle: string,
  url: string,
  shouldHaveLinkIfEverythingIsUndefined?: boolean // only for pdf
) {
  if (!book.show[artifactName]) book.show[artifactName] = {};
  book.show[artifactName].harvester = true;
  book.show[artifactName].librarian = true;
  book.show[artifactName].user = true;
  computeEntry();
  const xpath = `entry/link[@title='${linkTitle}']`;
  expect(xpath).toHaveCount(1);
  expect(xpath).toHaveAttributeValue("href", `${url}`);

  // if the user turns it off, don't offer it
  book.show[artifactName].user = false;
  book.show[artifactName].harvester = true;
  book.show[artifactName].librarian = true;
  computeEntry();
  expect(xpath).toHaveCount(0);

  // if the harvester turns it off and user & librarian opinions are unknown, don't show it
  book.show[artifactName].user = undefined;
  book.show[artifactName].librarian = undefined;
  book.show[artifactName].harvester = false;
  computeEntry();
  expect(xpath).toHaveCount(0);

  book.show[artifactName].user = undefined;
  book.show[artifactName].librarian = undefined;
  book.show[artifactName].harvester = undefined;
  computeEntry();
  expect(xpath).toHaveCount(shouldHaveLinkIfEverythingIsUndefined ? 1 : 0);

  book.show[artifactName] = undefined;
  computeEntry();
  expect(xpath).toHaveCount(shouldHaveLinkIfEverythingIsUndefined ? 1 : 0);

  book.show = undefined;
  computeEntry();
  expect(xpath).toHaveCount(shouldHaveLinkIfEverythingIsUndefined ? 1 : 0);

  // enhance: we could test other combinations. The `bookEntry.shouldWePublishArtifact()` code that implements
  // this logic is pretty simple, however, so I'm not highly motivated to test each combination.
}
