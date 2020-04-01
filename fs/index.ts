import axios from "axios";
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BookData from "./bookdata";

// This function allows us to request a file in a book on S3 without knowing [it is on s3, who the uploader is, etc].
// Example use: https://api.bloomlibrary.org/v1/book-resource/ETU9lFxoBr/thumbnail.png
const fs: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  // See function.json, where the bindings declares that the URL should be of the form /{bucket}/{bookid}/{part1}/{part2}
  // So we might get /upload/1X8DZ99/thumbnail256.png (part1 = thumbnail256.png part2 = undefined), or
  // /dev-harvest/1x8DZ99/audio/123.wav (part1 = audio, part2 = 123.wav)

  const contentType = BookData.getContentType(req.params);
  const urlArtifact = await BookData.getContentUrl(req.params);
  let errorCode: number = 0;
  const resultPromise = new Promise<any>((resolve, reject) =>
    axios
      .get(urlArtifact, {
        responseType: "arraybuffer",
        headers: { "Content-Type": contentType }
      })
      .then(result => {
        resolve(result);
      })
      .catch(err => {
        errorCode = err.response.status;
        resolve(err);
        //reject(err);  causes outer function to return error code 500
      })
  );
  const result = await resultPromise;

  if (errorCode != 0) {
    // Return the error we encountered trying to get the file content.
    context.res.status = errorCode;
    return;
  }

  // Return content as a blob.
  let headers = {};
  let type = result.headers["content-type"];
  if (!type) {
    type = result.headers["Content-Type"];
  }
  if (!type) {
    type = contentType;
  }
  headers["Content-Type"] = type;
  let cache = headers["cache-control"];
  if (!cache) {
    cache = headers["Cache-Control"];
  }
  if (cache) {
    headers["Cache-Control"] = cache;
  }

  context.res = {
    headers: headers,
    body: result.data
  };
};

export default fs;
