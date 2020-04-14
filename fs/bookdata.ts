import BookInfo, { BookInfoSource } from "../common/bookinfo";

export default class BookData {
  // Get the real URL for the content based on the input URL parameters.
  // params is an extensible object with only string values. (keys are always strings, fwiw)
  // The actual content of params is determined by function.json "route" bindings and the URL.
  public static async getContentUrl(params: {
    [key: string]: string;
  }): Promise<any> {
    let bucket: string;
    let source: string;
    // The bucket parameter determines both the parse table source and a section of
    // the base URL.
    switch (params.bucket) {
      case "upload":
        bucket = "BloomLibraryBooks";
        source = BookInfoSource.PRODUCTION;
        break;
      case "dev-upload":
        bucket = "BloomLibraryBooks-Sandbox";
        source = BookInfoSource.DEVELOPMENT;
        break;
      case "harvest":
        bucket = "bloomharvest";
        source = BookInfoSource.PRODUCTION;
        break;
      case "dev-harvest":
        bucket = "bloomharvest-sandbox";
        source = BookInfoSource.DEVELOPMENT;
        break;
      default:
        return null;
    }
    BookInfo.setBookInfoSource(source, BookInfoSource.PRODUCTION);
    let infoArray: any[] = await BookInfo.getBookInfo(params.bookid);
    if (!infoArray || infoArray.length == 0 || !infoArray[0].baseUrl) {
      return null;
    }
    const bookInfo = infoArray[0];
    let url = BookInfo.getS3LinkBase(bookInfo, bucket);
    if (params.part1 && params.part1.length > 0) {
      url = url + "/" + params.part1;
    }
    if (params.part2 && params.part2.length > 0) {
      url = url + "/" + params.part2;
    }
    if (params.part3 && params.part3.length > 0) {
      url = url + "/" + params.part3;
    }
    return url;
  }
}
