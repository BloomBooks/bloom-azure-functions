import axios from "axios";
import { CatalogType } from "./catalog";

export default class Books {
  public static getBooks(): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) =>
      axios
        .get(
          "https://bloom-parse-server-develop.azurewebsites.net/parse/classes/books",
          {
            headers: {
              "X-Parse-Application-Id":
                "yrXftBF6mbAuVu3fO6LnhCJiHxZPIdE7gl1DUVGR"
            },
            params: { /*limit: 100,*/ include: "uploader,langPointers" }
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

  public static getEntryFromBook(book: any, catalogType: CatalogType): string {
    let entry: string;
    switch (catalogType) {
      case CatalogType.EPUBANDPDF:
        if (
          book.show &&
          !Books.shouldPublishArtifact(book.show.epub) &&
          !Books.shouldPublishArtifact(book.show.pdf)
        ) {
          return "";
        }
        break;
      case CatalogType.BLOOMPUB:
        if (book.show && !Books.shouldPublishArtifact(book.show.bloomReader)) {
          return "";
        }
        break;
    }
    /* eslint-disable indent */
    entry = `  <entry>
    <id>${book.bookInstanceId}</id>
    <title>${book.title}</title>
`;
    /* eslint-enable indent */
    //entry = entry + `<xx:test>${JSON.stringify(b)}</xx:test>\n`;
    if (book.authors && book.authors.length > 0) {
      book.authors.map(author => {
        entry =
          entry +
          /* eslint-disable indent */
          `    <author><name>${author}</name></author>
`;
        /* eslint-enable indent */
      });
    }
    entry =
      entry +
      /* eslint-disable indent */
      `    <published>${book.createdAt}</published>
    <updated>${book.updatedAt}</updated>
`;
    /* eslint-enable indent */
    if (book.publisher) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <dcterms:publisher>${book.publisher}</dcterms:publisher>
`;
      /* eslint-enable indent */
    }
    if (book.copyright) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <rights>${book.copyright}</rights>
`;
      /* eslint-enable indent */
    }
    if (book.license) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <dcterms:license>${book.license}</dcterms:license>
`;
      /* eslint-enable indent */
    }
    entry = entry + Books.getLanguageFields(book, catalogType);
    entry = entry + Books.getLinkFields(book, catalogType);
    return (
      entry +
      /* eslint-disable indent */
      `  </entry>
`
      /* eslint-enable indent */
    );
  }

  // Should we publish this artifact to the world?
  private static shouldPublishArtifact(show: any): boolean {
    if (show === undefined) {
      return true; // assume it's okay if we can't find a check.
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

  // Get the link fields for the given book and catalog type.
  private static getLinkFields(book: any, catalogType: CatalogType) {
    let entry: string = "";
    // CHECK: is there a standard book image file we should offer?
    const baseUrl = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
    const name = Books.extractBookFilename(baseUrl);

    if (catalogType === CatalogType.EPUBANDPDF) {
      if (!book.show || Books.shouldPublishArtifact(book.show.pdf)) {
        const pdfLink = baseUrl + name + ".pdf";
        entry =
          entry +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition" href="${pdfLink}" type="application/pdf" />
`;
        /* eslint-enable indent */
      }
      if (!book.show || Books.shouldPublishArtifact(book.show.epub)) {
        const epubLink =
          Books.createS3LinkBase(baseUrl, book) + "epub/" + name + ".epub";
        entry =
          entry +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition" href="${epubLink}" type="application/epub+zip" />
`;
        /* eslint-enable indent */
      }
    } else if (catalogType === CatalogType.BLOOMPUB) {
      // already checked book.show.bloomReader
      const bloomdLink =
        Books.createS3LinkBase(baseUrl, book) + name + ".bloomd";
      entry =
        entry +
        /* eslint-disable indent */
        `    <link rel="http://opds-spec.org/acquisition" href="${bloomdLink}" type="application/bloomd+zip" />
`;
      /* eslint-enable indent */
    }
    return entry;
  }

  private static extractBookFilename(baseUrl: string) {
    const urlWithoutFinalSlash = baseUrl.replace(/\/$/, "");
    return urlWithoutFinalSlash.substring(
      urlWithoutFinalSlash.lastIndexOf("/") + 1
    );
  }

  private static createS3LinkBase(baseUrl: string, book: any) {
    const harvestHead = baseUrl.includes("/BloomLibraryBooks-Sandbox/")
      ? "https://s3.amazonaws.com/bloomharvest-sandbox/"
      : "https://s3.amazonaws.com/bloomharvest/";
    const safeUploader = book.uploader
      ? Books.MakeUrlSafe(book.uploader.username)
      : "UNKNOWN";
    return harvestHead + safeUploader + "/" + book.bookInstanceId + "/";
  }

  private static getLanguageFields(
    book: any,
    catalogType: CatalogType
  ): string {
    let entry: string = "";
    if (catalogType === CatalogType.EPUBANDPDF) {
      if (book.allTitles) {
        // book.allTitles looks like a JSON string, but can contain invalid data that won't parse.
        // So we'll use string searching to parse it.
        const idxTitle = book.allTitles.indexOf('"' + book.title);
        if (idxTitle > 0) {
          const idxTerm = book.allTitles.lastIndexOf('"', idxTitle - 1);
          if (idxTerm > 0) {
            const idxBegin = book.allTitles.lastIndexOf('"', idxTerm - 1);
            if (idxBegin > 0) {
              const lang = book.allTitles.substring(idxBegin + 1, idxTerm);
              /* eslint-disable indent */
              return `    <dcterms:language>${lang}</dcterms:language>
`;
              /* eslint-enable indent */
            }
          }
        }
      }
      // assume the first language in langPointers is what we want
      if (book.langPointers && book.langPointers.length > 0) {
        console.log(
          `WARNING: language for ${book.title} is coming from book.langPointers!`
        );
        /* eslint-disable indent */
        return `    <dcterms:language>${book.langPointers[0].isoCode}</dcterms:language>
`;
        /* eslint-enable indent */
      } else if (book.languages && book.languages.length > 0) {
        console.log(
          `WARNING: language for ${book.title} is coming from book.languages!`
        );
        /* eslint-disable indent */
        return `    <dcterms:language>${book.languages[0]}</dcterms:language>
`;
        /* eslint-enable indent */
      }
      return entry;
    } else {
      if (book.langPointers && book.langPointers.length > 0) {
        // The Dublin Core standard prefers the ISO 639 code for the language, although
        // StoryWeaver uses language name in their OPDS catalog.
        book.langPointers.map(lang => {
          entry =
            entry +
            /* eslint-disable indent */
            `    <dcterms:language>${lang.isoCode}</dcterms:language>
`;
          /* eslint-enable indent */
        });
      } else if (book.languages && book.languages.length > 0) {
        book.languages.map(lang => {
          entry =
            entry +
            /* eslint-disable indent */
            `    <dcterms:language>${lang}</dcterms:language>
`;
          /* eslint-enable indent */
        });
      }
      return entry;
    }
  }

  private static MakeUrlSafe(text: string): string {
    // This needs to match whatever Harvester is using.  The first replace is probably enough.
    var text1 = text.replace("@", "%40");
    return text1.replace(/ /g, "+");
  }
}
// Exemplar from StoryWeaver OPDS catalog (which singlehandedly causes GNU emacs 25.2 to crash)
//   <entry>
//     <title>ನಾನೊಂದು ಗೊಂಬೆ</title>
//     <id>SW-111186</id>
//     <summary>ನಾನ್ಯಾರು? ಒಮ್ಮೊಮ್ಮೆ ಬೇರೆ ಯಾವುದೋ ಗ್ರಹದಿಂದ ಬಂದ ಹಾಗೆ ಕಾಣುತ್ತೇನೆ. ಇನ್ನು ಕೆಲವು ಬಾರಿ ಕೋಡಂಗಿಯ ಹಾಗೆ ಕಾಣುತ್ತೇನೆ. ನಾನು ಕುಣಿಯಬಲ್ಲೆ, ಚಲಿಸಬಲ್ಲೆ! ಒಂದು ಬಟ್ಟೆಯ ಚೀಲ ಅಥವಾ ಸಾಕ್ಸ್ ನಲ್ಲಿ ಕೂಡ ಇದ್ದು ಬಿಡಬಲ್ಲೆ! ನನ್ನ ಕುಟುಂಬ ತುಂಬಾ ದೊಡ್ಡದು. ನಿಮ್ಮನ್ನೂ ಭೇಟಿಯಾಗಬೇಕಲ್ಲ ನಾನು!</summary>
//     <author><name>M.R.Ganesha Kumar</name></author>
//     <contributor><name>Adrija Ghosh</name></contributor>
//     <dcterms:language>Kannada</dcterms:language>
//     <category term="2" label="Level 2 Stories" />
//     <link type="image/jpeg" href="https://storage.googleapis.com/story-weaver-e2e-production/illustration_crops/151612/size7/716150e76cd54017c972095f2c063166.jpg?1573127323" rel="http://opds-spec.org/image" />
//     <link type="image/jpeg" href="https://storage.googleapis.com/story-weaver-e2e-production/illustration_crops/151612/page_portrait/716150e76cd54017c972095f2c063166.png?1573127323" rel="http://opds-spec.org/image/thumbnail" />
//     <dcterms:publisher>Pratham Books</dcterms:publisher>
//     <updated>2020-01-06T11:08:30Z</updated>
//     <link rel="http://opds-spec.org/acquisition" href="https://storyweaver.org.in/api/v0/story/pdf/SW-111186" type="application/pdf+zip" />
//     <link rel="http://opds-spec.org/acquisition" href="https://storyweaver.org.in/api/v0/story/epub/SW-111186" type="application/epub+zip" />
//   </entry>
