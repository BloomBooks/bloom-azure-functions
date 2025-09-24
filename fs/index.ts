import axios from "axios";
import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import BookData from "./bookdata";

// This function allows us to request a file in a book on S3 without knowing [it is on s3, who the uploader is, etc].
// Example use: https://api.bloomlibrary.org/v1/fs/upload/U8INuhZHlU/thumbnail.png
async function fs(request: HttpRequest): Promise<HttpResponseInit> {
  // https://api.bloomlibrary.org/v1/fs/harvest/FjB8SEZRZi/Nkhuku+na+Bongololo.bloompub?ref=Kolibri

  // See route definition below, where the URL should be of the form
  //     fs/{bucket}/{bookid}/{part1}/{part2?}/{part3?}
  // So we might get fs/dev-harvest/XmdUIm6vEa/Hornbill+and+Cassowary.bloomd
  //           (bucket="dev-harvest", bookid="XmdUIm6vEa", part1="Hornbill+and+Cassowary.bloomd",
  //            part2, part3 = undefined)
  // or fs/dev-upload/zXh5KYoyE6/How+Ant+Lost+His+Friend.pdf
  //           (bucket="dev-upload", bookid="zXh5KYoyE6", part1="How+Ant+Lost+His+Friend.pdf",
  //             part2, part3 = undefined)
  // or fs/dev-upload/fids0TH3Vy/audio/a96c71f9-c066-4e73-927f-9f8dcafee65c.mp3
  //           (bucket="dev-upload", bookid="fids0TH3Vy", part1="audio",
  //            part2="a96c71f9-c066-4e73-927f-9f8dcafee65c.mp3", part3=undefined)
  // (part3 is supported, but I'm not sure it's ever used/needed.)
  // Note that the available bucket values are "upload", "dev-upload", "harvest", and "dev-harvest".
  // These keywords are interpreted in BookData.getContentUrl().

  const urlArtifact = await BookData.getContentUrl(request.params);
  if (!urlArtifact) {
    return {
      status: 400,
      body: "Bad Request",
    };
  }
  let errorResult: any;
  const s3Result = await axios
    .get(urlArtifact, {
      responseType: "stream",
    })
    .catch((err) => {
      errorResult = err;
    });

  if (errorResult || !s3Result) {
    if (!errorResult) {
      return {
        status: 500,
        body: "Internal Server Error",
      };
    } else {
      // Return the error we encountered trying to get the file content.
      return {
        status: errorResult.response.status,
        body: errorResult.response.statusText,
      };
    }
  }

  // Return content as a blob.
  const headers = { ...s3Result.headers }; // start with whatever s3 itself returned
  // see https://docs.google.com/document/d/1Vub0SeQL6BQqyGoQBN6-cfi6AIRbcBHeV87KjnzZXDU/edit
  if (
    request.params.bucket.toLowerCase() === "harvest" &&
    request.params.part1.toLowerCase() === "thumbnails"
  ) {
    delete headers["cache-control"]; //we don't know which casing s3 uses, so remove the other one
    headers["Cache-Control"] = "max-age:31536000";
  }

  return {
    headers: headers,
    body: s3Result.data,
    status: s3Result.status,
  };
}

app.setup({ enableHttpStream: true });
app.http("fs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "fs/{bucket}/{bookid}/{part1}/{part2?}/{part3?}",
  handler: fs,
});
