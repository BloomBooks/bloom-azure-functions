import axios from "axios";

// For testing and development, we prefer to use the parse table associated with the development Bloom Library.
// For production, we need to use the parse table associated with the production Bloom Library.
export enum BloomParseServerMode {
  DEVELOPMENT = "dev",
  PRODUCTION = "prod",
}

export default class BloomParseServer {
  public static DefaultSource: string = BloomParseServerMode.PRODUCTION;
  public static Source: string;

  public static setServer(source: string) {
    switch (source ? source.toLowerCase() : null) {
      case BloomParseServerMode.DEVELOPMENT:
        BloomParseServer.Source = BloomParseServerMode.DEVELOPMENT;
        break;
      case BloomParseServerMode.PRODUCTION:
        BloomParseServer.Source = BloomParseServerMode.PRODUCTION;
        break;
      default:
        BloomParseServer.Source = BloomParseServer.DefaultSource;
        break;
    }
  }

  public static getParseTableUrl(tableName: string): string {
    switch (BloomParseServer.Source) {
      case BloomParseServerMode.DEVELOPMENT:
        return "https://dev-parse.bloomlibrary.org/classes/" + tableName;
      case BloomParseServerMode.PRODUCTION:
      default:
        return "https://parse.bloomlibrary.org/classes/" + tableName;
    }
  }
  public static getParseLoginUrl(): string {
    switch (BloomParseServer.Source) {
      case BloomParseServerMode.DEVELOPMENT:
        return "https://dev-parse.bloomlibrary.org/login";
      case BloomParseServerMode.PRODUCTION:
      default:
        return "https://parse.bloomlibrary.org/login";
    }
  }
  public static getParseAppId(): string {
    switch (BloomParseServer.Source) {
      case BloomParseServerMode.DEVELOPMENT:
        return (
          process.env["OpdsParseAppIdDev"] ||
          "OpdsParseAppIdDev is missing from env!"
        );
      case BloomParseServerMode.PRODUCTION:
      default:
        return (
          process.env["OpdsParseAppIdProd"] ||
          "OpdsParseAppIdProd is missing from env!"
        );
    }
  }

