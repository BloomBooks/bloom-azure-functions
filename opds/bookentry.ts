import { CatalogType } from "./catalog";
import BookInfo, { BookInfoSource } from "../common/bookinfo";

// This static class wraps methods for getting OPDS entry XML text for books in Bloom Library.
// The "book: any" argument found in many of these methods contains the complete parse books table
// data for one book, with uploader and langPointers fully dereferenced.
export default class BookEntry {
  // Generate an OPDS entry for the given book if one is desired and return it as a string with an
  // XML <entry> element.  If the book should not have an OPDS entry (because of no published
  // artifacts or some other reason), then an empty string is returned.
  // Note that the list of books has already been filtered for inCirculation not being false and
  // for desiredLang being listed in book.langPointers, so those values do not need to be checked
  // in this code.  It still needs to check whether individual artifacts exist and are approved for
  // publication, and whether the book is restricted from internet distribution for some reason.
  public static getOpdsEntryForBook(
    book: any,
    catalogType: CatalogType,
    desiredLang: string
  ): string {
    let entry: string = "";
    //     /* eslint-disable indent */
    //     entry = `<!-- ${JSON.stringify(book)} -->
    // `;
    //     /* eslint-enable indent */
    // filter on internet restrictions
    if (book.internetLimits) {
      // Some country's laws don't allow export/translation of their cultural stories,
      // so play it ultrasafe.  We don't have any idea where the request is coming from,
      // so we don't know if the restriction applies (if it is a restriction on distribution
      // of published artifacts).  So we assume that books which have this value set should
      // always be omitted from public catalogs.  If we start getting an expanded set of
      // specific restrictions, we may look at whether only individual artifacts are affected
      // instead of the entire book entry.
      return entry;
    }

    // filter on ePUB catalog restrictions
    // When catalogType == ALL, the book.harvestState and book.show values are checked for individual
    // artifacts in getLinkFields().
    if (catalogType === CatalogType.EPUB) {
      if (book.harvestState !== "Done") {
        // If the ePUB hasn't been harvested, don't bother showing the book.
        return entry;
      }
      if (book.show && !BookEntry.shouldPublishArtifact(book.show.epub)) {
        // If the ePUB artifact shouldn't be shown, don't generate a book entry for an ePUB catalog.
        return entry;
      }
      if (!BookEntry.inDesiredLanguage(book, catalogType, desiredLang)) {
        // If the ePUB appears not to be in the desired language, don't generate a book entry for
        // an ePUB catalog.
        return entry;
      }
    }

    // REVIEW: are there any other filters we should apply here?  for example, should "incoming" books be listed?

    entry =
      entry +
      /* eslint-disable indent */
      `  <entry>
    <id>${book.bookInstanceId}</id>
    <title>${BookEntry.htmlEncode(book.title)}</title>
`;
    /* eslint-enable indent */
    if (book.summary && book.summary.length > 0) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <summary>${BookEntry.htmlEncode(book.summary)}</summary>
`;
    }
    /* eslint-enable indent */
    if (book.authors && book.authors.length > 0) {
      book.authors.map(author => {
        entry =
          entry +
          /* eslint-disable indent */
          `    <author><name>${BookEntry.htmlEncode(author)}</name></author>
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
        `    <dcterms:publisher>${BookEntry.htmlEncode(
          book.publisher
        )}</dcterms:publisher>
`;
      /* eslint-enable indent */
    }
    if (book.copyright) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <rights>${BookEntry.htmlEncode(book.copyright)}</rights>
`;
      /* eslint-enable indent */
    }
    if (book.license) {
      entry =
        entry +
        /* eslint-disable indent */
        `    <dcterms:license>${BookEntry.htmlEncode(
          book.license
        )}</dcterms:license>
`;
      /* eslint-enable indent */
    }
    entry = entry + BookEntry.getLanguageFields(book, catalogType, desiredLang);
    const links = BookEntry.getLinkFields(book, catalogType);
    if (!links || links.length == 0) {
      // An entry without any links is rather useless, and can mess up clients
      // (It's also probably not valid according to the OPDS standard.)
      return "";
    }
    entry = entry + links;
    return (
      entry +
      /* eslint-disable indent */
      `  </entry>
`
      /* eslint-enable indent */
    );
  }

  private static inDesiredLanguage(
    book: any,
    catalogType: CatalogType,
    desiredLang: string
  ): boolean {
    if (catalogType == CatalogType.EPUB) {
      if (book.allTitles) {
        // book.allTitles looks like a JSON string, but can contain invalid data that won't parse.
        // So we'll use string searching to parse it looking for a matching title and its language.
        // first we need to quote \ and " in the title string should they appear.
        const title = book.title.replace("\\", "\\\\").replace('"', '\\"');
        const idxTitle = book.allTitles.indexOf('"' + title + '"');
        if (idxTitle > 0) {
          const idxTerm = book.allTitles.lastIndexOf('"', idxTitle - 1);
          if (idxTerm > 0) {
            const idxBegin = book.allTitles.lastIndexOf('"', idxTerm - 1);
            if (idxBegin > 0) {
              const lang = book.allTitles.substring(idxBegin + 1, idxTerm);
              // console.log(
              //   `INFO: found "${book.title}" in allTitles: lang=${lang}`
              // );
              return lang === desiredLang;
            }
          }
        }
        console.log(
          `WARNING: did not find "${title} in allTitles (${book.allTitles})`
        );
      }
      // assume the first language in langPointers is the language of the ePUB: this may well be wrong
      // but we don't have any better information to go by.
      if (book.langPointers && book.langPointers.length > 0) {
        console.log(
          `WARNING: assuming book.langPointers[0] (${book.langPointers[0].isoCode}) is the language for the "${book.title}" ePUB!`
        );
        return desiredLang == book.langPointers[0].isoCode;
      } else if (book.languages && book.languages.length > 0) {
        console.log(
          `WARNING: assuming book.languages[0] (${book.languages[0]}) is the language for the "${book.title}" ePUB!`
        );
        return desiredLang == book.languages[0];
      } else {
        return false;
      }
    }
    // Assume any matching language will do for the collection of ePUB, PDF, and BloomPub.
    if (book.langPointers && book.langPointers.length) {
      for (let i = 0; i < book.langPointers.length; ++i) {
        const lang = book.langPointers[i];
        if (lang.isoCode === desiredLang) {
          return true;
        }
      }
    }
    if (book.languages && book.languages.length) {
      for (let i = 0; i < book.languages.length; ++i) {
        if (book.languages[i] === desiredLang) {
          return true;
        }
      }
    }
    return false;
  }

  // It's hard to believe that javascript doesn't have a standard method for this!
  // This is a rather minimal implementation.
  private static htmlEncode(text: string): string {
    if (text.includes("&")) {
      text = text.replace(/&/g, "&amp;"); // always needed
    }
    if (text.includes("<")) {
      text = text.replace(/</g, "&lt;"); // needed in text nodes
    }
    if (text.includes(">")) {
      text = text.replace(/>/g, "&gt;"); // needed in text nodes
    }
    if (text.includes('"')) {
      text = text.replace(/"/g, "&quot;"); // needed in attribute values
    }
    if (text.includes("'")) {
      text = text.replace(/'/g, "&apos;"); // needed in attribute values
    }
    return text;
  }

  // Should we publish this artifact to the world?
  // REVIEW: should we assume artifacts don't exist if show is undefined?
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
    let artifactLinks: string = "";
    // uploaded base URL = https://api.bloomlibrary.org/v1/fs/upload/<book.objectId>/
    const uploadBaseUrl = BookInfo.getUploadBaseUrl(book);
    if (!uploadBaseUrl) {
      //console.log("DEBUG: bad book = " + book ? JSON.stringify(book) : book);
      return artifactLinks;
    }
    // harvested base URL = https://api.bloomlibrary.org/v1/fs/harvest/<book.objectId>/
    const harvestBaseUrl = BookInfo.getHarvesterBaseUrl(book);
    const name = BookInfo.getBookFileName(book);
    const imageHref = BookInfo.getThumbnailUrl(book);
    const imageType = BookInfo.getImageContentType(imageHref);

    if (catalogType === CatalogType.EPUB) {
      // already checked book.show.epub and book.harvestState === "Done"
      const epubLink =
        BookInfo.getHarvesterBaseUrl(book) + "epub/" + name + ".epub";
      artifactLinks =
        artifactLinks +
        /* eslint-disable indent */
        `    <link rel="http://opds-spec.org/acquisition/open-access" href="${epubLink}" type="application/epub+zip" />
`;
      /* eslint-enable indent */
      if (imageHref) {
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/image" href="${imageHref}" type="${imageType}" />
`;
        /* eslint-enable indent */
      }
    } else if (catalogType === CatalogType.ALL) {
      if (
        harvestBaseUrl &&
        (!book.show || BookEntry.shouldPublishArtifact(book.show.epub))
      ) {
        const epubLink = `${harvestBaseUrl}epub/${name}.epub`;
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition/open-access" href="${epubLink}" type="application/epub+zip" />
  `;
        /* eslint-enable indent */
      }
      if (!book.show || BookEntry.shouldPublishArtifact(book.show.pdf)) {
        const pdfLink = `${uploadBaseUrl}${name}/${name}.pdf`;
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition/open-access" href="${pdfLink}" type="application/pdf" />
`;
        /* eslint-enable indent */
      }
      if (
        harvestBaseUrl &&
        (!book.show || BookEntry.shouldPublishArtifact(book.show.bloomReader))
      ) {
        const bloomdLink = `${harvestBaseUrl}${name}.bloomd`;
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition/open-access" href="${bloomdLink}" type="application/bloomd+zip" title="BloomPub" />
`;
        /* eslint-enable indent */
        const readLink = `https://${
          BookInfo.Source === BookInfoSource.DEVELOPMENT ? "dev." : ""
        }bloomlibrary.org/readBook/${book.objectId}`;
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/acquisition/open-access" href="${readLink}" type="application/bloomd+html" title="Read Online" />
`;
        /* eslint-enable indent */
      }
      if (imageHref) {
        artifactLinks =
          artifactLinks +
          /* eslint-disable indent */
          `    <link rel="http://opds-spec.org/image" href="${imageHref}" type="${imageType}" />
`;
        /* eslint-enable indent */
      }
    }
    return artifactLinks; // may be an empty string if there are no artifacts we can link to
  }

  private static getLanguageFields(
    book: any,
    catalogType: CatalogType,
    desiredLang: string
  ): string {
    if (catalogType === CatalogType.EPUB) {
      /* eslint-disable indent */
      return `    <dcterms:language>${desiredLang}</dcterms:language>
`;
      /* eslint-enable indent */
    } else {
      let languages: string = "";
      if (book.langPointers && book.langPointers.length > 0) {
        // The Dublin Core standard prefers the ISO 639 code for the language, although
        // StoryWeaver uses language name in their OPDS catalog.
        book.langPointers.map(lang => {
          languages =
            languages +
            /* eslint-disable indent */
            `    <dcterms:language>${lang.isoCode}</dcterms:language>
`;
          /* eslint-enable indent */
        });
      } else if (book.languages && book.languages.length > 0) {
        book.languages.map(lang => {
          languages =
            languages +
            /* eslint-disable indent */
            `    <dcterms:language>${lang}</dcterms:language>
`;
          /* eslint-enable indent */
        });
      }
      return languages;
    }
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
