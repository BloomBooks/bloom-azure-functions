import axios from "axios";

// For testing and development, we prefer to use the parse table associated with the development Bloom Library.
// For production, we need to use the parse table associated with the production Bloom Library.
export enum BookInfoSource {
  DEVELOPMENT = "dev",
  PRODUCTION = "prod"
}

export default class BookInfo {
  public static DefaultSource: string = BookInfoSource.PRODUCTION;
  public static Source: string;

  public static setBookInfoSource(source: string, defaultSource: string) {
    // normalize the source regardless of what the user throws at us.
    switch (source ? source.toLowerCase() : null) {
      case BookInfoSource.DEVELOPMENT:
        BookInfo.Source = BookInfoSource.DEVELOPMENT;
        break;
      case BookInfoSource.PRODUCTION:
        BookInfo.Source = BookInfoSource.PRODUCTION;
        break;
      default:
        if (
          defaultSource == BookInfoSource.DEVELOPMENT ||
          defaultSource == BookInfoSource.PRODUCTION
        ) {
          BookInfo.Source = defaultSource;
          BookInfo.DefaultSource = defaultSource;
        } else {
          BookInfo.Source = BookInfo.DefaultSource;
        }
        break;
    }
  }

  public static getParseUrl(tableName: string): string {
    switch (BookInfo.Source) {
      case BookInfoSource.DEVELOPMENT:
        return "https://dev-parse.bloomlibrary.org/classes/" + tableName;
      case BookInfoSource.PRODUCTION:
      default:
        return "https://parse.bloomlibrary.org/classes/" + tableName;
    }
  }
  public static getParseAppId(): string {
    switch (BookInfo.Source) {
      case BookInfoSource.DEVELOPMENT:
        return process.env["OpdsParseAppIdDev"];
      case BookInfoSource.PRODUCTION:
      default:
        return process.env["OpdsParseAppIdProd"];
    }
  }

  public static createS3LinkBase(book: any, bucket: string): string {
    const baseUrl: string = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
    const urlWithoutFinalSlash = baseUrl.replace(/\/$/, "");
    const idx = urlWithoutFinalSlash.lastIndexOf("/");
    let url = urlWithoutFinalSlash.substring(0, idx);
    if (bucket === "bloomharvest-sandbox") {
      url = url.replace("BloomLibraryBooks-Sandbox", bucket);
    } else if (bucket === "bloomharvest") {
      url = url.replace("BloomLibraryBooks", bucket);
    }
    const idxCheck = url.indexOf("/" + bucket + "/");
    if (idxCheck < 0) {
      console.log(
        "ERROR: confusion between input bucket and url based on book's baseUrl"
      );
    }
    return url;
  }

  public static MakeUrlSafe(text: string): string {
    // This needs to match whatever Harvester is using.  The first replace is probably enough.
    var text1 = text.replace("@", "%40");
    return text1.replace(/ /g, "+");
  }

  public static getBookFileName(book: any): string {
    const baseUrl = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
    const name = BookInfo.extractBookFilename(baseUrl);
    return name;
  }

  private static extractBookFilename(baseUrl: string): string {
    const urlWithoutFinalSlash = baseUrl.replace(/\/$/, "");
    return urlWithoutFinalSlash.substring(
      urlWithoutFinalSlash.lastIndexOf("/") + 1
    );
  }

  // Get the URL where we find book thumbnails if they have not been harvested recently
  // enough to have a harvester-produced thumbnail. Includes a fake query designed to defeat
  // caching of the thumbnail if the book might have been modified since last cached.
  private static getLegacyThumbnailUrl(book: any) {
    const baseUrl = this.getUploadBaseUrl(book);
    if (!baseUrl) {
      return undefined;
    }
    const name = this.getBookFileName(book);
    return `${baseUrl}${name}/thumbnail-256.png?version=${book.updatedAt}`;
  }

  // Get the URL where we find book thumbnails if they have been harvested recently
  // enough tohave a harvester-produced thumbnail. Includes a fake query designed to defeat
  // caching of the thumbnail if the book might have been modified since last cached.
  private static getHarvesterProducedThumbnailUrl(
    book: any
  ): string | undefined {
    const harvestTime = book.harvestStartedAt;
    if (!harvestTime || new Date(harvestTime.iso) < new Date(2020, 1, 11, 11)) {
      // That data above is FEBRUARY 12! at 11am. If the harvest time is before that,
      // the book was not havested recently enough to have a useful harvester thumbnail.
      // (We'd prefer to do this with harvester version, or even to just be
      // able to assume that any harvested book has this, but it's not yet so.
      // When it is, we can use harvestState === "Done" and remove harvestStartedAt from
      // Book, IBasicBookInfo, and the keys for BookGroup queries.)
      return undefined;
    }
    let harvesterBaseUrl = this.getHarvesterBaseUrl(book);
    if (!harvesterBaseUrl) {
      return undefined;
    }
    return (
      harvesterBaseUrl +
      "thumbnails/thumbnail-256.png?version=" +
      book.updatedAt
    );
  }

