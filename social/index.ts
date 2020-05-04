import { AzureFunction, Context, HttpRequest } from "@azure/functions";

// An azure function that takes parameters that can be used to fill in all the required fields of a facebook link.
// input URL looks something like /social?link=<url>&title=<title>&img=<imgUrl>&description=<description>

const httpTrigger: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("HTTP trigger function processed a request.");
  const linkUrl = req.query.link || req.body.link;
  const title = req.query.title || req.body.title;
  const imgUrl = req.query.img || req.body.img;
  const description = req.query["description"] || req.body["description"];

  if (linkUrl && title && imgUrl) {
    context.res = {
      // status: 200, /* Defaults to 200 */
      headers: { "Content-Type": "text/html" },
      body: CreateLinkHtml(req.url, linkUrl, title, imgUrl, description),
    };
  } else {
    context.res = {
      status: 400,
      body:
        "Please pass a link url, title, img url, and description in the GET query string or in the POST request JSON",
    };
  }
};

export default httpTrigger;

function CreateLinkHtml(
  originalUrl: string,
  linkUrl: string,
  title: string,
  imgUrl: string,
  description: string
): string {
  /* eslint-disable indent */
  return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta
            property="og:title"
            content="${title}"
        />
        <meta property="og:type" content="website" />
        <meta
            property="og:image"
            content="${imgUrl}"
        />
        <meta
            property="og:description"
            content="${description ||
              "Bloom makes it easy to create simple books and translate them into multiple languages."}"
        />
        <!-- It's unclear whether this should be originalUrl or linkUrl.  It's the URL for which facebook stores analytics. -->
        <meta
            property="og:url"
            content="${originalUrl}"
        />
        <title>${title}</title>

        <script>
            window.location.href="${linkUrl}";  // this causes this content to be totally replaced without any trace left behind
        </script>
    </head>
    <body>
    </body>
</html>
`;
  /* eslint-enable indent */
}
