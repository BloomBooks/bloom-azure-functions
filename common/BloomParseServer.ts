import axios from "axios";
import { Environment } from "./utils";
import {
  IContentfulCollectionFilter,
  getAllContentfulCollectionFiltersForUser,
  validateContentfulEnvironmentVariables,
  kAllBooksFilter,
} from "./contentful";

export default class BloomParseServer {
  private environment: Environment;

  constructor(environment: Environment) {
    this.environment = environment;
  }

  public getEnvironment(): Environment {
    return this.environment;
  }

  public getParseUrlBase(): string {
    switch (this.environment) {
      case Environment.PRODUCTION:
      default:
        return "https://server.bloomlibrary.org/parse";
      case Environment.DEVELOPMENT:
        return "https://dev-server.bloomlibrary.org/parse";
      case Environment.UNITTEST:
        return "https://bloom-parse-server-unittest.azurewebsites.net/parse";
    }
  }

  public getParseTableUrl(tableName: string): string {
    return this.getParseUrlBase() + "/classes/" + tableName;
  }

  public getParseLoginUrl(): string {
    return this.getParseUrlBase() + "/login";
  }

  public getParseUserUrl(): string {
    return this.getParseUrlBase() + "/users/me";
  }

  public getParseAppId(): string {
    switch (this.environment) {
      case Environment.PRODUCTION:
      default:
        return (
          process.env["ParseAppIdProd"] ||
          process.env["OpdsParseAppIdProd"] ||
          "ParseAppIdProd is missing from env!"
        );
      case Environment.DEVELOPMENT:
        return (
          process.env["ParseAppIdDev"] ||
          process.env["OpdsParseAppIdDev"] ||
          "ParseAppIdDev is missing from env!"
        );
      case Environment.UNITTEST:
        return (
          process.env["ParseAppIdUnitTest"] ||
          "ParseAppIdUnitTest is missing from env!"
        );
    }
  }

