# Development

Where possible, develop using unit tests (e.g., `npm test`) and then just do a sanity check using the actual http server. `WallabyJS` is highly recommended for instant feedback.

These files work with the `ms-azuretools.vscode-azurefunctions` extension in vscode.

To debug locally, `F5` (`F1`, `Debug: Start Debugging`). If all goes well, the terminal will output various urls for the functions.

Careful! In July 2023, running via F5 caused a download and install of Azure Functions Core Tools version 3 which is past EOL and will not work correctly. Make sure you get [version 4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=windows%2Cportal%2Cv2%2Cbash&pivots=programming-language-typescript#install-the-azure-functions-core-tools)!
When you run, the log will display the Function Runtime version. Ensure it is 4.
(If you get an error about unsupported node version, it is likely using Function Runtime version 3.)

Now you can use your favorite REST client to run each function. Or you can connect your local BloomLibrary2 to point to this (see ApiConnection.ts there).

By default, the timer functions are set to not do anything when running locally. Each one has a `runEvenIfLocal` const which can be set to true if desired.
Note that without a local storage emulator, you will see errors for the timer functions (which can be ignored). If you want to set up local storage, see https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azurite?tabs=visual-studio. Apparently, there is a VSCode extension useful for this as well.

## Package manager

**Use npm**, not yarn.

The auto-deploy from github feature on Azure uses npm.

## Deployment

Once the code is committed to master, deployment to production is automated. Currently we have only one deployment: production. So all the testing you need to do, you need to do locally.

## Adding a new function

To add a new function, use the azure extension vscode; it has a lightning-bolt icon for "Create Function". Click that and then choose "HTTP trigger". It will offer a name like "HTTPTrigger1", replace that with the name of your function. That will create a folder; it is this folder name which controls the actual name of the trigger in the URL.

The actual URL is influenced by

- a cloudflare page rule which redirects from `api.bloomlibrary.org` to this set of azure functions.
- the `hosts.json` file, which we have modified to insert `/v1/` before the name of your function.

The resulting production url for functions is then `api.bloomlibrary.org/v1/__FUNCTION__`

# Environment Variables

Two environment variables need to be set for the **book**, **opds**, and **fs** functions to access the relevant parse tables.

- _ParseAppIdProd_ - the APP_ID from the bloom-parse-server-production configuration in Azure
- _ParseAppIdDev_ - the APP_ID from the bloom-parse-server-develop configuration in Azure
- _ParseAppIdUnitTest_ - the APP_ID from the bloom-parse-server-unittest configuration in Azure

### postgreSQL connection variables

**stats** and **dailyTimer** functions connect to the postgresql database. The following environment variables are used directly by the node-postgres library (npm pg).

**stats** and **dailyTimer** functions

- _PGHOST_
- _PGDATABASE_
- _PGPORT_

**stats** function - uses readonly permissions

- _PGUSER_
- _PGPASSWORD_

**dailyTimer** function

- When the function runs, these are used to temporarily overwrite the environment variables above to provide write privileges.
- _PGUSER_admin_
- _PGPASSWORD_admin_

See [Azure documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node#environment-variables)
for a discussion of how these environment variables can be set.

# opds Function

See the README in that folder.

# fs Function

The **fs** function provides "file system" style access to the file content stored in the
Bloom Library S3 buckets, but hiding the fact in the URL that Amazon S3 storage is used.

## URL format

The URL used to access this function always contains _fs_ followed by a keyword for the S3
bucket, the parse books table id for the desired book, and then either one, two, or three
parts of the file path to identify exactly which artifact is desired. For example, consider:

`https://api.bloomlibrary.org/v1/fs/upload/OBdMAASvwn/thumbnail.png`

This obtains the standard thumbnail image uploaded with the book with the id _OBdMAASvwn_ from the main Bloom Library bucket. Or
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
HTML for a book or bookshelf in Bloom Library. This is needed for links in Facebook and other social
media to display the proper title, thumbnail image, and description for items in Bloom Library. When the
returned HTML is displayed in a browser, it automatically reloads the actual book or bookshelf page which
is all that the user will ever see. The returned HTML is seen by the caller only if the caller does not
attempt to display it.

## URL format

The URL used to access this function always contains _social_ followed by multiple query parameters. The
first query parameter is separated from the URL by a ? (question mark). Other query parameters are separated
from each other by an & (ampersand). The recognized query parameters are

- **link**=URL - This is the required URL to the website page containing the book details or the bookshelf.
- **title**=text - This is the required title of the book or bookshelf.
- **description**=text - This is an optional summary or description of the book or bookshelf. It can be one
  or two sentences long, and possibly longer (for short sentences). If the description is not provided, a short
  blurb about Bloom is used: "Bloom makes it easy to create simple books and translate them into
  multiple languages."
- **img**=URL - This is an optional URL to a (preferably) 300x300 thumbnail image of the book or bookshelf. Harvester creates this as `thumbnail-300x300.png`. Our other thumbnail files don't constrain both height and width and can end up with one side less than 200px which Facebook won't display.
- **width**=number - Image width, in pixels. Defaults to 256.
- **height**=number - Image height, in pixels. Defaults to 256.

The width and height are optional but help Facebook present the image immediately instead of waiting for them to asynchronously process the image.

A minimal example without img or description could look like this:

`http://social.bloomlibrary.org/v1/social?link=https://bloomlibrary.org/book/QyRR1qnIcp&title=Juliana+Wants+a+Pet`

A full example with all the query parameters could look like this:

`http://social.bloomlibrary.org/v1/social?link=https://bloomlibrary.org/book/QyRR1qnIcp&title=Juliana+Wants+a+Pet&img=https://api.bloomlibrary.org/v1/fs/harvest/QyRR1qnIcp/thumbnails/thumbnail-300x300.png%3Fversion=2020-04-16T04:37:54.853Z&width=300&height=300&description=Juliana+is+thinking+about+getting+a+pet.+What+pet+will+she+get%3F`

Note that the query parameter values must be URL encoded. The examples use + to encode spaces (%20 would
also work) and %3F to encode question marks. Every character other than 'A' through 'Z', 'a' through 'z',
'0' through '9', '.', '-', '\*', and '\_' must be URL encoded.

# stats Function

The **stats** function provides statistics about how and how much books are being used.

See `./stats/README.md`.

# dailyTimer Function

The **dailyTimer** function is a timer function set to run once per day.

Currently, it is used to refresh the materialized views in the postgresql analytics database.

# contentfulToCrowdin Function

The **contentfulToCrowdin** function provides tools for using Crowdin to localize strings in Contentful.

See `./contentfulToCrowdin/README.md`.
