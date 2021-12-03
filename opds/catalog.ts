import BookEntry from "./bookentry";
import BloomParseServer, {
  ApiAccount,
  BloomParseServerMode,
} from "../common/BloomParseServer";

const kOpdsNavigationTypeAttribute = `type="application/atom+xml;profile=opds-catalog;kind=navigation"`;

// NB: The OPDS catalogs from Global Digital Library and StoryWeaver both give both ePUB and pdf links,
// with sometimes only one or the other.  They also both provide links to two image files, one marked as
// a thumbnail.

export type CatalogParams = {
  ref?: string; // the referrer tag that comes from apiAccount, used for analytics
  lang?: string; // narrow to this iso code

  // Note: we're not supporting filters, or the ability to query Contentful for a collection id yet.
  // Collection ID, in particular, would be super nice to have. But to go that direction, we should
  // probably factor out the book-finding code in Blorg2 into its own library so that we don't have
  // duplicate code. We are under a time constraint for this feature, so instead we are only going
  // to allow you to find books that have a single tag. This is pretty useful though, as most collections
  // are based on tags like tag: "list:SEL".
  tag?: string; // we find books that contain this tag
  key?: string; // the apiAccount key for using this API
  // Organize by is currently undefined or language. We could add "collection" some day.
  // if undefined, then we're at the root
  organizeby?: "language";
  // if omitnav=true, don't:
  // * list "start", "up", and "self"
  // * list all the languages if we've already specified the language we want
  omitnav?: boolean;
  // epub is singled out here because of the use case of being used by a simple epub reader.
  // This would at a minimum mean that we only show books that have epubs. Ideally languages too.
  // And possibly we wouldn't require an apiAccount key, if we ever implement rate-limiting by IP address.
  epub?: boolean; // only show epubs  (and ideally, languages) with epubs
  src?: "dev" | "prod";
};

export default class Catalog {
  public static RootUrl: string; // based on original HttpRequest url
  public static DefaultEmbargoDays = 90; // unit tests will set this to 0 because else everything is just to fragile as things age

  public static async getCatalog(
    baseUrl: string,
    params: CatalogParams,
    apiAccount?: ApiAccount,
    skipServerElementsForFastTesting?: boolean
  ): Promise<string> {
    const header = this.makeHeaderElements(baseUrl, params, apiAccount);

    // if there are no filters (language or type of artifact), return our root navigation choices
    if (!params.lang && !params.organizeby && !params.tag)
      return Catalog.makeRootXml(baseUrl, params, apiAccount);

    // Review: is this true? http://opds-browser-demo.herokuapp.com/ likes to have
    // the list, but the Thorium epub client gets confused by it, such that you end up seeing
    //  "catalogs / bloom / filipino / afrikaans/ arabic".
    //Note, you might expect that if we have a language parameter, then we don't need to list
    // all the language choices. But that is what OPDS calls for, because it allows clients
    // like an epub reader app to let you navigate to other places without having to have a memory
    // of what it has seen previously. The user can avoid the unnecessary computation and
    // bandwidth involved in these links by using the `omitnav=true` parameter.
    const languageLinks =
      //params.lang ||
      params.omitnav || skipServerElementsForFastTesting
        ? ""
        : await Catalog.getLanguageLinks(params);

    var bookEntries = "";
    // bookEntries will be null at the root, when they haven't selected a language yet (or if the unit tests don't want us to run the server query)
    if (!skipServerElementsForFastTesting && (params.lang || params.tag)) {
      bookEntries = await Catalog.getEntries(
        params,
        this.getEmbargoDays(apiAccount)
      );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
              <feed  ${this.getNamespaceDeclarations()}  >
                ${header}
                ${params.omitnav ? "" : this.makeOPDSDirectionLinks(params)}
                ${languageLinks}
                ${bookEntries}
              </feed>`;
  }

  // Get the content of the top-level catalog.  This merely points to two other catalogs: one for ePUBs only,
  // and the other for all artifacts (including none available).
  private static makeRootXml(
    baseUrl: string,
    params: CatalogParams,
    apiAccount?: ApiAccount
  ): string {
    const header = this.makeHeaderElements(baseUrl, params, apiAccount);
    return `<?xml version="1.0" encoding="UTF-8"?>
            <feed  ${this.getNamespaceDeclarations()}  >
              ${header}
              ${this.makeOPDSDirectionLinks(params)}
              ${this.makeNavigationEntry(
                { ...params, epub: true, organizeby: "language" },
                "ePUB books organized by language"
              )}
              ${this.makeNavigationEntry(
                { ...params, organizeby: "language" },
                "All books organized by language"
              )}
            </feed>`;
  }

  private static makeNavigationEntry(
    params: CatalogParams,
    title: string
  ): string {
    let ambientParameters: string = Catalog.GetParamsForHref(params, "?");
    return `<entry>
                <id>${title.split(" ").join("-")}</id>
                <title>${title}</title>
                <updated>${new Date().toISOString()}</updated>
                <link rel="subsection" href="${
                  Catalog.RootUrl
                }${ambientParameters}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
              </entry>`;
  }

  private static makeOPDSDirectionLinks(params: CatalogParams): string {
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

  public static makeHeaderElements(
    baseUrl: string,
    params: CatalogParams,
    apiAccount?: ApiAccount
  ): string {
    Catalog.RootUrl = baseUrl;
    BloomParseServer.setServer(params["src"]);

    return `${this.getXmlCommentsAboutAccount(apiAccount)}
        <id>https://bloomlibrary.org</id>
        <title>Bloom Library Books</title>
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
        name: "epub",
        default: undefined,
      },
      {
        name: "organizeby",
        default: "",
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
      {
        // skip navigation links if they aren't needed
        name: "omitnav",
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
  private static async getLanguageLinks(
    params: CatalogParams
  ): Promise<string> {
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
    params: CatalogParams,
    embargoDays: number
  ): Promise<string> {
    const books = await BloomParseServer.getBooks(
      params.lang,
      params.tag,
      embargoDays
    );
    return books
      .map((book) =>
        BookEntry.getOpdsEntryForBook(
          book,
          params.epub,
          params.lang,
          params.ref
        )
      )
      .join("");
  }
}

// I've never achieved the magic of xpaths with namespaces, so, to my shame, the unit test just uses this to turn them off.
var neglectXmlNamespaces: boolean;
export function setNeglectXmlNamespaces() {
  neglectXmlNamespaces = true;
}
export function getNeglectXmlNamespaces() {
  return neglectXmlNamespaces;
}
