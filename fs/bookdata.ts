import BookInfo, { BookInfoSource } from "../common/bookinfo";

export default class BookData {
  // Get the Content-Type for the HTTP header based on the filename given
  // in either params.part1, params.part2, or params.part3.
  // params is an extensible object with only string values. (keys are always strings, fwiw)
  // The actual content of params is determined by function.json "route" bindings and the URL.
  public static getContentType(params: { [key: string]: string }): string {
    let contentType: string = "application/octet-stream"; // default for unknown data type
    let fileName: string;
    if (params.part3 && params.part3.length > 0) {
      fileName = params.part3;
    } else if (params.part2 && params.part2.length > 0) {
      fileName = params.part2;
    } else {
      fileName = params.part1;
    }
    if (fileName) {
      // This list could be extended further, but this should cover Bloom data.
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith(".png")) {
        contentType = "image/png";
      } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
        contentType = "image/jpeg";
      } else if (lowerName.endsWith(".svg")) {
        contentType = "image/svg+xml";
      } else if (lowerName.endsWith(".bmp")) {
        contentType = "image/bmp";
      } else if (lowerName.endsWith(".gif")) {
        contentType = "image/gif";
      } else if (lowerName.endsWith(".tif") || lowerName.endsWith(".tiff")) {
        contentType = "image/tiff";
      } else if (lowerName.endsWith(".txt")) {
        contentType = "text/plain";
      } else if (lowerName.endsWith(".htm") || lowerName.endsWith(".html")) {
        contentType = "text/html";
      } else if (lowerName.endsWith(".js")) {
        contentType = "text/js";
      } else if (lowerName.endsWith(".css")) {
        contentType = "text/css";
      } else if (lowerName.endsWith(".mp3")) {
        contentType = "audio/mpeg";
      } else if (lowerName.endsWith(".wav")) {
        contentType = "audio/wav";
      } else if (lowerName.endsWith(".ogg") || lowerName.endsWith(".oga")) {
        contentType = "audio/ogg";
      } else if (lowerName.endsWith(".mp4")) {
        contentType = "video/mpeg";
      } else if (lowerName.endsWith(".ogv")) {
        contentType = "video/ogg";
      } else if (lowerName.endsWith(".avi")) {
        contentType = "video/x-msvideo";
      } else if (lowerName.endsWith(".webm")) {
        contentType = "video/webm";
      } else if (lowerName.endsWith(".woff")) {
        contentType = "font/woff";
      } else if (lowerName.endsWith(".woff2")) {
        contentType = "font/woff2";
      } else if (lowerName.endsWith(".json")) {
        contentType = "application/json";
      } else if (lowerName.endsWith(".xhtml")) {
        contentType = "application/xhtml+xml";
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
    // console.log(`DEBUG BookData.getContentType() => ${contentType}`);
    return contentType;
  }

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
