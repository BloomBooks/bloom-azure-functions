import axios, { AxiosResponse } from "axios";
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BookData from "./bookdata";

// This function allows us to request a file in a book on S3 without knowing [it is on s3, who the uploader is, etc].
// Example use: https://api.bloomlibrary.org/v1/fs/upload/U8INuhZHlU/First+Aid/thumbnail.png
const fs: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  // See function.json, where the bindings declares that the URL should be of the form
  //     fs/{bucket}/{bookid}/{part1}/{part2?}/{part3?}
  // So we might get fs/dev-harvest/XmdUIm6vEa/Hornbill+and+Cassowary.bloomd
  //           (bucket="dev-harvest", bookid="XmdUIm6vEa", part1="Hornbill+and+Cassowary.bloomd",
  //            part2, part3 = undefined)
  // fs/dev-upload/zXh5KYoyE6/How+Ant+Lost+His+Friend/How+Ant+Lost+His+Friend.pdf
  //           (bucket="dev-upload", bookid="zXh5KYoyE6", part1="How+Ant+Lost+His+Friend",
  //             part2="How+Ant+Lost+His+Friend.pdf", part3 = undefined)
  // fs/dev-upload/fids0TH3Vy/Fatima+Can+Count/audio/a96c71f9-c066-4e73-927f-9f8dcafee65c.mp3
  //           (bucket="dev-upload", bookid="fids0TH3Vy", part1="Fatima+Can+Count",
  //            part2="audio", part3="a96c71f9-c066-4e73-927f-9f8dcafee65c.mp3")
  // Note that the available bucket values are "upload", "dev-upload", "harvest", and "dev-harvest".
  // These keywords are interpreted in BookData.getContentUrl().

  const contentType = BookData.getContentType(req.params);
  const urlArtifact = await BookData.getContentUrl(req.params);
  if (!urlArtifact) {
    context.res.status = 400;
    context.res.statusText = "Bad Request";
    return;
  }
  let errorResult: any;
  const result = await axios
    .get(urlArtifact, {
      responseType: "arraybuffer",
      headers: { "Content-Type": contentType }
    })
    .catch(err => {
      errorResult = err;
    });

  if (errorResult || !result) {
    if (!errorResult) {
      context.res.status = 500; // this shouldn't happen...
      context.res.statusText = "Internal Server Error";
    } else {
      // Return the error we encountered trying to get the file content.
      context.res.status = errorResult.response.status;
      context.res.statusText = errorResult.response.statusText;
    }
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
    body: result.data,
    status: result.status
  };
};

export default fs;
