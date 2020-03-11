import Books from "./books";

export enum CatalogType {
  MAIN = "main",
  // ePUB and PDF links are together because they'll have the same language settings
  // The OPDS catalogs from Global Digital Library and StoryWeaver both give both epub and pdf,
  // with sometimes only one or the other.
  EPUBANDPDF = "ePUB and PDF",
  BLOOMPUB = "BloomPub"
}

// REVIEW: what URL do we want to use for these catalog files?  I assume we don't really want to
// generate them on the fly for every request, but will generate them once a day or once an hour
// or whatever.
const rootUrl: string = "https://bloomlibrary.org/opds";

export default class Catalog {
  public static async getCatalog(catalogType: CatalogType): Promise<string> {
    /* eslint-disable indent */

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>https://bloomlibrary.org</id>
  <title>BloomLibrary Books</title>
  <updated>${new Date().toISOString()}</updated>
`;
    /* eslint-enable indent */

    if (catalogType == CatalogType.MAIN) {
      return (
        header +
        Catalog.getTopLevelCatalogContent() +
        /* eslint-disable indent */
        `</feed>
`
        /* eslint-enable indent */
      );
    }

    try {
      const selfUrl: string =
        rootUrl +
        (catalogType == CatalogType.EPUBANDPDF ? "-epub-pdf" : "-bloompub");
      /* eslint-disable indent */

      const links = `  <link rel="self" href="${selfUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${selfUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
`;
      /* eslint-enable indent */
      const entries = await Catalog.getEntries(catalogType);
      return (
        header +
        links +
        entries +
        /* eslint-disable indent */
        `</feed>
`
        /* eslint-enable indent */
      );
    } catch (err) {
      // todo return a proper error response with the right code and such
      return err;
    }
  }

  // Get the content of the top-level catalog.  This merely points to two other catalogs: one for epubs and pdfs,
  // and the other for bloompubs.
  private static getTopLevelCatalogContent(): string {
    /* eslint-disable indent */
    return `  <link rel="self" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <entry>
    <id>bloomlibrary-epub-and-pdf-opdsfeed</id>
    <title>ePUB and PDF Books</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${rootUrl}-epub-pdf.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
  <entry>
    <id>bloomlibrary-bloompub-opdsfeed</id>
    <title>BloomPub Books</title>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${rootUrl}-bloompub.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
`;
    /* eslint-enable indent */
  }

  // Get all the entries for the given type of catalog.
  private static async getEntries(catalogType: CatalogType): Promise<any> {
    return new Promise<string>((resolve, reject) => {
      Books.getBooks().then(books =>
        resolve(
          books.map(book => Books.getEntryFromBook(book, catalogType)).join("")
        )
      );
    });
  }
}
