import BookEntry from "./bookentry";
import BloomParseServer, {
  ApiAccount,
  BloomParseServerMode,
} from "../common/BloomParseServer";

// NB: The OPDS catalogs from Global Digital Library and StoryWeaver both give both ePUB and pdf links,
// with sometimes only one or the other.  They also both provide links to two image files, one marked as
// a thumbnail.
export enum CatalogType {
  // nothing but links to the top-level catalogs
  TOP = "top",
  // ePUB artifacts only: no entry if no ePUB show allowed
  EPUB = "epub",
  // // bloomPUB artifacts only: no entry if no bloomPUB show allowed
  // This isn't worth implementing until BR is enhanced to directly download books from the internet.  At that
  // point it should be fairly trivial to implement, following the pattern of ePUB.  This is just here as a
  // placeholder to remind us what to do when the time comes.
  // BLOOMPUB = "bloomPUB",
  // all artifacts: ePUB, PDF, and bloomPUB; show entry without links even if no artifacts allowed
  ALL = "all",
}

// I've never achieved the magic of xpaths with namespaces, so, to my shame, this just turns them off.
var neglectXmlNamespaces: boolean;
export function setNeglectXmlNamespaces() {
  neglectXmlNamespaces = true;
}
export function getNeglectXmlNamespaces() {
  return neglectXmlNamespaces;
}

export default class Catalog {
  public static RootUrl: string; // based on original HttpRequest url
  public static DesiredLang: string; // value of &lang=XXX param (or "en" by default)

  public static DefaultEmbargoDays = 90; // unit tests will set this to 0 because else everything is just to fragile as things age

  public static async getCatalog(
    baseUrl: string,
    params: {
      [key: string]: string;
    },
    apiAccount?: ApiAccount
  ): Promise<string> {
    Catalog.RootUrl = baseUrl;
    // normalize the catalog type regardless of what the user throws at us.
    let catalogType: CatalogType;
    switch (params["type"] ? params["type"].toLowerCase() : null) {
      case CatalogType.EPUB:
        catalogType = CatalogType.EPUB;
        break;
      case CatalogType.ALL:
      default:
        catalogType = CatalogType.ALL;
        break;
      case CatalogType.TOP:
        catalogType = CatalogType.TOP;
        break;
    }
    // we have to trust whatever language code the user throws at us.
    Catalog.DesiredLang = params["lang"]; // this will be null at the root, normally.

    BloomParseServer.setServer(params["src"]);

    let title: string;
    switch (catalogType) {
      case CatalogType.EPUB:
        title = "Bloom Library ePUB Books";
        break;
      case CatalogType.ALL:
        title = "Bloom Library ePUB, PDF, and bloomPUB Books";
        break;
      default:
        title = "Bloom Library Books";
        break;
    }
    const embargoDays = apiAccount
      ? apiAccount.embargoDays
      : Catalog.DefaultEmbargoDays;

    const namespaceDeclarations = neglectXmlNamespaces
      ? ""
      : 'xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog"';

    var commentsAboutAccount = "";
    if (!apiAccount) {
      commentsAboutAccount =
        "<!-- We are discontinuing anonymous API access soon. YOU SHOULD GET A KEY FROM US ASAP --!>";
    } else {
      commentsAboutAccount = ` <!-- username: ${
        apiAccount.user.username
      }  --> <!-- ReferrerTag: ${
        apiAccount.referrerTag ? apiAccount.referrerTag : "--missing--"
      }  -->  <!-- Delay for new books: ${embargoDays} days -->`;
    }

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<feed
  ${namespaceDeclarations}
  >
  ${commentsAboutAccount}
  <id>https://bloomlibrary.org</id>
  <title>${title}</title>
  <updated>${new Date().toISOString()}</updated>
`;

    if (catalogType == CatalogType.TOP) {
      return header + Catalog.getTopLevelCatalogContent() + `</feed>`;
    }

    try {
      const selfUrl: string =
        Catalog.RootUrl +
        (catalogType == CatalogType.EPUB ? "?type=epub" : "?type=all") +
        this.GetParamsForUrl();
      /* eslint-disable indent */
      const links = `  <link rel="self" href="${selfUrl}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${selfUrl}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${Catalog.RootUrl}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
`;

      const langLinks = await Catalog.getLanguageLinks(
        catalogType,
        Catalog.DesiredLang
      );
      const entries = Catalog.DesiredLang
        ? await Catalog.getEntries(
            catalogType,
            Catalog.DesiredLang,
            embargoDays
          )
        : null; // will be null at the root, when they haven't selected a language yet
      return (
        header +
        links +
        langLinks +
        entries +
        /* eslint-disable indent */
        `</feed>
`
      );
    } catch (err) {
      // todo return a proper error response with the right code and such
      return err;
    }
  }

  // Get the content of the top-level catalog.  This merely points to two other catalogs: one for ePUBs only,
  // and the other for all artifacts (including none available).
  private static getTopLevelCatalogContent(): string {
    /* eslint-disable indent */
    let paramString: string = Catalog.GetParamsForUrl();
    return `  <link rel="self" href="${
      Catalog.RootUrl
    }" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${
    Catalog.RootUrl
  }" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <entry>
    <id>bloomlibrary-epub-only-opdsfeed</id>
    <title>ePUB Books only</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${
      this.RootUrl
    }?type=epub${paramString}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
  <entry>
    <id>bloomlibrary-all-opdsfeed</id>
    <title>All Books (ePUB, PDF, bloomPUB)</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${
      Catalog.RootUrl
    }?type=all${paramString}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
`;
  }

  private static GetParamsForUrl(): string {
    return `${
      this.DesiredLang === "en" ? "" : "&amp;lang=" + this.DesiredLang
    }${
      BloomParseServer.Source === BloomParseServer.DefaultSource
        ? ""
        : "&amp;src=" + BloomParseServer.Source
    }`;
  }

  // Get all the language links for the given type of catalog and desired language.
  private static async getLanguageLinks(
    catalogType: CatalogType,
    desiredLang: string
  ): Promise<any> {
    return new Promise<string>((resolve, reject) => {
      BloomParseServer.getLanguages().then((languages) =>
        resolve(
          languages
            .sort((a, b) => {
              return a.name
                .toLocaleLowerCase("en-US")
                .localeCompare(b.name.toLocaleLowerCase("en-US"), "en-US", {
                  sensitivity: "base",
                });
            })
            .map((lang) => {
              let link: string =
                /* eslint-disable indent */
                `<!-- ${lang.usageCount} ${lang.name} books-->
  <link rel="http://opds-spec.org/facet" href="${this.RootUrl}?type=${
                  catalogType === CatalogType.EPUB ? "epub" : "all"
                }&amp;lang=${lang.isoCode}${
                  BloomParseServer.Source === BloomParseServer.DefaultSource
                    ? ""
                    : "&amp;src=" + BloomParseServer.Source
                }" title="${lang.name}" opds:facetGroup="Languages"${
                  // activeFacet should be set only if true according to the OPDS standard
                  lang.isoCode === desiredLang ? ' opds:activeFacet="true"' : ""
                }/>`;

              return link;
            })
            .join("")
        )
      );
    });
  }

  // Get all the entries for the given type of catalog and desired language.
  private static async getEntries(
    catalogType: CatalogType,
    desiredLang: string,
    embargoDays: number
  ): Promise<string> {
    const books = await BloomParseServer.getBooks(
      Catalog.DesiredLang,
      embargoDays
    );
    return books
      .map((book) =>
        BookEntry.getOpdsEntryForBook(book, catalogType, desiredLang)
      )
      .join("");
  }
}
