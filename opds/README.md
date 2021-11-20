# opds Function

The **opds** function generates OPDS catalog pages for the BLoom Library. Each catalog page
provides entries for all the published books with available artifacts for a single language
plus links to the catalog pages for all the other languages with available books.

## URL Parameters

The URL used to access the function always ends with _opds_ possibly followed by one or more query parameters. The
first query parameter is separated from the URL by a ? (question mark). Other query parameters are separated from
each other by an & (ampersand). The recognized query parameters are

- **type**=XXX - (default value is _all_) Specify which type of catalog to return. Possible values are

  1. **top** - Return the top-level OPDS page pointing to the ePUB and "all" pages.
  2. **epub** - Return a page which lists only entries that have a visible ePUB file to download and which
     shows links only to ePUB artifacts.
  3. **all** - Return a page listing all visible entries (for the desired language) whether or not they have any
     visible artifacts, and showing links to all visible artifacts. The ePUB and PDF artifacts may or may not be in
     the desired language if multiple languages are listed for the book.

- **lang**=XXX - (default value is _en_) Specify the ISO code of the desired language.
- **src**=XXX - (default value is _prod_) Specify the source parse table that provides the book
  information. Possible values are

  1. **prod** - production Bloom Library parse table
  2. **dev** - development Bloom Library parse table

`http://localhost:7071/api/opds?type=epub&lang=fr&src=dev`

This would pull entries from the development parse table that have visible ePUB artifacts in the French language,
and produce output that uses the following base URL for links to other pages/facets:

`https://localhost:7071/api/opds?type=epub&src=dev`

with the _lang_ parameter set to the appropriate language code for the language facet of a link. (Parameters
which have the default value are omitted from the base URL.)

## Visibility of Entries

Any books that have the _inCirculation_ value from the _books_ table set to false will be omitted from any of the
generated OPDS pages. Any books that have a value set for _internetLimits_ will be omitted from any of the
generated OPDS pages. (This latter check may be overly restrictive, but is certainly safe legally. We can't
depend on people using our feed to honor the letter of restrictions we've been given for some books, let alone
the spirit.)

For the _type=epub_ OPDS pages, books whose ePUB artifact is set invisible by the _show_ object from the _books_ table
will be omitted. Only entries whose ePUB is in the desired language are shown (to the best of our ability to
determine this).

All books will be shown in the _type=all"_ OPDS pages, but links to artifacts will be omitted if the _show_ object
makes them invisible. (In the _type=all_ OPDS pages, books may have an entry without any artifact links, although we
expect this to be rare since PDF files are always uploaded to Bloom Library along with the book.) Books may have
several languages listed in their entry, and one of those languages must be the desired language.

### Api Accounts

The OPDS api endpoint uses "api accounts" to control access. In the future it may help with things like rate-limiting. These accounts are in the `apiAccount` table in our Parse Server. To use an account, you need a url parameter with the form `key=pat@example.com:1a2b3d4` where the string after the colon is the `objectId` of the row in the `apiAccount` table.

The server (or your machine if you are testing locally) must have the password for the `catalog-service` user in the environment variable `bloomParseServerCatalogServicePassword`. On the ParseServer, this user must exist and have the role of `catalog-service`.

Unit tests use a user named `unit-test@example.com`. The unit tests do not need to login as that user, so they don't need a password. However, they do need to provide a key that lets us use the `apiAccount` that points to that user. So in order to run the unit tests, you need to have an environment variable `OpdsUnitTestApiAccountObjectId` that gives that `objectId` for the row of `apiAccounts` that has the unit test account. You can identify this row because its `referrerTag` is "unit-test-account". If for some reason that row does not exist, you can create it. Its `user` field needs to point to a `User` with the `username` of "unit-test@example.com".
