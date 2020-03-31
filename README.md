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


# Shared Environment Variables

Two environment variables need to be set for the **opds** and **book-resource** functions to access the relevant parse tables.

- *OpdsParseAppIdDev* - the AppId key to the development parse table (for *src=dev* in the input URL, the default for
the alpha stage of initial development)
- *OpdsParseAppIdProd* -  the AppId key to the production parse table (for *src=prod* in the input URL, the default
after the alpha stage of initial development)

See [Azure documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node#environment-variables)
for a discussion of how these environment variables can be set.

# opds Function

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

# book-resource Function

## URL format

The URL used to access this function always contains *book-resource* followed by the parse books
table id for the desired book and then followed by either a filename or by a keyword and a
filename to identify exactly which artifact is desired.  For example, consider:

`https://api.bloomlibrary.org/v1/ETU9lFxoBr/thumbnail.png`

This obtains the standard thumbnail image for the book with the parse table id of *ETU9lFxoBr*.
Or consider:

`https://api.bloomlibrary.org/v1/1x8DZ99/audio/123.wav`

This obtains the audio file *123.wav* for the book with the parse table id of *1x8DZ99*.

The URL may also have these query parameters at the end:

- **src=**XXX - (default value is *prod*) Specify the source parse table that provides the book
information.  Possible values are
    1. **prod** - production Bloom Library parse table
    2. **dev** - development Bloom Library parse table

