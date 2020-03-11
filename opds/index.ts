import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import axios from "axios";

// See https://specs.opds.io/opds-1.2.html for the OPDS catalog standard.
// See https://validator.w3.org/feed/docs/atom.html for the basic (default) tags
// See https://www.dublincore.org/specifications/dublin-core/dcmi-terms/ for the Dublin Core
//     (dcterms) tags

enum CatalogType {
  MAIN = "main",
  EPUB = "ePUB",
  BLOOMPUB = "BloomPub"
}

// REVIEW: what URL do we want to use for these catalog files?  I assume we don't really want to
// generate them on the fly for every request, but will generate them once a day or once an hour
// or whatever.
const rootUrl : string = "https://bloomlibrary.org/opds";

const opds: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("HTTP trigger function processed a request. url="+req.url);
  const idxQuestion = req.url.indexOf("?");
  let catalogType : CatalogType = CatalogType.MAIN;
  if (idxQuestion > 0)
  {
    const type = req.url.substring(idxQuestion+1);
    if (type.toLowerCase() == "epub") {
      catalogType = CatalogType.EPUB;
    } else if (type.toLowerCase() == "bloompub") {
      catalogType = CatalogType.BLOOMPUB;
    }
  }
  context.res = {
    body: await getCatalog(catalogType)
  };
};

export default opds;

