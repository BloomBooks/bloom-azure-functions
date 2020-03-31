import axios from "axios";
import BookInfo, { BookInfoSource } from "../common/bookinfo";

export default class BookData {
  // Get the Content-Type for the HTTP header
  public static getContentType(params: { [key: string]: string }): string {
    let contentType: string = "application/data";
    let fileName: string;
    if (params.part2) {
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
    return contentType;
  }

  public static async getContent(
    params: { [key: string]: string },
    query: { [key: string]: string }
  ): Promise<any> {
    BookInfo.setBookInfoSource(query["src"], BookInfoSource.DEVELOPMENT);
    let bookInfo = await BookInfo.getBookInfo(params.part1);
    if (!bookInfo.baseUrl) {
      return null;
    }
  }
}
