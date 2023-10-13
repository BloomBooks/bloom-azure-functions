import BloomParseServer, { Environment } from "../common/BloomParseServer";

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
        source = Environment.PRODUCTION;
        break;
      case "dev-upload":
        bucket = "BloomLibraryBooks-Sandbox";
        source = Environment.DEVELOPMENT;
        break;
      case "harvest":
        bucket = "bloomharvest";
        source = Environment.PRODUCTION;
        break;
      case "dev-harvest":
        bucket = "bloomharvest-sandbox";
        source = Environment.DEVELOPMENT;
        break;
      default:
        return null;
    }
    BloomParseServer.setServer(source);
    let bookInfo: any = await BloomParseServer.getBookInfoByObjectId(
      params.bookid
    );
    if (!bookInfo || !bookInfo.baseUrl) {
      return null;
    }
    let url = BloomParseServer.getS3LinkBase(bookInfo, bucket);
    if (params.part1 && params.part1.length > 0) {
      url = url + "/" + encodeUnicode(params.part1);
    }
    if (params.part2 && params.part2.length > 0) {
      url = url + "/" + encodeUnicode(params.part2);
    }
    if (params.part3 && params.part3.length > 0) {
      url = url + "/" + encodeUnicode(params.part3);
    }
    return url;
  }
}

// TODO: My only confidence in this is empirical, which isn't enough in matters of encoding! With this decode/encode, I haven't found any
// artifacts that can't be retrieved when navigating our OPDS from an OPDS client.
//
// The OPDS catalog (in this same project) is making links that invoke this service.
// Those links have some encoding already, e.g. "Doktor+Irwin.pdf"; If we re-encode that, well now we turn the + into %2B and of course S3 can't find it because we've now double encoded it.

// On the other hand, we have seen instances where we are given names with raw Thai characters, which *do* need to be encoded because S3 can't handle them.
// (note, it's not clear when this happens... a quick check of thai on dev )

// So... what I'm trying here is to just decode then re-encode.
function encodeUnicode(part: string): string {
  var s = part.replace(/\+/g, " "); // converts the + to space because decodeURIComponent left the + alone
  s = decodeURIComponent(s);
  return encodeURIComponent(s);
}
