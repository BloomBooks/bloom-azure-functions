import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BookData from "./bookdata";

// This function allows us to request a file in a book on S3 without knowing [it is on s3, who the uploader is, etc].
// Example use: https://api.bloomlibrary.org/v1/book-resource/ETU9lFxoBr/thumbnail.png
const bookResource: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  // See function.json, where the bindings declares that the URL should be of the form /{id}/{part1}/{part2}
  // So we might get /1X8DZ99/thumbnail256.png (part1 = thumbnail256.png part2 = undefined), or
  // /1x8DZ99/audio/123.wav (part1 = audio, part2 = 123.wav)

  context.res = {
    headers: { "Content-Type": BookData.getContentType(req.params) },
    body: await BookData.getContent(req.params, req.query)

    // TODO: given bookid, connect to our ParseSever and  get the root of the S3 Path.
    // Then add part1 & part2, and get that file.
    // Then return it as a blob.
    // Return appropriate error codes and message, if something goes wrong.
  };
};

export default bookResource;
