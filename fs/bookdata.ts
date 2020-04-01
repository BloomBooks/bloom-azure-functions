import BookInfo, { BookInfoSource } from "../common/bookinfo";

export default class BookData {
  // Get the Content-Type for the HTTP header based on the filename given
  // in either params.part1 or params.part2.
  public static getContentType(params: { [key: string]: string }): string {
    let contentType: string = "application/data";
    let fileName: string;
    if (params.part2 && params.part2.length > 0) {
      fileName = params.part2;
    } else {
      fileName = params.part1;
    }
    if (fileName) {
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith(".png")) {
        contentType = "image/png";
      } else if (lowerName.endsWith("jpg") || lowerName.endsWith(".jpeg")) {
        contentType = "image/jpg";
      } else if (lowerName.endsWith(".htm") || lowerName.endsWith(".html")) {
        contentType = "application/html";
      } else if (lowerName.endsWith(".epub")) {
        contentType = "application/epub+zip";
      } else if (lowerName.endsWith(".pdf")) {
        contentType = "application/pdf";
      } else if (
        lowerName.endsWith(".bloomd") ||
        lowerName.endsWith(".bloompub")
      ) {
        contentType = "application/bloompub";
      }
    }
    console.log(`DEBUG BookData.getContentType() => ${contentType}`);
    return contentType;
  }

  // Get the real URL for the content based on the input URL parameters.
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
    }
    BookInfo.setBookInfoSource(source, BookInfoSource.PRODUCTION);
    let infoArray: any[] = await BookInfo.getBookInfo(params.bookid);
    if (!infoArray || infoArray.length == 0 || !infoArray[0].baseUrl) {
      return null;
    }
    const bookInfo = infoArray[0];
    let url = BookInfo.createS3LinkBase(bookInfo, bucket);
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
