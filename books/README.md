# book Function

The **book** function provides an API for uploading books to BloomLibrary.org.

## URL format

The URL used to access this function always contains `book` followed by an `action`.

`http://api.bloomlibrary.org/v1/book/{action}`

## Actions

### get-books (POST -- because we have to send a body)

TODO

### get-book-count-by-language (GET)

TODO

## Long-running actions

See [../status/README.md](../status/README.md) for details on how to call long-running actions and how they are implemented.

### upload-start (POST)

Gets everything ready for a client to begin uploading book files.

#### Request:

- Header:
  - `Authentication-Token`
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
  - `Authentication-Token`
    - parse server session token for the user uploading the book.
- Query parameter:
  - `transaction-id` (required)
    - Same transaction ID returned by `upload-start`.
- Body:
  - JSON representing the book record to be updated. Must include a baseUrl which begins with the `url` returned by `upload-start`.
    - `{"baseUrl": "https://my-base-url", "field": "value"}`

## Failures

Any failures result in

- 400 if there is an error related to the inputs provided.
- 500 if there is another error.

## Environment Variables

See [../README.md](../README.md) for some common environment variables needed for several functions.

- _BloomUploadPermissionManagerS3Key{suffix}_ - the AWS Access Key ID for the user which has permission to manage the S3 bucket for the given suffix.
- _BloomUploadPermissionManagerS3SecretKey{suffix}_ - the AWS Secret Access Key for the user.
  - suffix
    - Prod - bloom_upload_permission_manager
    - Dev - bloom_upload_permission_manager_dev
    - UnitTest - bloom_upload_permission_manager_unittest