  // Given the book parse data and bucket, get the base URL for accessing the data stored on S3.
  // The base URL will look like one of the following:
  // https://s3.amazonaws.com/BloomLibraryBooks/<uploader-email>/<book-instance-guid>/<book-title>
  // https://s3.amazonaws.com/bloomharvest/<uploader-email>/<book-instance-guid>
  public static getS3LinkBase(book: any, bucket: string): string {
    const baseUrl: string = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
    const urlWithoutFinalSlash = baseUrl.replace(/\/$/, "");
    let url: string;
    if (bucket.startsWith("BloomLibraryBooks")) {
      url = urlWithoutFinalSlash;
    } else {
      // chop off the title at the end of baseUrl.
      const idx = urlWithoutFinalSlash.lastIndexOf("/");
      url = urlWithoutFinalSlash.substring(0, idx);
      if (bucket === "bloomharvest-sandbox") {
        url = url.replace("BloomLibraryBooks-Sandbox", bucket);
      } else if (bucket === "bloomharvest") {
        url = url.replace("BloomLibraryBooks", bucket);
      }
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
    const name = BloomParseServer.extractBookFilename(baseUrl);
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
    return `${baseUrl}/thumbnail-256.png?version=${book.updatedAt}`;
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
    return `${harvesterBaseUrl}/thumbnails/thumbnail-256.png?version=${book.updatedAt}`;
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

  // this gets changed if we are running on localhost
  public static ApiBaseUrl = "https://api.bloomlibrary.org/v1";

  private static FSApiBaseUrl() {
    return BloomParseServer.ApiBaseUrl + "/fs";
  }

  // typical book.baseUrl:
  // https://s3.amazonaws.com/BloomLibraryBooks-Sandbox/ken%40example.com%2faa647178-ed4d-4316-b8bf-0dc94536347d%2fsign+language+test%2f
  // want:
  // https://api.bloomlibrary.org/v1/fs/dev-upload/U8INuhZHlU
  // We come up with that URL by
  //  (a) start new URL with "https://api.bloomlibrary.org/v1/fs"
  //  (a) match BloomLibraryBooks{-Sandbox} in input URL to {dev-}upload in output URL
  //  (c) append another / and book's objectId
  public static getUploadBaseUrl(book: any): string | undefined {
    if (!book) {
      return undefined;
    }
    if (!book.baseUrl) {
      return undefined;
    }
    if (book.baseUrl.includes("/BloomLibraryBooks-Sandbox/")) {
      return `${this.FSApiBaseUrl()}/dev-upload/${book.objectId}`;
    } else if (book.baseUrl.includes("/BloomLibraryBooks/")) {
      return `${this.FSApiBaseUrl()}/upload/${book.objectId}`;
    } else {
      return undefined; // things have changed: we don't know what's what any longer...
    }
  }

  // typical book.baseUrl:
  // https://s3.amazonaws.com/BloomLibraryBooks-Sandbox/ken%40example.com%2faa647178-ed4d-4316-b8bf-0dc94536347d%2fsign+language+test%2f
  // want:
  // https://api.bloomlibrary.org/v1/fs/dev-harvest/U8INuhZHlU
  // We come up with that URL by
  //  (a) start new URL with "https://api.bloomlibrary.org/v1/fs/"
  //  (a) match BloomLibraryBooks{-Sandbox} in input URL to {dev-}harvest in output URL
  //  (c) append another / and book's objectId
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
    if (book.baseUrl.includes("/BloomLibraryBooks-Sandbox/")) {
      return `${this.FSApiBaseUrl()}/dev-harvest/${book.objectId}`;
    } else if (book.baseUrl.includes("/BloomLibraryBooks/")) {
      return `${this.FSApiBaseUrl()}/harvest/${book.objectId}`;
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
        .get(BloomParseServer.getParseTableUrl("language"), {
          headers: {
            "X-Parse-Application-Id": BloomParseServer.getParseAppId(),
          },
          params: {
            limit: 10000,
            where: '{"usageCount":{"$ne":0}}',
          },
        })
        .then((result) => {
          resolve(result.data.results);
        })
        .catch((err) => {
          reject(err);
        })
    );
  }

  // Get all the books in circulation that fit the current parameters.
  // Further filtering may be needed, but those two filters should reduce the transfer considerably.
  public static async getBooks(
    desiredLang: string,
    tag: string | undefined,
    embargoDays: number
  ): Promise<any[]> {
    let newestDate, newestDateString;
    try {
      newestDate = new Date(Date.now() - embargoDays * 24 * 60 * 60 * 1000);
      newestDateString = newestDate.toISOString().split("T")[0];
    } catch (err) {
      throw "Problem with embargo date handling: " + err.toString();
    }

    let whereParts = [
      `"inCirculation":{"$in":[true,null]}`,
      `"draft":{"$in":[false,null]}`,
      `"createdAt":{"$lte":{"__type": "Date", "iso":"${newestDateString}"}}`,
    ];

    if (desiredLang)
      whereParts.push(
        `"langPointers":{"$inQuery":{"where":{"isoCode":"${desiredLang}"},"className":"language"}}`
      );

    if (tag) {
      // Note on querying tags, which is an array type. https://docs.parseplatform.org/rest/guide/#queries-on-array-values
      // says that its implicit that you're only requiring the value to exist in the array, and if you really mean to match
      // all of them, then you have to use $all.
      whereParts.push(`"tags":"${tag}"`);
    }

    const results = await axios.get(
      BloomParseServer.getParseTableUrl("books"),
      {
        headers: {
          "X-Parse-Application-Id": BloomParseServer.getParseAppId(),
        },
        params: {
          // ENHANCE: if we want partial pages like GDL, use limit and skip (with function params to achieve this)
          limit: 100000,
          //skip: 100,
          order: "title",
          include: "uploader,langPointers",
          where: `{${whereParts.join(",")}}`,
        },
      }
    );
    return results.data.results;
  }

  // Get the complete information for the single book identified by the objectId value.
  public static getBookInfo(objectId: string): Promise<any> {
    return new Promise<any[]>((resolve, reject) =>
      axios
        .get(BloomParseServer.getParseTableUrl("books"), {
          headers: {
            "X-Parse-Application-Id": BloomParseServer.getParseAppId(),
          },
          params: {
            include: "uploader,langPointers",
            where: `{"objectId":{"$eq":"${objectId}"}}`,
          },
        })
        .then((result) => {
          resolve(result.data.results);
        })
        .catch((err) => {
          console.log("ERROR: caught axios.get error: " + err);
          reject(err);
        })
    );
  }

  // This Azure function logs in to the Parse server, using a hard-coded user name ("catalog-service").
  // That account has a ParseServer "role" which is allowed to read the `apiAccount` and `user` tables.
  public static async loginAsCatalogService(): Promise<string> {
    const results = await axios.get(BloomParseServer.getParseLoginUrl(), {
      headers: {
        "X-Parse-Application-Id": BloomParseServer.getParseAppId(),
      },
      params: {
        username: "catalog-service",
        password: process.env["bloomParseServerCatalogServicePassword"], // should be the same for dev and production
      },
    });
    return results.data.sessionToken;

    // don't catch errors, let the go up
  }

  //Get an object containing the data from the apiAccount table row with the specified ID (not yet authenticated)
  public static async getApiAccount(
    objectId: string
  ): Promise<ApiAccount | null> {
    var sessionToken;
    try {
      sessionToken = await BloomParseServer.loginAsCatalogService(); /* ? */
      if (!sessionToken) {
        throw new Error(
          "The Catalog Service could not log in to Parse Server."
        );
      }
    } catch (err) {
      throw new Error(
        `Could not log in as catalog service: ${JSON.stringify(
          err.response.data
        )}`
      );
    }
    try {
      const results = await axios.get(
        BloomParseServer.getParseTableUrl("apiAccount"),
        {
          headers: {
            "X-Parse-Application-Id": BloomParseServer.getParseAppId(),
            "X-Parse-Session-Token": sessionToken,
          },
          params: {
            include: "user",
            // catalog-service role: cCGdsa3paf
            // catalog-service user: uNBPlYLenP
            where: `{"objectId":{"$eq":"${objectId}"}}`,
          },
        }
      ); /* ? */

      // console.log(
      //   "results.data.results:" + JSON.stringify(results.data.results)
      // );
      if (
        results &&
        results.data &&
        results.data.results &&
        results.data.results.length === 1
      ) {
        return results.data.results[0] as ApiAccount;
      }
    } catch (err) {
      throw new Error(
        `Could not get apiAccount: ${JSON.stringify(err.response.data)}`
      );
    }
    return null;
  }
}

export type ApiAccount = {
  objectId: string;
  user: {
    objectId: string;
    username: string;
    // I was going to base the key on the email, but I can't access
    // email without masterkey in our version of parse https://stackoverflow.com/a/55786537/723299
    // I think this is fine, but if we did want to use masterkey, we could wait to upgrade ParseServer or
    // use a ParseServer cloud function for the loginAsCatalogService (it would be able to use the masterkey safely).
  };
  embargoDays?: number;
  referrerTag: string;
};
