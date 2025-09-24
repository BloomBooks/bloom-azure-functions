import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

// An azure function that takes parameters that can be used to fill in all the required fields of a facebook link.
// input URL looks something like /social?link=<url>&title=<title>&img=<imgUrl>&description=<description>

const httpTrigger = async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("HTTP trigger function 'social' processed a request.");

  const body = request.body ? ((await request.json()) as any) : null;

  const linkUrl = request.query.get("link") || body?.link;

  if (!IsAllowedLink(linkUrl)) {
    return {
      status: 403,
      body: "403 Error: Creating a link to that resource is not allowed.",
    };
  }

  const title = request.query.get("title") || body?.title;
  const imgUrl = GetOptionalParameter("img", request, body);
  const imgWidth = GetOptionalParameter("width", request, body) || "256";
  const imgHeight = GetOptionalParameter("height", request, body) || "256";
  const description = GetOptionalParameter("description", request, body);

  if (linkUrl && title) {
    return {
      status: 200,
      headers: { "Content-Type": "text/html" },
      body: CreateLinkHtml(
        request.url,
        linkUrl,
        title,
        imgUrl,
        imgWidth,
        imgHeight,
        description
      ),
    };
  } else {
    return {
      status: 400,
      body: "Please pass a link url and title in the GET query string or in the POST request JSON",
    };
  }
};

// Returns true if the user is allowed to create a link to that resource, or false if the link is not allowed (e.g. external link)
function IsAllowedLink(linkUrl: string): boolean {
  if (!linkUrl) {
    // Even though it's not a very useful link, we don't want to return a disallowed message for it.
    // Return true for now. Let some other code deal with this.
    return true;
  }

  // URL Constructor is unhappy if it doesn't start with the protocol.
  if (!linkUrl.startsWith("http://") && !linkUrl.startsWith("https://")) {
    linkUrl = "http://" + linkUrl;
  }
  try {
    const url = new URL(linkUrl);
    const hostname = url.hostname.toLowerCase();

    // Allow bloomlibary.org, or its subdomains, but not any links to any other domain.
    return (
      hostname &&
      (hostname === "bloomlibrary.org" ||
        hostname.endsWith(".bloomlibrary.org"))
    );
  } catch (error) {
    // Probably a malformed URL
    return false;
  }
}

function GetOptionalParameter(
  tag: string,
  request: HttpRequest,
  body?: any
): string | undefined {
  return request.query.get(tag) || body?.[tag];
}

function CreateLinkHtml(
  originalUrl: string,
  linkUrl: string,
  title: string,
  imgUrl: string,
  imgWidth: string,
  imgHeight: string,
  description: string
): string {
  /* eslint-disable indent */
  return (
    `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta
            property="og:title"
            content="${title}"
        />
        <meta property="og:type" content="website" />` +
    // og:image:width and og:image:height reserve space for the image until it can be loaded.  If
    // the image is not close to being square, the link display may not try to fit it in the square
    // to the left of the display but may display the image across the top of the link display.
    // The role of the size is unclear. But it seems to at least effect the croping or sizing.
    //  The preview code reserved a 158x158
    // square for an image that we claimed to be 256x256. This behavior is what we want for book thumbnails
    //  if that's what facebook is going to fit the final image into. But don't forget this is for more than
    // thumbnails. It's for any page on blorg, which will include different shapes of images.
    (imgUrl
      ? `
        <meta
          property = "og:image"
          content = "${imgUrl}"
        />
        <meta property="og:image:width" content = "${imgWidth}" />
        <meta property="og:image:height" content = "${imgHeight}" />`
      : "") +
    `
        <meta
            property="og:description"
            content="${
              description ||
              "Bloom makes it easy to create simple books and translate them into multiple languages."
            }"
        />` +
    // og:url must be set to originalUrl.  Using linkUrl instead does not work because the link is
    // followed and its HTML is scraped to find the values for the other OpenGraph metadata.  Note
    // that link preview shows the base website of og: url's value (eg, source.bloomlibrary.org or
    // whatever) as part of the display.
    `
        <meta
            property="og:url"
            content="${originalUrl}"
        />` +
    // og:site_name is called "optional" and "generally recommended" by https://ogp.me.  og:site_name
    // is described thusly: "If your object is part of a larger web site, the name which should be
    // displayed for the overall site."  This sounds promising enough to include, but Facebook appears
    // to ignore it.
    `
        <meta
            property="og:site_name"
            content="bloomlibrary.org"
        />
        <title>${title}</title>` +
    // When the user clicks on a link that generates this HTML (or finds a way to navigate to it directly),
    // we want them to end up at linkUrl which will usually be a book or page on bloomlibrary.org.  When
    // displayed, this script causes this HTML content to be totally replaced without any trace left behind.
    `
        <script>
            window.location.href="${linkUrl}";
        </script>
    </head>
    <body>
    </body>
</html>
`
  );
  /* eslint-enable indent */
}

app.http("social", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: httpTrigger,
});

export default httpTrigger;
