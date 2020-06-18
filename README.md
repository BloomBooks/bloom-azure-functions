# Development

These files work with the `ms-azuretools.vscode-azurefunctions` extension in vscode.

To debug locally, `F5` (`F1`, `Debug: Start Debugging`). For some reason this asks you to log into Azure. If all goes well, the terminal will output a url 

Once the code is committed to master, deployment to production is automated. Currently we have only one deployment: production. So all the testing you need to do, you need to do locally.

## Adding a new function

To add a new function, use the azure extension vscode; it has a lightning-bolt icon for "Create Function". Click that and then choose "HTTP trigger". It will offer a name like "HTTPTrigger1", replace that with the name of your function. That will create a folder; it is this folder name which controls the actual name of the trigger in the URL.

The actual URL is influenced by 
* a cloudflare page rule which redirects from `api.bloomlibrary.org` to this set of azure functions.
* the `hosts.json` file, which we have modified to insert `/v1/` before the name of your function.

The resulting production url for functions is then `api.bloomlibrary.org/v1/__FUNCTION__`


# Environment Variables

Two environment variables need to be set for the **opds** and **fs** functions to access the relevant parse tables.

- *OpdsParseAppIdDev* - the AppId key to the development parse table (for *src=dev* in the input URL, the default for
the alpha stage of initial development)
- *OpdsParseAppIdProd* -  the AppId key to the production parse table (for *src=prod* in the input URL, the default
after the alpha stage of initial development)

Some environment variables are needed for the **stats** function to connect to the postgresql database.
- *PGUSER*
- *PGHOST*
- *PGPASSWORD*
- *PGDATABASE*
- *PGPORT*

