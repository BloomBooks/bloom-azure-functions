# opds Function

The **opds** function generates [OPDS](https://specs.opds.io/opds-1.2.html) catalog pages for the Bloom Library.
The root page lists:

- links to pages for navigating the catalog.
  Currently this lists only one way, which is to browse by language.

Following a link from the root page, you get a page with:

- links to each language in the library

Following a language link, you come to a page that lists:

- links to each language in the library (This repetition is required by the OPDS spec. It is useful for simple e-readers which can then provide a navigation sidebar)
- entries for all the published books with available artifacts for that current language

## URL Parameters

The URL used to access the function always ends with _opds_ possibly followed by one or more query parameters. The
first query parameter is separated from the URL by a ? (question mark). Other query parameters are separated from
each other by an & (ampersand). The recognized query parameters are

`lang=xyz` Returns a page of book entries that contain the language from the given ISO code.

`tag=abc` Returns a page of book entries that contain the given tag.

`src=prod|dev` (default value is _prod_) Specify the source ParseServer to use for book information.

`epub=true` Only list books that have epubs.

`key=pat@example.com:1a2bc3de` The _apiAccount_ to use.

`minimalnavlinks=true` At the cost of not being OPDS-compliant, skip links that a smart API client doesn't really need. This will substantially reduce bandwidth and speed things up.

Example:
The following would pull entries from the development parse table that have visible ePUB artifacts in the French language.
`http://localhost:7071/api/opds?epub=true&lang=fr&src=dev&key=pat@example.com:1a2bc3de`

## Visibility of Entries

Any books that have the _inCirculation_ value from the _books_ table set to false will be omitted from any of the
generated OPDS pages. Any books that have a value set for _internetLimits_ will be omitted from any of the
generated OPDS pages. (This latter check may be overly restrictive, but is certainly safe legally. We can't
depend on people using our feed to honor the letter of restrictions we've been given for some books, let alone
the spirit.) Books that were created sooner than the `embargoDays` of the API Account will be omitted. No matter when books are updated, the API will return a link to the most recent edition, regardless of the embargo period.

Books that have tag `system:incoming` are omitted, waiting for the librarian to confirm that the book fits our site policies.

If `epub=true`, books whose ePUB artifact is set invisible by the _show_ object from the _books_ table
will be omitted. Only entries whose ePUB is in the desired language are shown (to the best of our ability to
determine this).

Links to artifacts will be omitted if the _show_ object makes them invisible. Books may have several languages listed
in their entry, and one of those languages must be the desired language.

### Api Accounts

The OPDS api endpoint uses "api accounts" to control access. In the future it may help with things like rate-limiting. These accounts are in the `apiAccount` table in our Parse Server. To use an account, you need a url parameter with the form `key=pat@example.com:1a2b3d4` where the string after the colon is the `objectId` of the row in the `apiAccount` table.

The server (or your machine if you are testing locally) must have the password for the `catalog-service` user in the environment variable `bloomParseServerCatalogServicePassword`. On the ParseServer, this user must exist and have the role of `catalog-service`.

Unit tests use a dev user named `unit-test@example.com`. The unit tests do not need to login as that user, so they don't need a password. However, they do need to provide a key that lets us use the `apiAccount` that points to that user. So in order to run the unit tests, you need to have an environment variable `bloomParseSeverUnitTestApiAccountObjectId` that gives that `objectId` for the row of `apiAccounts` that has the unit test account. You can identify this row because its `referrerTag` is "unit-test-account". If for some reason that row does not exist on the dev ParseServer, you can create it. Its `user` field needs to point to a `User` with the `username` of "unit-test@example.com".
