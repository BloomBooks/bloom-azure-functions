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

  public static createS3LinkBase(book: any) {
    const baseUrl = book.baseUrl.replace(/%2f/g, "/"); // I don't know why anyone thinks / needs to be url-encoded.
    const harvestHead = baseUrl.includes("/BloomLibraryBooks-Sandbox/")
      ? "https://s3.amazonaws.com/bloomharvest-sandbox/"
      : "https://s3.amazonaws.com/bloomharvest/";
    const safeUploader = book.uploader
      ? BookInfo.MakeUrlSafe(book.uploader.username)
      : "UNKNOWN";
    return harvestHead + safeUploader + "/" + book.bookInstanceId + "/";
  }

  public static MakeUrlSafe(text: string): string {
    // This needs to match whatever Harvester is using.  The first replace is probably enough.
    var text1 = text.replace("@", "%40");
    return text1.replace(/ /g, "+");
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
    return new Promise<any>((resolve, reject) =>
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