See [Azure documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node#environment-variables)
for a discussion of how these environment variables can be set.

# opds Function

The **opds** function generates OPDS catalog pages for the BLoom Library.  Each catalog page
provides entries for all the published books with available artifacts for a single language
plus links to the catalog pages for all the other languages with available books.

## URL Parameters

The URL used to access the function always ends with *opds* possibly followed by one or more query parameters.  The
first query parameter is separated from the URL by a ? (question mark).  Other query parameters are separated from
each other by an & (ampersand).  The recognized query parameters are

- **type=**XXX - (default value is *all*) Specify which type of catalog to return.  Possible values are
    1. **top** - Return the top-level OPDS page pointing to the ePUB and "all" pages.
    2. **epub** - Return a page which lists only entries that have a visible ePUB file to download and which
shows links only to epub artifacts.
    3. **all** - Return a page listing all visible entries (for the desired language) whether or not they have any
visible artifacts, and showing links to all visible artifacts.  The ePUB and PDF artifacts may or may not be in
the desired language if multiple languages are listed for the book.
- **lang=**XXX - (default value is *en*) Specify the ISO code of the desired language.
- **src=**XXX - (default value is *prod*) Specify the source parse table that provides the book
information.  Possible values are
    1. **prod** - production Bloom Library parse table
    2. **dev** - development Bloom Library parse table

For example, consider the following URL sent to the function:

`http://localhost:7071/api/opds?type=epub&lang=fr&src=dev`

This would pull entries from the development parse table that have visible epub artifacts in the French language,
and produce output that uses the following base URL for links to other pages/facets:

`https://localhost:7071/api/opds?type=epub&src=dev`

with the *lang* parameter set to the appropriate language code for the language facet of a link. (Parameters
which have the default value are omitted from the base URL.)

## Visibility of Entries

Any books that have the *inCirculation* value from the *books* table set to false will be omitted from any of the
generated OPDS pages.  Any books that have a value set for *internetLimits* will be omitted from any of the
generated OPDS pages.  (This latter check may be overly restrictive, but is certainly safe legally.  We can't
depend on people using our feed to honor the letter of restrictions we've been given for some books, let alone
the spirit.)

For the *type=epub* OPDS pages, books whose epub artifact is set invisible by the *show* object from the *books* table
will be omitted.  Only entries whose epub is in the desired language are shown (to the best of our ability to
determine this).

All books will be shown in the *type=all"* OPDS pages, but links to artifacts will be omitted if the *show* object
makes them invisible.  (In the *type=all* OPDS pages, books may have an entry without any artifact links, although we
expect this to be rare since PDF files are always uploaded to Bloom Library along with the book.)  Books may have
several languages listed in their entry, and one of those languages must be the desired language.

# fs Function

The **fs** function provides "file system" style access to the file content stored in the
Bloom Library S3 buckets, but hiding the fact in the URL that Amazon S3 storage is used.

## URL format

The URL used to access this function always contains *fs* followed by a keyword for the S3
bucket, the parse books table id for the desired book, and then either one, two, or three
parts of the file path to identify exactly which artifact is desired.  For example, consider:

`https://api.bloomlibrary.org/v1/fs/upload/OBdMAASvwn/thumbnail.png`

This obtains the standard thumbnail image uploaded with the book with the id *OBdMAASvwn* from the main Bloom Library bucket.  Or
consider:

`https://api.bloomlibrary.org/v1/fs/harvest/OBdMAASvwn/thumbnails/thumbnail-70.png`

This obtains the harvested thumbnail image sized to 70x70 pixels for the same book.

The available S3 bucket keywords are interpreted as follows:

- **upload** = BloomLibraryBooks
- **dev-upload** = BloomLibraryBooks-Sandbox
- **harvest** = bloomharvest
- **dev-harvest** = bloomharvest-sandbox

Either the content of the specified file is returned to the caller, or an error message (usually
404 "webpage not found") is returned.

## Caching

For just the `harvest/` path, if the path begins with "thumbnails", we return a Cache-Control of 1 year.

# social Function

The **social** function provides HTML marked up with OpenGraph metadata and javascript reload to the real
HTML for a book or bookshelf in Bloom Library.  This is needed for links in Facebook and other social
media to display the proper title, thumbnail image, and description for items in Bloom Library.  When the
returned HTML is displayed in a browser, it automatically reloads the actual book or bookshelf page which
is all that the user will ever see.  The returned HTML is seen by the caller only if the caller does not
attempt to display it.

## URL format

The URL used to access this function always contains *social* followed by multiple query parameters.  The
first query parameter is separated from the URL by a ? (question mark).  Other query parameters are separated
from each other by an & (ampersand).  The recognized query parameters are

- **link=**URL - This is the required URL to the website page containing the book details or the bookshelf.
- **title=**text - This is the required title of the book or bookshelf.
- **img=**URL - This is an optional URL to a (preferably) 256x256 thumbnail image of the book or bookshelf.
- **description=**text - This is an optional summary or description of the book or bookshelf.  It can be one
or two sentences long, and possibly longer (for short sentences).  If the description is not provided, a short
blurb about Bloom is used: "Bloom makes it easy to create simple books and translate them into
multiple languages."

A minimal example without img or description could look like this:

`http://api.bloomlibrary.org/v1/social?link=https://bloomlibrary.org/browse/detail/QyRR1qnIcp&title=Juliana+Wants+a+Pet`

A full example with all the query parameters could look like this:

`http://api.bloomlibrary.org/v1/social?link=https://bloomlibrary.org/browse/detail/QyRR1qnIcp&title=Juliana+Wants+a+Pet&img=https://api.bloomlibrary.org/v1/fs/harvest/QyRR1qnIcp/thumbnails/thumbnail-256.png%3Fversion=2020-04-16T04:37:54.853Z&description=Juliana+is+thinking+about+getting+a+pet.+What+pet+will+she+get%3F`

Note that the query parameter values must be URL encoded.  The examples use + to encode spaces (%20 would
also work) and %3F to encode question marks.  Every character other than 'A' through 'Z', 'a' through 'z',
'0' through '9', '.', '-', '*', and '_' must be URL encoded.

# stats Function

The **stats** function provides statistics about how and how much books are being used.

## URL format

The URL used to access this function always contains *stats* followed by one or more query parameters.  The
first query parameter is separated from the URL by a ? (question mark).  Other query parameters are separated
from each other by an & (ampersand).  The recognized query parameters are

One of these is required
- **book=**bookId - The book for which to retrieve statistics.
- **publisher=**publisherName - The publisher for which to retrieve statistics.

Optional
- **from=**startDate - Date in format YYYYMMDD, used to filter the results to a specific time range.
- **to=**endDate - Date in format YYYYMMDD, used to filter the results to a specific time range.

Examples:

- `http://api.bloomlibrary.org/v1/stats?book=12345ABC`
- `http://api.bloomlibrary.org/v1/stats?book=12345ABC&from=20200101`
- `http://api.bloomlibrary.org/v1/stats?book=12345ABC&to=20191231`
- `http://api.bloomlibrary.org/v1/stats?book=12345ABC&from=20190101&to=20191231`
