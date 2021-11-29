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

type CatalogParams = {
  ref?: string; // the referrer tag that comes from apiAccount, used for analytics
  lang?: string; // narrow to this iso code
  key?: string; // the apiAccount key for using this API
  type?: CatalogType; // (this will probably need improvement) the type filter sorta combined with whether we want the root?
};

export default class Catalog {
  public static RootUrl: string; // based on original HttpRequest url
  public static DesiredLang: string; // value of &lang=XXX param (or "en" by default)
  public static DefaultEmbargoDays = 90; // unit tests will set this to 0 because else everything is just to fragile as things age

  public static async getCatalog(
    baseUrl: string,
    params: CatalogParams,
    apiAccount?: ApiAccount,
    skipServerElementsForFastTesting?: boolean
  ): Promise<string> {
    const header = this.getHeaderElements(baseUrl, params, apiAccount);
    const catalogType = Catalog.getCatalogType(params);
    if (catalogType == CatalogType.TOP) {
      // jh review: what is this TOP thing?
      return `<?xml version="1.0" encoding="UTF-8"?>
              <feed  ${this.getNamespaceDeclarations()}  >
                ${header}
                ${Catalog.getTopLevelCatalogContent(params)}
              </feed>`;
    }

    const languageLinks = skipServerElementsForFastTesting
      ? null
      : await Catalog.getLanguageLinks(params);

    var bookEntries = null;
    // bookEntries be null at the root, when they haven't selected a language yet (or if the unit tests don't want us to run the server query)
    if (!skipServerElementsForFastTesting && Catalog.DesiredLang) {
      bookEntries = await Catalog.getEntries(
        catalogType,
        Catalog.DesiredLang,
        this.getEmbargoDays(apiAccount),
        params.ref
      );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
              <feed  ${this.getNamespaceDeclarations()}  >
                ${header}
                ${this.getOPDSDirectionLinks(params)}
                ${languageLinks}
                ${"" + bookEntries}
              </feed>`;
  }

  // Get the content of the top-level catalog.  This merely points to two other catalogs: one for ePUBs only,
  // and the other for all artifacts (including none available).
  private static getTopLevelCatalogContent(params: object): string {
    let ambientParameters: string = Catalog.GetParamsForHref(params, "&");
    return `${this.getOPDSDirectionLinks(params)}
  <entry>
    <id>bloomlibrary-epub-only-opdsfeed</id>
    <title>ePUB Books only</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${
      this.RootUrl
    }?type=epub${ambientParameters}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
  <entry>
    <id>bloomlibrary-all-opdsfeed</id>
    <title>All Books (ePUB, PDF, bloomPUB)</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${
      Catalog.RootUrl
    }?type=all${ambientParameters}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
`;
  }

  private static getOPDSDirectionLinks(params: object): string {
    const selfUrl: string =
      Catalog.RootUrl + this.GetParamsForHref(params, "?"); /* ? */

    return (
      `<link rel="self" href="${selfUrl}" ${kOpdsNavigationTypeAttribute}/>` +
      // TODO: is this "start" really supposed to point to the same url as we're on? Shouldn't it point to some notion of the root?
      `<link  rel="start" href="${selfUrl}" ${kOpdsNavigationTypeAttribute}/>` +
      // TODO is this "up" really always to the root? My guess is that's true only if you have only two levels?
      `<link rel="up" href="${Catalog.RootUrl}" ${kOpdsNavigationTypeAttribute}/>`
    );
  }

  private static getCatalogType(params: object): CatalogType {
    // normalize the catalog type regardless of what the user throws at us.
    let catalogType: CatalogType;
    switch (params["type"] ? params["type"].toLowerCase() : null) {
      // [jh] I don't really know about this "top" thing. It doesn't seem like the same kind of things as "epub".
      //
      case CatalogType.TOP:
        catalogType = CatalogType.TOP;
        break;
      case CatalogType.EPUB:
        catalogType = CatalogType.EPUB;
        break;
      case CatalogType.ALL:
      default:
        catalogType = CatalogType.ALL;
        break;
    }
    return catalogType;
  }

  private static getEmbargoDays(apiAccount?: ApiAccount): number {
    if (!apiAccount || apiAccount.embargoDays === undefined) {
      return Catalog.DefaultEmbargoDays;
    }

    return apiAccount.embargoDays;
  }

  static getNamespaceDeclarations(): string {
    return neglectXmlNamespaces
      ? ""
      : 'xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog"';
  }

  public static getHeaderElements(
    baseUrl: string,
    params: CatalogParams,
    apiAccount?: ApiAccount
  ): string {
    Catalog.RootUrl = baseUrl;

    // we have to trust whatever language code the user throws at us.
    Catalog.DesiredLang = params["lang"]; // this will be null at the root, normally.
    const x = params["src"];
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
      default:
        title = "Bloom Library Books";
        break;
    }

    return `${this.getXmlCommentsAboutAccount(apiAccount)}
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
      }  -->  <!-- Embargo days: ${this.getEmbargoDays(apiAccount)} days -->`;
    }
  }

  // give the parameter portion of the url to use in hrefs, in a way
  // that preserves our current parameters and also is concise
  private static GetParamsForHref(
    params: CatalogParams,
    startWith: "?" | "&",
    omitParams?: string[]
  ): string {
    const paramSpecs = [
      {
        name: "lang",
        default: undefined,
      },
      {
        name: "src",
        default: BloomParseServerMode.PRODUCTION,
      },
      {
        name: "type",
        default: CatalogType.ALL,
      },
      {
        name: "key",
        default: undefined,
      },
      {
        // this is the referrer tag that comes from an apiAccount
        name: "ref",
        default: undefined,
      },
    ];
    const r = paramSpecs
      .filter((p) => !omitParams || !omitParams.includes(p.name)) // e.g., we skip the `lang` parameter when creating a list of all the other languages
      .filter((p) => params[p.name] != p.default && !!params[p.name]) // don't list it if it's the default value or missing
      .map((p) => `${p.name}=${encodeURIComponent(params[p.name])}`)
      .join("&amp;");
    const start = startWith === "&" ? "&amp;" : startWith;
    return r ? start + r : "";
  }

  // Get all the language links for the given type of catalog and desired language.
  private static async getLanguageLinks(params: object): Promise<string> {
    const languages = await BloomParseServer.getLanguages();
    const sortedByName = languages.sort((a, b) => {
      // enhance: need some way to sort by lang.usageCount and then below, when we drop all but
      // the 1st occurrence of the iso, choose the spelling that is most common
      return a.name
        .toLocaleLowerCase("en-US")
        .localeCompare(b.name.toLocaleLowerCase("en-US"), "en-US", {
          sensitivity: "base",
        });
    });

    var ofInterest = sortedByName;
    //ofInterest = ofInterest.filter((lang) => lang.isoCode === "fr"); // <-- use this when debugging

    // the Parse Server `languages` table has duplicate language entries (I think every time someone writes out a new way to spell the language name?)
    const consolidatedLanguages = [];
    ofInterest.forEach((l) => {
      var index = consolidatedLanguages.findIndex(
        (e) => e.isoCode === l.isoCode
      );
      if (index < 0) {
        // first time we've seen a language with this isoCode
        l.largestUsageFoundSoFar = l.usageCount;
        index = consolidatedLanguages.push(l) - 1;
      } else {
        // we've seen this before, so add our usage Count
        consolidatedLanguages[index].usageCount =
          consolidatedLanguages[index].usageCount + l.usageCount;
      }
      // For the title of the link, we pick the name that has the most books.
      // E.g., for better or worse, we end up with "French" instead of "Français" or "français".
      if (consolidatedLanguages[index].largestUsageFoundSoFar < l.usageCount) {
        consolidatedLanguages[index].largestUsageFoundSoFar = l.usageCount;
        consolidatedLanguages[index].name = l.name;
      }
    });

    const links = consolidatedLanguages
      .map(
        // NB count="${lang.usageCount}" is tempting, but it will confuse people because that count is
        // the total number of book records, which will be greater than the number of entries we actually
        // provide. Books can be excluded for a number of reasons (wrong format, not harvested, etc).
        // We *are* providing this data as "atMost", largely because it is good for unit tests and debugging.
        (lang) => `<link rel="http://opds-spec.org/facet" 
                      iso="${lang.isoCode}"
                      href="${
                        this.RootUrl +
                        ("?lang=" + lang.isoCode) +
                        this.GetParamsForHref(params, "&", ["lang"])
                      }"
                      atMost="${lang.usageCount}"
                      title="${lang.name}" 
                      opds:facetGroup="Languages"
                      ${
                        // activeFacet should be set only if true according to the OPDS standard
                        lang.isoCode === params["lang"]
                          ? ' opds:activeFacet="true"'
                          : ""
                      }/>`
      )
      .join("");
    return links;
  }

  // Get all the entries for the given type of catalog and desired language.
  private static async getEntries(
    catalogType: CatalogType,
    desiredLang: string,
    embargoDays: number,
    referrerTag: string
  ): Promise<string> {
    const books = await BloomParseServer.getBooks(
      Catalog.DesiredLang,
      embargoDays
    );
    return books
      .map((book) =>
        BookEntry.getOpdsEntryForBook(
          book,
          catalogType,
          desiredLang,
          referrerTag
        )
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