async function getCatalog(catalogType: CatalogType): Promise<string> {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>https://bloomlibrary.org</id>
  <title>BloomLibrary Books</title>
  <updated>${new Date().toISOString()}</updated>
`;

  if (catalogType == CatalogType.MAIN) {
    return header + getTopLevelCatalogContent() + `</feed>
`;
  }

  try {
    const selfUrl :string = rootUrl + ((catalogType == CatalogType.EPUB) ? "-epub" : "-bloompub");
    const links = `  <link rel="self" href="${selfUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${selfUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
`;
    const entries = await getEntries(catalogType);
    return header + links + entries + `</feed>
`;
  } catch (err) {
    // todo return a proper error response with the right code and such
    return err;
  }
}

// Get the content of the top-level catalog.  This merely points to two other catalogs: one for epubs and pdfs,
// and the other for bloompubs.
function getTopLevelCatalogContent() :string {
  let links : string;
  links = `  <link rel="self" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${rootUrl}.xml" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <entry>
    <title>ePUB and PDF Books</title>
    <link rel="subsection" href="${rootUrl}-epub.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <updated>${new Date().toISOString()}</updated>
    <id>bloomlibrary-epub-opdsfeed</id>
  </entry>
  <entry>
    <title>BloomPub Books</title>
    <link rel="subsection" href="${rootUrl}-bloompub.xml" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <updated>${new Date().toISOString()}</updated>
    <id>bloomlibrary-bloompub-opdsfeed</id>
  </entry>
`;
  return links;
}



async function getEntries(catalogType: CatalogType): Promise<any> {
  return new Promise<string>((resolve, reject) => {
    getBooks().then(books =>
      resolve(
        books.map(b => getEntryFromBook(b, catalogType)).join("")
      )
    );
  });
}

function getEntryFromBook(book:any, catalogType:CatalogType) : string {
  let entry : string;
  switch (catalogType)
  {
    case CatalogType.EPUB:
      if (book.show && !showBook(book.show.epub) && !showBook(book.show.pdf)) {
        return "";
      }
      break;
    case CatalogType.BLOOMPUB:
      if (book.show && !showBook(book.show.bloomReader)) {
        return "";
      }
      break;
  }
  entry = `  <entry>
    <id>${book.bookInstanceId}</id>
    <title>${book.title}</title>
`;
  //entry = entry + `<xx:test>${JSON.stringify(b)}</xx:test>\n`;
  if (book.authors && book.authors.length > 0) {
    book.authors.map(author => {
      entry = entry + `    <author><name>${author}</name></author>
`;
    });
  }
  entry = entry + `    <published>${book.createdAt}</published>
    <updated>${book.updatedAt}</updated>
`;
  if (book.publisher) {
    entry = entry + `    <dcterms:publisher>${book.publisher}</dcterms:publisher>
`;
  }
  if (book.copyright) {
    entry = entry + `    <rights>${book.copyright}</rights>
`;
  }
  if (book.license) {
    entry = entry + `    <dcterms:license>${book.license}</dcterms:license>
`;
  }
  entry = entry + getLanguageFields(book, catalogType);
  entry = entry + getLinkFields(book, catalogType);
  return entry + `  </entry>
`;
}

function showBook(show: any) : boolean {
  if (show === undefined) {
    return true;  // assume it's okay if we can't find a check.
  } else {
    if (show.user === undefined) {
      if (show.librarian === undefined) {
        if (show.harvester === undefined) {
          return true;
        } else {
          return show.harvester;
        }
      } else {
        return show.librarian;
      }
    } else {
      return show.user;
    }
  }
}

function getLinkFields(book: any, catalogType: CatalogType) {
  let entry: string = "";
  // CHECK: is there a standard book image file we should offer?
  const baseUrl = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
  const urlWithoutFinalSlash = baseUrl.replace(/\/$/, "");
  const name = urlWithoutFinalSlash.substring(urlWithoutFinalSlash.lastIndexOf('/') + 1);
  const harvestHead = baseUrl.includes("/BloomLibraryBooks-Sandbox/") ?
    "https://s3.amazonaws.com/bloomharvest-sandbox/" :
    "https://s3.amazonaws.com/bloomharvest/";
  const safeUploader = book.uploader ? MakeUrlSafe(book.uploader.username) : "UNKNOWN";

  if (catalogType === CatalogType.EPUB) {
    if (!book.show || showBook(book.show.pdf)) {
      const pdfLink = baseUrl + name + ".pdf";
      entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${pdfLink}" type="application/pdf" />
`;
    }
    if (!book.show || showBook(book.show.epub)) {
      const epubLink = harvestHead + safeUploader + "/" + book.bookInstanceId + "/epub/" + name + ".epub";
      entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${epubLink}" type="application/epub+zip" />
`;
    }
  } else if (catalogType === CatalogType.BLOOMPUB) {  // already checked book.show.bloomReader
    const bloomdLink = harvestHead + safeUploader + "/" + book.bookInstanceId + "/" + name + ".bloomd";
    entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${bloomdLink}" type="application/bloomd+zip" />
`;
  }
  return entry;
}

function getLanguageFields(book: any, catalogType: CatalogType) : string {
  let entry: string = "";
  if (catalogType === CatalogType.EPUB) {
    if (book.allTitles) {
      // book.allTitles looks like a JSON string, but can contain invalid data that won't parse.
      // So we'll use string searching to parse it.
      const idxTitle = book.allTitles.indexOf('"'+book.title);
      if (idxTitle > 0) {
        const idxTerm = book.allTitles.lastIndexOf('"',idxTitle - 1);
        if (idxTerm > 0) {
          const idxBegin = book.allTitles.lastIndexOf('"', idxTerm-1);
          if (idxBegin > 0) {
            const lang = book.allTitles.substring(idxBegin+1, idxTerm);
            return `    <dcterms:language>${lang}</dcterms:language>
`;
          }
        }
      }
    }
    // assume the first language is langPointers is what we want
    if (book.langPointers && book.langPointers.length > 0) {
      console.log(`WARNING: language for ${book.title} is coming from book.langPointers!`)
      return `    <dcterms:language>${book.langPointers[0].isoCode}</dcterms:language>
`;
    } else if (book.languages && book.languages.length > 0) {
      console.log(`WARNING: language for ${book.title} is coming from book.languages!`)
      return `    <dcterms:language>${book.languages[0]}</dcterms:language>
`;
    }
    return entry;
  }
  else {
    if (book.langPointers && book.langPointers.length > 0) {
      // The Dublin Core standard prefers the ISO 639 code for the language, although
      // StoryWeaver uses language name in their OPDS catalog.
      book.langPointers.map(lang => {
        entry = entry + `    <dcterms:language>${lang.isoCode}</dcterms:language>
`;
      });
    }
    else if (book.languages && book.languages.length > 0) {
      book.languages.map(lang => {
        entry = entry + `    <dcterms:language>${lang}</dcterms:language>
`;
      });
    }
    return entry;
  }
}

