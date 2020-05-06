import { AzureFunction, Context, HttpRequest } from "@azure/functions";

// An azure function that takes parameters that can be used to fill in all the required fields of a facebook link.
// input URL looks something like /social?link=<url>&title=<title>&img=<imgUrl>&description=<description>

const httpTrigger: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("HTTP trigger function 'social' processed a request.");
  const linkUrl = req.query.link || req.body.link;
  const title = req.query.title || req.body.title;
  const imgUrl = GetOptionalParameter("img", req);
  const description = GetOptionalParameter("description", req);

  if (linkUrl && title) {
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

function GetOptionalParameter(
  tag: string,
  req: HttpRequest
): string | undefined {
  return tag in req.query
    ? req.query[tag]
    : req.body && tag in req.body
    ? req.body[tag]
    : undefined;
}

function CreateLinkHtml(
  originalUrl: string,
  linkUrl: string,
  title: string,
  imgUrl: string,
  description: string
): string {
  // og:url must be set to originalUrl.  Using linkUrl instead does not work because the link is followed
  // and its HTML is scraped to find the values for the other OpenGraph metadata.
  // Note that link preview shows the base website of originalLink (ie, api.bloomlibrary.org or whatever)
  // as part of the display.
  /* eslint-disable indent */
  const imgMetaProps = imgUrl
    ? `        <meta
            property="og:image"
            content="${imgUrl}"
        />
        <meta property="og:image:width" content="256" />
        <meta property="og:image:height" content="256" />
`
    : /* eslint-enable indent */
      "";
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
${imgMetaProps}        <meta
            property="og:description"
            content="${description ||
              "Bloom makes it easy to create simple books and translate them into multiple languages."}"
        />
        <meta
            property="og:url"
            content="${originalUrl}"
        />
        <meta
            property="og:site_name"
            content="bloomlibrary.org" />
        <title>${title}</title>
        <!-- When displayed, this script causes this HTML content to be totally replaced without any trace left behind. -->
        <script>
            window.location.href="${linkUrl}";
        </script>
    </head>
    <body>
    </body>
</html>
`;
  /* eslint-enable indent */
}
