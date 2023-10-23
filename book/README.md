# book Function

The **book** function provides an API for uploading books to BloomLibrary.org.

## URL format

The URL used to access this function always contains `book` followed by an `action`.

`http://api.bloomlibrary.org/v1/book/{action}`

## actions

### upload-start (POST)

Gets everything ready for a client to begin uploading book files.

#### Request:

- Header:
  - `Session-Token`
    - parse server session token for the user uploading the book.
- Query parameter:
  - `existing-book-object-id` (optional)
    - `books` record ID of an existing book to be updated. If not provided, a new book will be created.

#### Response:

```
{
    url: <S3 parent "folder" where book files will be uploaded; does not include book title>,
    transaction-id: <`books` record ID of the book to be uploaded; will equal `existing-book-object-id` if provided>,
    credentials: <temporary credentials which will be used to upload the book files to S3>
}
```

### upload-finish (POST)

Finalizes the update after the client uploads the book files.

#### Request:

- Header:
  - `Session-Token`
    - parse server session token for the user uploading the book.
- Query parameter:
  - `transaction-id` (required)
    - Same transaction ID returned by `upload-start`.
- Body:
  - JSON representing the book record to be updated. Must include a baseUrl which begins with the `url` returned by `upload-start`.
    - `{"baseUrl": "https://my-base-url", "field": "value"}`

### Failures

Any failures result in

- 400 if there is an error related to the inputs provided.
- 500 if there is another error.

## Environment Variables

See `../README.md`.