function MakeUrlSafe(text: string) : string {
  // This needs to match whatever Harvester is using.  The first replace is probably enough.
  var text1 = text.replace("@", "%40");
  return text1.replace(/ /g, "+");
}

function getBooks(): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) =>
    axios
      .get(
        "https://bloom-parse-server-develop.azurewebsites.net/parse/classes/books",
        {
          headers: {
            "X-Parse-Application-Id": "yrXftBF6mbAuVu3fO6LnhCJiHxZPIdE7gl1DUVGR"
          },
          params: { limit: 100, include: "uploader,langPointers" }
        }
      )
      .then(result => {
        resolve(result.data.results);
      })
      .catch(err => {
        reject(err);
      })
  );
}
// Exemplar from StoryWeaver OPDS catalog
//       <entry>
//       <title>ನಾನೊಂದು ಗೊಂಬೆ</title>
//       <id>SW-111186</id>
//       <summary>ನಾನ್ಯಾರು? ಒಮ್ಮೊಮ್ಮೆ ಬೇರೆ ಯಾವುದೋ ಗ್ರಹದಿಂದ ಬಂದ ಹಾಗೆ ಕಾಣುತ್ತೇನೆ. ಇನ್ನು ಕೆಲವು ಬಾರಿ ಕೋಡಂಗಿಯ ಹಾಗೆ ಕಾಣುತ್ತೇನೆ. ನಾನು ಕುಣಿಯಬಲ್ಲೆ, ಚಲಿಸಬಲ್ಲೆ! ಒಂದು ಬಟ್ಟೆಯ ಚೀಲ ಅಥವಾ ಸಾಕ್ಸ್ ನಲ್ಲಿ ಕೂಡ ಇದ್ದು ಬಿಡಬಲ್ಲೆ! ನನ್ನ ಕುಟುಂಬ ತುಂಬಾ ದೊಡ್ಡದು. ನಿಮ್ಮನ್ನೂ ಭೇಟಿಯಾಗಬೇಕಲ್ಲ ನಾನು!</summary>
//       <author><name>M.R.Ganesha Kumar</name></author>
//       <contributor><name>Adrija Ghosh</name></contributor>
//       <dcterms:language>Kannada</dcterms:language>
//       <category term="2" label="Level 2 Stories" />
//       <link type="image/jpeg" href="https://storage.googleapis.com/story-weaver-e2e-production/illustration_crops/151612/size7/716150e76cd54017c972095f2c063166.jpg?1573127323" rel="http://opds-spec.org/image" />
//       <link type="image/jpeg" href="https://storage.googleapis.com/story-weaver-e2e-production/illustration_crops/151612/page_portrait/716150e76cd54017c972095f2c063166.png?1573127323" rel="http://opds-spec.org/image/thumbnail" />
//       <dcterms:publisher>Pratham Books</dcterms:publisher>
//       <updated>2020-01-06T11:08:30Z</updated>
//       <link rel="http://opds-spec.org/acquisition" href="https://storyweaver.org.in/api/v0/story/pdf/SW-111186" type="application/pdf+zip" />
//       <link rel="http://opds-spec.org/acquisition" href="https://storyweaver.org.in/api/v0/story/epub/SW-111186" type="application/epub+zip" />
//       </entry>