  // Get the place we should look for a book thumbnail.
  public static getThumbnailUrl(book: any) {
    return (
      this.getHarvesterProducedThumbnailUrl(book) ||
      this.getLegacyThumbnailUrl(book)
    );
  }

  private static isHarvested(book: any) {
    return book && book.harvestState === "Done";
  }

  public static readonly ApiBaseUrl = "https://api.bloomlibrary.org/v1/fs/";

  public static getUploadBaseUrl(book: any): string | undefined {
    if (!book) {
      return undefined;
    }
    if (!book.baseUrl) {
      return undefined;
    }
    if (book.baseUrl.includes("/BloomLibraryBooks-Sandbox/")) {
      return `${this.ApiBaseUrl}dev-upload/${book.objectId}/`;
    } else if (book.baseUrl.includes("/BloomLibraryBooks/")) {
      return `${this.ApiBaseUrl}upload/${book.objectId}/`;
    } else {
      return undefined; // things have changed: we don't know what's what any longer...
    }
  }

  public static getHarvesterBaseUrl(book: any): string | undefined {
    if (!book) {
      return undefined;
    }
    if (book.baseUrl == null) {
      return undefined;
    }
    if (!this.isHarvested(book)) {
      return undefined;
    }
    // typical book.baseUrl:
    // https://s3.amazonaws.com/BloomLibraryBooks-Sandbox/ken%40example.com%2faa647178-ed4d-4316-b8bf-0dc94536347d%2fsign+language+test%2f
    // want:
    // https://api.bloomlibrary.org/v1/fs/dev-harvest/U8INuhZHlU/
    // We come up with that URL by
    //  (a) start new URL with "https://api.bloomlibrary.org/v1/fs/"
    //  (a) match BloomLibraryBooks{-Sandbox} in input URL to {dev-}harvest in output URL
    //  (c) append another / and book's objectId
    if (book.baseUrl.includes("/BloomLibraryBooks-Sandbox/")) {
      return `${this.ApiBaseUrl}dev-harvest/${book.objectId}/`;
    } else if (book.baseUrl.includes("/BloomLibraryBooks/")) {
      return `${this.ApiBaseUrl}harvest/${book.objectId}/`;
    } else {
      return undefined; // things have changed: we don't know what's what any longer...
    }
  }

  public static getImageContentType(href: string) {
    let imageType = "image/jpeg";
    if (href && href.toLowerCase().includes(".png")) {
      imageType = "image/png";
    }
    return imageType;
  }

  // Get all of the languages recorded for all of the books.  Due to the messy data
  // we've accumulated, there may be duplicates in the list.
  public static getLanguages(): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) =>
      axios
        .get(BookInfo.getParseUrl("language"), {
          headers: {
            "X-Parse-Application-Id": BookInfo.getParseAppId()
          },
          params: {
            limit: 10000,
            where: '{"usageCount":{"$ne":0}}'
          }
        })
        .then(result => {
          resolve(result.data.results);
        })
        .catch(err => {
          reject(err);
        })
    );
  }

  // Get all the books in circulation with the desired language listed
  // Further filtering may be needed, but those two filters should reduce the transfer considerably.
  public static getBooks(desiredLang: string): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) =>
      axios
        .get(BookInfo.getParseUrl("books"), {
          headers: {
            "X-Parse-Application-Id": BookInfo.getParseAppId()
          },
          params: {
            // ENHANCE: if we want partial pages like GDL, use limit and skip (with function params to achieve this)
            limit: 100000,
            //skip: 100,
            order: "title",
            include: "uploader,langPointers",
            where: `{"langPointers":{"$inQuery":{"where":{"isoCode":"${desiredLang}"},"className":"language"}}, "inCirculation":{"$ne":false}}`
          }
        })
        .then(result => {
          resolve(result.data.results);
        })
        .catch(err => {
          console.log("ERROR: caught axios.get error: " + err);
          reject(err);
        })
    );
  }

  // Get the complete information for the single book identified by the objectId value.
  public static getBookInfo(objectId: string): Promise<any> {
    return new Promise<any[]>((resolve, reject) =>
      axios
        .get(BookInfo.getParseUrl("books"), {
          headers: {
            "X-Parse-Application-Id": BookInfo.getParseAppId()
          },
          params: {
            include: "uploader,langPointers",
            where: `{"objectId":{"$eq":"${objectId}"}}`
          }
        })
        .then(result => {
          resolve(result.data.results);
        })
        .catch(err => {
          console.log("ERROR: caught axios.get error: " + err);
          reject(err);
        })
    );
  }
}
