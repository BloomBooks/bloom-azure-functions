import { getNeglectXmlNamespaces } from "./catalog";
import BloomParseServer, {
  BloomParseServerMode,
} from "../common/BloomParseServer";
import * as entities from "entities";

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
    epubOnly: boolean,
    desiredLang: string,
    referrerTag: string
  ): string {
    // these will be excluded by the query, so just being double safe
    if (book.draft) {
      return "<!-- omitting a book because it is in DRAFT -->";
    }
    // these will be excluded by the query, so just being double safe
    if (book.inCirculation == false) {
      return "<!-- omitting a book because it is out of circulation -->";
    }

    // filter on internet restrictions
    if (book.internetLimits) {
      // Some country's laws don't allow export/translation of their cultural stories,
      // so play it ultrasafe.  We don't have any idea where the request is coming from,
      // so we don't know if the restriction applies (if it is a restriction on distribution
      // of published artifacts).  So we assume that books which have this value set should
      // always be omitted from public catalogs.  If we start getting an expanded set of
      // specific restrictions, we may look at whether only individual artifacts are affected
      // instead of the entire book entry.
      return "<!-- omitting a book because of country restrictions -->";
    }
    // librarian needs to approve it first
    if (book.tags && book.tags.indexOf("system:Incoming") > -1) {
      // If the ePUB hasn't been harvested, don't bother showing the book.
      return "<!-- omitting a book because it is awaiting site policy review -->";
    }

    // Enhance: we could still provide the PDF & other stuff even it cannot harvest.
    if (book.harvestState !== "Done") {
      // If the ePUB hasn't been harvested, don't bother showing the book.
      return "<!-- omitting a book because of harvest state -->";
    }

    if (epubOnly) {
      // we're only showing books that have an epub available
      if (!BookEntry.shouldWeIncludeLink(book, "epub", false)) {
        // If the ePUB artifact shouldn't be shown, don't generate a book entry for an ePUB catalog.
        return "<!-- omitting a book because of artifact settings -->";
      }
      if (!BookEntry.inDesiredLanguage(book, epubOnly, desiredLang)) {
        // If the ePUB appears not to be in the desired language, don't generate a book entry for
        // an ePUB catalog.
        return "<!-- omitting a book because of language requested vs. language available -->";
      }
    }

    let entry = `<entry>`;
    entry += makeElementOrEmpty("id", book.bookInstanceId);
    entry += makeElementOrEmpty(
      "title",
      getDesiredTitle(desiredLang, book.allTitles, book.title)
    );
    entry += makeElementOrEmpty("summary", book.summary);

    if (book.authors && book.authors.length > 0) {
      book.authors.map((author) => {
        entry += `<author><name>${entities.encodeXML(author)}</name></author>`;
      });
    }
    entry += makeElementOrEmpty("published", book.published);
    entry += makeElementOrEmpty("updated", book.updatedAt);

    if (book.tags) {
      // note: haven't figured out how to get ts-jest to allow optional chaining
      book.tags.forEach((tag) => {
        if (tag.startsWith("topic:")) {
          entry += makeDCElementOrEmpty(
            "subject",
            tag.replace("topic:", "").toLowerCase()
          );
        }
      });
    }
    entry += makeDCElementOrEmpty("publisher", book.publisher);
    entry += makeDCElementOrEmpty("rights", book.copyright);
    entry += makeDCElementOrEmpty("license", book.license);

    entry = entry + BookEntry.getLanguageFields(book, epubOnly, desiredLang);
    const links = BookEntry.getLinkElements(book, referrerTag);
    if (!links || links.length == 0) {
      // An entry without any links is rather useless, and can mess up clients
      // (It's also probably not valid according to the OPDS standard.)
      return "";
    }
    entry += links;
    return entry + `</entry>`;
  }

  private static inDesiredLanguage(
    book: any,
    epubOnly: boolean,
    desiredLang: string
  ): boolean {
    // NB: I [jh] don't understand why epub is a special case, and haven't done any testing around this.
    // epubs are generated in only one language by the harvester, presumably the language used by book.title.
    if (epubOnly) {
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
        console.warn(
          `WARNING: did not find "${title} in allTitles (${book.allTitles})`
        );
      }
      // assume the first language in langPointers is the language of the ePUB: this may well be wrong
      // but we don't have any better information to go by.
      if (book.langPointers && book.langPointers.length > 0) {
        console.warn(
          `WARNING: assuming book.langPointers[0] (${book.langPointers[0].isoCode}) is the language for the "${book.title}" ePUB!`
        );
        return desiredLang == book.langPointers[0].isoCode;
      } else if (book.languages && book.languages.length > 0) {
        console.warn(
          `WARNING: assuming book.languages[0] (${book.languages[0]}) is the language for the "${book.title}" ePUB!`
        );
        return desiredLang == book.languages[0];
      } else {
        return false;
      }
    }
    // Assume any matching language will do for the collection of ePUB, PDF, and bloomPUB.
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

  private static shouldWeIncludeLink(
    book: any,
    artifactName: "pdf" | "bloomReader" | "epub" | "readOnline" | "bloomSource",
    defaultIfWeHaveNoOpinions: boolean
  ): boolean {
    if (book.show === undefined || book.show[artifactName] === undefined)
      return defaultIfWeHaveNoOpinions;

    const firstWithOpinion = ["user", "librarian", "harvester"].find(
      (judge) => book.show[artifactName][judge] !== undefined
    );
    return firstWithOpinion === undefined
      ? defaultIfWeHaveNoOpinions
      : book.show[artifactName][firstWithOpinion];
  }

  private static getLinkElements(book: any, referrerTag: string) {
    const blorgRoot =
      BloomParseServer.Source === BloomParseServerMode.DEVELOPMENT
        ? "https://dev.bloomlibrary.org"
        : "https://bloomlibrary.org";

    let links: string = "";
    // uploaded base URL = https://api.bloomlibrary.org/v1/fs/upload/<book.objectId>/
    const uploadBaseUrl = BloomParseServer.getUploadBaseUrl(book);
    if (!uploadBaseUrl) {
      //console.log("DEBUG: bad book = " + book ? JSON.stringify(book) : book);
      return links;
    }
    // harvested base URL = https://api.bloomlibrary.org/v1/fs/harvest/<book.objectId>/
    const harvestBaseUrl = BloomParseServer.getHarvesterBaseUrl(book);
    const name = BloomParseServer.getBookFileName(book);
    const imageHref = BloomParseServer.getThumbnailUrl(book);
    const imageType = BloomParseServer.getImageContentType(imageHref);
    if (imageHref) {
      links += BookEntry.makeLink(
        "Image",
        imageHref,
        imageType,
        referrerTag,
        "http://opds-spec.org/image"
      );
    }

    // We basically have two modes
    // 1) we're feeding an epub reader, so we only list the entry if we have an epub to give
    // 2) we're just listing everything we have to give

    // In either mode, we give the epub if we can
    if (harvestBaseUrl && BookEntry.shouldWeIncludeLink(book, "epub", false)) {
      const epubLink = `${harvestBaseUrl}/epub/${name}.epub`;
      links += this.makeLink(
        "ePUB",
        epubLink,
        "application/epub+zip",
        referrerTag
      );
    }

    if (
      BookEntry.shouldWeIncludeLink(
        book,
        "pdf",
        true /* As of Nov 18 2021, the harvester currently has no opinion on pdfs, so we will offer it if all the judges are `undefined`.
          In the future it might help to have one, since we are
          now allowing some books to omit the PDF upload and we don't have a way of knowing.  */
      )
    ) {
      links += BookEntry.makeLink(
        "PDF",
        `${uploadBaseUrl}/${name}.pdf`,
        "application/pdf",
        referrerTag
      );
    }
    if (
      harvestBaseUrl &&
      BookEntry.shouldWeIncludeLink(book, "bloomReader", false)
    ) {
      const fileExt =
        book.bloomPUBVersion && book.bloomPUBVersion >= 1
          ? "bloompub"
          : "bloomd";
      links += BookEntry.makeLink(
        "bloomPUB",
        `${harvestBaseUrl}/${name}.${fileExt}`,
        "application/bloompub+zip",
        referrerTag
      );
    }
    if (
      harvestBaseUrl &&
      BookEntry.shouldWeIncludeLink(book, "readOnline", false)
    ) {
      links += BookEntry.makeLink(
        "Read On Bloom Library",
        `${blorgRoot}/player/${book.objectId}`,
        "text/html",
        referrerTag
      );
    }
    if (
      harvestBaseUrl &&
      BookEntry.shouldWeIncludeLink(book, "bloomSource", false)
    ) {
      links += BookEntry.makeLink(
        "bloomSource",
        `${harvestBaseUrl}/${name}.bloomSource`,
        "application/bloomSource+zip",
        referrerTag
      );
    }

    links += BookEntry.makeLink(
      "Bloom Library Page",
      `${blorgRoot}/book/${book.objectId}`,
      "text/html",
      referrerTag
    );
    //}
    return links; // may be an empty string if there are no artifacts we can link to
  }

  private static makeLink(
    title: string,
    url: string,
    mimeType: string,
    referrerTag: string,
    specialRel?: string
  ): string {
    if (referrerTag && referrerTag.startsWith("http"))
      throw new Error(`Referrer tag, ${referrerTag} looks like a rel or href.`);

    var href = url;
    if (referrerTag) {
      // handle some future case where the href already has properties, or the current case where it doesn't.
      href += href.indexOf("?") > -1 ? "&amp;" : "?";
      href += `ref=${encodeURIComponent(referrerTag)}`;
    }
    // can't use ?? yet because ts-jest chokes
    const rel = specialRel
      ? specialRel
      : "http://opds-spec.org/acquisition/open-access";
    return `<link rel="${rel}" href="${href}" type="${mimeType}" title="${title}" />
`;
  }

  private static getLanguageFields(
    book: any,
    epubOnly: boolean,
    desiredLang: string
  ): string {
    if (epubOnly) {
      return makeDCElementOrEmpty("language", desiredLang);
    } else {
      if (book.langPointers && book.langPointers.length > 0) {
        // The Dublin Core standard prefers the ISO 639 code for the language, although
        // StoryWeaver uses language name in their OPDS catalog.
        return book.langPointers
          .map((lang) => makeDCElementOrEmpty("language", lang.isoCode))
          .join(" ");
      } else if (book.languages && book.languages.length > 0) {
        return book.languages
          .map((lang) => makeDCElementOrEmpty("language", lang))
          .join(" ");
      }
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

function makeElementOrEmpty(tag: string, value: string): string {
  return value ? `<${tag}>${entities.encodeXML(value)}</${tag}>` : "";
}

function makeDCElementOrEmpty(tag: string, value: string): string {
  const t = getNeglectXmlNamespaces() ? tag : "dcterms:" + tag;
  return value ? `<${t}>${entities.encodeXML(value)}</${t}>` : "";
}
function getDesiredTitle(
  desiredLang: string,
  allTitles: string,
  title: string
): string {
  if (desiredLang) {
    try {
      // sanitize input for JSON.parse().
      const allTitles1 = allTitles.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      const objTitles = JSON.parse(allTitles1);
      const desiredTitle = objTitles[desiredLang];
      if (desiredTitle) return desiredTitle;
    } catch (ex) {
      console.error(ex);
    }
  }
  return title;
}