  // Given the book parse data and bucket, get the base URL for accessing the data stored on S3.
  // The base URL will look like one of the following:
  // https://s3.amazonaws.com/BloomLibraryBooks/<uploader-email>/<book-instance-guid>/<book-title>
  // https://s3.amazonaws.com/bloomharvest/<uploader-email>/<book-instance-guid>
  public static getS3LinkBase(rawBaseUrl: string, bucket: string): string {
    const baseUrl: string = rawBaseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
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
    const text1 = text.replace("@", "%40");
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
      // the book was not harvested recently enough to have a useful harvester thumbnail.
      // (We'd prefer to do this with harvester version, or even to just be
      // able to assume that any harvested book has this, but it's not yet so.
      // When it is, we can use harvestState === "Done" and remove harvestStartedAt from
      // Book, IBasicBookInfo, and the keys for BookGroup queries.)
      return undefined;
    }
    const harvesterBaseUrl = this.getHarvesterBaseUrl(book);
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
    if (book.baseUrl === null) {
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
  public async getLanguages() {
    const result = await axios.get(this.getParseTableUrl("language"), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        limit: 10000,
        where: '{"usageCount":{"$ne":0}}',
      },
    });
    return result.data.results;
  }

  // returns the objectId of the language record just created
  public async createLanguage(langJson: any): Promise<string> {
    const url = this.getParseTableUrl("language");
    const result = await axios.post(url, langJson, {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
        "Content-Type": "application/json",
      },
    });
    if (result.status !== 201) {
      throw new Error(`Failed to create language record`);
    }
    return result.data.objectId;
  }

  // returns the language record from Parse
  public async getLanguage(langJson: any): Promise<any> {
    const result = await axios.get(this.getParseTableUrl("language"), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        where: langJson,
      },
    });
    return result.data.results[0];
  }

  public async deleteLanguage(languageObjectId: string, sessionToken: string) {
    const results = await axios.delete(
      this.getParseTableUrl("language") + "/" + languageObjectId,
      {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
          "X-Parse-Session-Token": sessionToken,
        },
      }
    );
    return results;
  }

  // returns the objectId of the first language matching the specifications of langJson, creating the language if necessary
  public async getOrCreateLanguage(langJson: any): Promise<string> {
    const lang = await this.getLanguage(langJson);
    if (lang) {
      return lang.objectId;
    }
    return await this.createLanguage(langJson);
  }

  // Get all the books in circulation that fit the current parameters.
  // Further filtering may be needed, but those two filters should reduce the transfer considerably.
  public async getBooksForCatalog(
    desiredLang: string,
    tag: string | undefined,
    embargoDays: number
  ): Promise<any[]> {
    let newestDate, newestDateString;
    try {
      newestDate = new Date(Date.now() - embargoDays * 24 * 60 * 60 * 1000);
      // add one day to make sure we get all books from the last day (since we're using less than or equal to the truncated date)
      newestDate.setDate(newestDate.getDate() + 1);
      newestDateString = newestDate.toISOString().split("T")[0];
    } catch (err) {
      throw "Problem with embargo date handling: " + err.toString();
    }

    const whereParts = [
      `"inCirculation":true`,
      `"draft":false`,
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

    const results = await axios.get(this.getParseTableUrl("books"), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        // ENHANCE: if we want partial pages like GDL, use limit and skip (with function params to achieve this)
        limit: 100000,
        //skip: 100,
        order: "title",
        include: "uploader,langPointers",
        where: `{${whereParts.join(",")}}`,
      },
    });
    return results.data.results;
  }

  // Get the count of books with the given language tag where 'rebrand' is false and 'inCirculation' is true and 'draft' is false.
  // In the future, we may need to parameterize those filters, but for now, it fits our current use case (Bloom editor's count of books uploaded).
  public async getBookCountByLanguage(languageTag: string) {
    const results = await axios.get(this.getParseTableUrl("books"), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        count: 1,
        limit: 0,
        where: `{"langPointers":{"$inQuery":{"where":{"isoCode":"${languageTag}"},"className":"language"}},"rebrand":false,"inCirculation":true,"draft":false}`,
      },
    });
    return results.data.count;
  }

  public async getMinDesktopVersion() {
    const results = await axios.get(this.getParseTableUrl("version"), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
    });
    return results.data.results[0].minDesktopVersion;
  }

  public async getBook(
    where: string,
    fieldsToExpand: string[] = []
  ): Promise<Book> {
    try {
      const result = await this.doBookQuery(where, fieldsToExpand, {});
      if (result.data.results.length > 1) {
        throw new Error("More than one book found for " + where);
      }
      return result.data.results[0];
    } catch (err) {
      console.log("ERROR: caught axios.get error: " + err);
      throw err;
    }
  }

  public async getBooks(
    where: string,
    fieldsToExpand: string[] = [],
    additionalParams: {} = {}
  ): Promise<{ books: Book[]; count: number }> {
    try {
      const result = await this.doBookQuery(
        where,
        fieldsToExpand,
        additionalParams
      );
      return { books: result.data.results, count: result.data.count };
    } catch (err) {
      console.log("ERROR: caught axios.get error: " + err);
      throw err;
    }
  }

  private doBookQuery(
    where: string,
    fieldsToExpand: string[],
    additionalParams: {}
  ) {
    return axios.post(
      this.getParseTableUrl("books"),
      // Copied this approach (and comment) from blorg:
      // The filter may be too complex to pass in the URL (ie, GET params).  So we use POST with data that
      // specifies that the underlying operation is actually a GET.  (This doesn't seem to be documented, but
      // Andrew discovered that it works, and I got a confirming message on the parse-server slack channel.)
      // See BL-10187.
      {
        _method: "GET",
        where,
        include: fieldsToExpand.join(","),
        ...additionalParams, // e.g. limit, skip, count
      },
      {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
        },
      }
    );
  }

  public async getBookByDatabaseId(
    objectId: string,
    fieldsToExpand: string[] = []
  ): Promise<Book> {
    return await this.getBook(
      `{"objectId":{"$eq":"${objectId}"}}`,
      fieldsToExpand
    );
  }

  // This Azure function logs in to the Parse server, using a hard-coded user name ("catalog-service").
  // That account has a ParseServer "role" which is allowed to read the `apiAccount` and `user` tables.
  public async loginAsCatalogService(): Promise<string> {
    return await this.loginAsUser(
      "catalog-service",
      process.env["bloomParseServerCatalogServicePassword"] // should be the same for dev and production
    );
  }

  // This Azure function logs in to the Parse server, using a hard-coded user name ("book-cleanup").
  // That account has a ParseServer "role" which is allowed to delete the old unfinished uploads from the books table.
  public async loginAsBookCleanupUser(): Promise<string> {
    let password;
    switch (this.environment) {
      case Environment.PRODUCTION:
        password = process.env["bloomParseServerProdBookCleanupPassword"];
        break;
      case Environment.DEVELOPMENT:
        password = process.env["bloomParseServerDevBookCleanupPassword"];
        break;
      case Environment.UNITTEST:
        password = process.env["bloomParseServerUnitTestBookCleanupPassword"];
        break;
    }
    return await this.loginAsUser("book-cleanup", password);
  }

  // This Azure function logs in to the parse server using a hard-coded user name ("api-super-user").
  // That account has a parse server "role" which is allowed to modify all book records.
  // We use it when a user has permission to upload a book by being a collection editor
  // (as opposed to being the book uploader).
  private async loginAsApiSuperUser(): Promise<string> {
    let password;
    switch (this.environment) {
      case Environment.PRODUCTION:
        password = process.env["bloomParseServerProdApiSuperUserPassword"];
        break;
      case Environment.DEVELOPMENT:
        password = process.env["bloomParseServerDevApiSuperUserPassword"];
        break;
    }
    return await this.loginAsUser("api-super-user", password);
  }

  // Be sure you've already checked that the user has permissions to perform the operation on this book.
  public async loginAsApiSuperUserIfNeeded(userInfo: User, bookInfo: Book) {
    if (!BloomParseServer.isUploader(userInfo, bookInfo)) {
      return await this.loginAsApiSuperUser();
    }
    return undefined;
  }

  public async loginAsUnitTestUser(): Promise<string> {
    if (this.environment !== Environment.UNITTEST) {
      throw new Error("This function is only for unit tests");
    }
    return await this.loginAsUser("unittest@example.com", "unittest");
  }

  public async loginAsUser(
    username: string,
    password: string
  ): Promise<string> {
    const results = await axios.get(this.getParseLoginUrl(), {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        username: username,
        password: password,
      },
    });
    return results.data.sessionToken;
    // don't catch errors, let them go up
  }

  //Get an object containing the data from the apiAccount table row with the specified ID (not yet authenticated)
  public async getApiAccount(objectId: string): Promise<ApiAccount | null> {
    let sessionToken;
    try {
      sessionToken = await this.loginAsCatalogService(); /* ? */
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
      const results = await axios.get(this.getParseTableUrl("apiAccount"), {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
          "X-Parse-Session-Token": sessionToken,
        },
        params: {
          include: "user",
          // catalog-service role: cCGdsa3paf
          // catalog-service user: uNBPlYLenP
          where: `{"objectId":{"$eq":"${objectId}"}}`,
        },
      }); /* ? */

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

  public async getLoggedInUserInfo(sessionToken: string): Promise<User | null> {
    try {
      const results = await axios.get(this.getParseUserUrl(), {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
          "X-Parse-Session-Token": sessionToken,
        },
      });
      return results.data as User;
    } catch (error) {
      return null; // not a valid session token; no user info to return
    }
  }

  public async createBookRecord(bookInfo: any, sessionToken: string) {
    const url = this.getParseTableUrl("books");
    const results = await axios.post(url, bookInfo, {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
        "X-Parse-Session-Token": sessionToken,
        "Content-Type": "application/json",
      },
    });
    if (results.status !== 201) {
      throw new Error(`Failed to create book record`);
    }
    return results.data.objectId;
  }

  public async modifyBookRecord(
    bookObjectId: string,
    bookInfo: any,
    sessionToken: string
  ) {
    const results = await axios.put(
      this.getParseTableUrl("books") + "/" + bookObjectId,
      bookInfo,
      {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
          "X-Parse-Session-Token": sessionToken,
        },
      }
    );
    return results.data;
  }

  public static bookMatchesAtLeastOneFilter(
    bookInfo: Book,
    filters: IContentfulCollectionFilter[]
  ): boolean {
    if (filters.includes(kAllBooksFilter)) return true;

    // In theory, we could write more generic code to handle more (or all potential) use cases.
    // (And basically duplicate much of the logic in BloomLibrary2's LibraryQueryHooks.ts.)
    // But we expect the collections we list super-users for will always be defined using one of these two
    // filters (tag or brandingProjectName).
    // If we put a super-user on some other collection it will fail immediately and be easy to debug.
    // Another advantage of this approach is that by just doing these two simple checks, we avoid
    // another parse query because we're just taking a simple look at the information we already have
    // in the bookInfo object.
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      // By far, the most common filters are {tag: "bookshelf:someBookshelf"} or {tag: "list:someList"}
      const tag = filter["tag"];
      if (tag) {
        if (bookInfo.tags && bookInfo.tags.includes(tag)) {
          return true;
        } else {
          continue; // We didn't match the given tag, so we don't match the filter.
        }
      }
      const brandingProjectName = filter["brandingProjectName"];
      if (brandingProjectName) {
        if (
          bookInfo.brandingProjectName &&
          bookInfo.brandingProjectName === brandingProjectName
        ) {
          return true;
        }
      }
    }
    return false;
  }

  public static isUploader(userInfo: User, bookInfo: Book) {
    if (!bookInfo?.uploader?.objectId) return false;
    if (!userInfo?.objectId) return false;

    return bookInfo.uploader.objectId === userInfo.objectId;
  }

  // Check if user has permission to modify the book
  // either due to being the uploader or having collection editor permission.
  public static async isUploaderOrCollectionEditor(
    userInfo: User,
    bookInfo: Book
  ) {
    if (!bookInfo?.uploader) return false;

    if (this.isUploader(userInfo, bookInfo)) return true;

    if (!validateContentfulEnvironmentVariables()) {
      // This will result in a 500 error, which is appropriate.
      throw Error("Contentful environment variables are not set");
    }

    const filters = await getAllContentfulCollectionFiltersForUser(
      userInfo.email
    );

    return BloomParseServer.bookMatchesAtLeastOneFilter(bookInfo, [...filters]);
  }

  public async deleteBookRecord(bookObjectId: string, sessionToken: string) {
    const results = await axios.delete(
      this.getParseTableUrl("books") + "/" + bookObjectId,
      {
        headers: {
          "X-Parse-Application-Id": this.getParseAppId(),
          "X-Parse-Session-Token": sessionToken,
        },
      }
    );
    return results;
  }

  public async isModerator(userInfo: User) {
    const result = await axios.get(`${this.getParseUrlBase()}/roles`, {
      headers: {
        "X-Parse-Application-Id": this.getParseAppId(),
      },
      params: {
        where: {
          name: "moderator",
          users: {
            __type: "Pointer",
            className: "_User",
            objectId: userInfo.objectId,
          },
        },
      },
    });
    return result?.data?.results?.length > 0;
  }

  public static isValidDatabaseId(databaseId: string): boolean {
    // Check that it's a valid database ID; 10-character alphanumeric string
    return /^[0-9a-z]{10}$/i.test(databaseId);
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

export type User = {
  objectId: string;
  email: string;
  username: string;
  sessionToken: string;
};

export type Book = {
  objectId: string;
  uploader: User;
  title: string;
  bookInstanceId: string;
  baseUrl: string;
  tags: string[];
  brandingProjectName: string;
  updateSource: string;
  uploadPendingTimestamp: number;
  inCirculation: boolean;
  ACL: {};
  harvestState: string;
};
