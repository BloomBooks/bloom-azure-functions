import BookEntry from "./bookentry";
import BloomParseServer, {
  ApiAccount,
  BloomParseServerMode,
} from "../common/BloomParseServer";

const kOpdsNavigationTypeAttribute = `type="application/atom+xml;profile=opds-catalog;kind=navigation"`;

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
export default class Catalog {
  public static RootUrl: string; // based on original HttpRequest url
  public static DesiredLang: string; // value of &lang=XXX param (or "en" by default)
  public static DefaultEmbargoDays = 90; // unit tests will set this to 0 because else everything is just to fragile as things age

  public static async getCatalog(
    baseUrl: string,
    params: object,
    apiAccount?: ApiAccount
  ): Promise<string> {
    const header = this.getHeaderElements(baseUrl, params, apiAccount);
    const catalogType = Catalog.getCatalogType(params);
    if (catalogType == CatalogType.TOP) {
      // jh review: what is this TOP thing?
      return `<?xml version="1.0" encoding="UTF-8"?>
              <feed  ${this.getNamespaceDeclarations()}  >
                ${header}
                ${Catalog.getTopLevelCatalogContent()}
              </feed>`;
    }

    const languageLinks = await Catalog.getLanguageLinks(
      catalogType,
      Catalog.DesiredLang
    );
    const bookEntries = Catalog.DesiredLang
      ? await Catalog.getEntries(
          catalogType,
          Catalog.DesiredLang,
          this.getEmbargoDays(apiAccount)
        )
      : null; // will be null at the root, when they haven't selected a language yet

    return `<?xml version="1.0" encoding="UTF-8"?>
              <feed  ${this.getNamespaceDeclarations()}  >
                ${header}
                ${this.getOPDSDirectionLinks()}
                ${languageLinks}
                ${bookEntries}
              </feed>`;
  }

  // Get the content of the top-level catalog.  This merely points to two other catalogs: one for ePUBs only,
  // and the other for all artifacts (including none available).
  // TODO: this needs a new reading / understanding and then refactoring to fit with the normal catalog answer
  private static getTopLevelCatalogContent(): string {
    let paramString: string = Catalog.GetParamsForUrl();
    return `  <link rel="self" href="${Catalog.RootUrl +
      this.GetParamsForUrl()}" ${kOpdsNavigationTypeAttribute}/>
  <link rel="start" href="${Catalog.RootUrl}" ${kOpdsNavigationTypeAttribute}/>
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

  private static getOPDSDirectionLinks(): string {
    const selfUrl: string = Catalog.RootUrl + this.GetParamsForUrl(); /* ? */

    return (
      `<link rel="self" href="${selfUrl}" ${kOpdsNavigationTypeAttribute}/>` +
      // TODO: is this "start" really supposed to point to the same url as we're on? Shouldn't it point to some notion of the root?
      `<link  rel="start" href="${selfUrl}" ${kOpdsNavigationTypeAttribute}/>` +
      // TODO is this "up" really always to the root? My guess is that's true only if you have only two levels?
      `<link rel="up" href="${Catalog.RootUrl}" ${kOpdsNavigationTypeAttribute}/>`
    );
  }

  // [jh] I don't really know about this "top" thing yet. I've just refactored such that git will think I wrote stuff for it.
  private static getCatalogType(params: object): CatalogType {
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
    return catalogType;
  }

  private static getEmbargoDays(apiAccount?: ApiAccount): number {
    return apiAccount ? apiAccount.embargoDays : Catalog.DefaultEmbargoDays;
  }

  static getNamespaceDeclarations(): string {
    return neglectXmlNamespaces
      ? ""
      : 'xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog"';
  }

  public static getHeaderElements(
    baseUrl: string,
    params: object,
    apiAccount?: ApiAccount
  ): string {
    Catalog.RootUrl = baseUrl;

    // we have to trust whatever language code the user throws at us.
    Catalog.DesiredLang = params["lang"]; // this will be null at the root, normally.
    const x = params["src"]; /* ? */
    BloomParseServer.setServer(params["src"]);

    let title: string;

    // TODO: review this "catalog type" thing. It seems to mix a filter (kinds of artifacts you want) with where you are in the hierarchy.
    // That might be needed if OPDS doesn't allow parameters, and only, um, *locations*.
    // We do want to work with ePUB readers, which can't set parameters. But those could be given a root url that already had something like
    // `types=epub` as part of the url.
    switch (Catalog.getCatalogType(params)) {
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

    return `${this.getXmlCommentsAboutAccount()}
        <id>https://bloomlibrary.org</id>
        <title>${title}</title>
        <updated>${new Date().toISOString()}</updated>
      `;
  }

  private static getXmlCommentsAboutAccount(apiAccount?: ApiAccount): string {
    if (!apiAccount) {
      return "<!-- We are discontinuing anonymous API access soon. YOU SHOULD GET A KEY FROM US ASAP -->";
    } else {
      return ` <!-- username: ${
        apiAccount.user.username
      }  --> <!-- ReferrerTag: ${
        apiAccount.referrerTag ? apiAccount.referrerTag : "--missing--"
      }  -->  <!-- Delay for new books: ${this.getEmbargoDays(
        apiAccount
      )} days -->`;
    }
  }

  private static GetParamsForUrl(): string {
    const params = [
      {
        name: "lang",
        current: this.DesiredLang,
        default: undefined,
      },
      {
        name: "src",
        current: BloomParseServer.Source,
        default: BloomParseServerMode.PRODUCTION,
      },
    ];
    const r = params
      .filter((p) => p.default != p.current) // don't list it if it's the default value
      .map((p) => `${p.name}=${encodeURIComponent(p.current)}`)
      .join("&amp;");
    return r ? "?" + r : "" /* ? */;

    // return `${
    //   this.DesiredLang === "en" ? "" : "&amp;lang=" + this.DesiredLang
    // }${
    //   BloomParseServer.Source === BloomParseServer.DefaultSource
    //     ? ""
    //     : "&amp;src=" + BloomParseServer.Source
    // }`;
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

// I've never achieved the magic of xpaths with namespaces, so, to my shame, the unit test just us this to turn them off.
var neglectXmlNamespaces: boolean;
export function setNeglectXmlNamespaces() {
  neglectXmlNamespaces = true;
}
export function getNeglectXmlNamespaces() {
  return neglectXmlNamespaces;
}
