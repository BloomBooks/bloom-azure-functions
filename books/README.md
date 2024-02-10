# books Function

The **books** function provides an API for working with books on BloomLibrary.org.

## URL format

The URL used to access this function always contains `books`.
It may be followed by a book ID: `books/id`.
The book ID may have an action: `books/id:action`.

`http://api.bloomlibrary.org/v1/books/id:action`

## Actions

## Long-running actions

See [../status/README.md](../status/README.md) for details on how to call long-running actions and how they are implemented.

### upload-start (POST)

Gets everything ready for a client to begin uploading book files.

See the API documentation for details.

### upload-finish (POST)

Finalizes the update after the client uploads the book files.

See the API documentation for details.

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
