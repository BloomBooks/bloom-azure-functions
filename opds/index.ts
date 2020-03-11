import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import axios from "axios";

// See https://specs.opds.io/opds-1.2.html for the OPDS catalog standard.
// See https://validator.w3.org/feed/docs/atom.html for the basic (default) tags
// See https://www.dublincore.org/specifications/dublin-core/dcmi-terms/ for the Dublin Core
//     (dcterms) tags


const opds: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("HTTP trigger function processed a request.");
  context.res = {
    body: await getCatalog()
  };
};

export default opds;

async function getCatalog(): Promise<string> {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>https://bloomlibrary.org</id>
  <title>BloomLibrary Books</title>
  <updated>${new Date().toISOString()}</updated>
`;

  try {
    const entries = await getEntries();
    return header + entries + `
</feed>`;
  } catch (err) {
    // todo return a proper error response with the right code and such
    return err;
  }
}

async function getEntries(): Promise<any> {
  return new Promise<string>((resolve, reject) => {
    getBooks().then(books =>
      resolve(
        books.map(b => `  <entry>${getEntryFromBook(b)}  </entry>
`).join("")
      )
    );
  });
}

function getEntryFromBook(book:any) : string {
  let entry : string;
  entry = `
    <id>${book.bookInstanceId}</id>
    <title>${book.title}</title>
`;
  if (book.authors && book.authors.length > 0) {
    book.authors.map(author => {
      entry = entry + `    <author><name>${author}</name></author>
`;
    });
  } else {
    entry = entry + `    <author><name>UNKNOWN</name></author>
`;
  }
  entry = entry + `    <contributor type="Illustrator"><name>UNKNOWN</name></contributor>
`;
  entry = entry + `    <published>${book.createdAt}</published>
    <updated>${book.updatedAt}</updated>
`;
  if (book.publisher) {
    entry = entry + `    <dcterms:publisher>${book.publisher}</dcterms:publisher>
`;
  } else {
    entry = entry + `    <dcterms:publisher>UNKNOWN</dcterms:publisher>
`;
  }
  if (book.copyright) {
    entry = entry + `    <rights>${book.copyright}</rights>
`;
  } else {
    entry = entry + `    <rights>UNKNOWN</rights>
`;
  }
  if (book.license) {
    entry = entry + `    <dcterms:license>${book.license}</dcterms:license>
`;
  } else {
    entry = entry + `    <dcterms:license>UNKNOWN</dcterms:license>
`;
  }
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
  } else {
    entry = entry + `    <dcterms:language>UNKNOWN</dcterms:language>
`;
  }
  // CHECK: is there a standard book image file we should offer?
  const baseUrl = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
  const urlWithoutFinalSlash = baseUrl.replace(/\/$/,"");
  const name = urlWithoutFinalSlash.substring(urlWithoutFinalSlash.lastIndexOf('/')+1);
  const harvestHead = baseUrl.includes("/BloomLibraryBooks-Sandbox/") ?
    "https://s3.amazonaws.com/bloomharvest-sandbox/" :
    "https://s3.amazonaws.com/bloomharvest/";
  const safeUploader = book.uploader ? MakeUrlSafe(book.uploader.username) : "UNKNOWN";
  const pdfLink = baseUrl + name + ".pdf";
  const epubLink = harvestHead + safeUploader + "/" + book.bookInstanceId + "/epub/" + name + ".epub";
  const bloomdLink = harvestHead + safeUploader + "/" + book.bookInstanceId + "/" + name + ".bloomd";
  entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${pdfLink}" type="application/pdf" />
`;
  entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${epubLink}" type="application/epub+zip" />
`;
  entry = entry + `    <link rel="http://opds-spec.org/acquisition" href="${bloomdLink}" type="application/bloomd+zip" />
`;
  //entry = entry + `<xx:test>${JSON.stringify(b)}</xx:test>`
  return entry;
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
          params: { limit: 10, include: "uploader,langPointers" }
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
