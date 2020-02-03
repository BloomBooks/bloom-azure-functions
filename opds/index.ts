import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import axios from "axios";

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
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
      
      <id>https://bloomlibrary.org</id>
      <title>BloomLibrary Books</title>
      <updated>${new Date().toISOString()}</updated>`;

  try {
    const entries = await getEntries();
    return header + entries + `</feed>`;
  } catch (err) {
    // todo return a proper error response with the right code and such
    return err;
  }
}

async function getEntries(): Promise<any> {
  return new Promise<string>((resolve, reject) => {
    getBooks().then(books =>
      resolve(
        books.map(b => `<entry><title>${b.title}</title></entry>`).join("\r\n")
      )
    );
  });
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
          params: { limit: 10 }
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
//       `;
