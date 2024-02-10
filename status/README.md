# Family of functions used for long-running actions

I chose to document this family of functions together because they all work in concert.
I documented it in the status folder because that is the endpoint used by clients.

They make use of the durable functions feature of Azure functions.
And they attempt to implement the long-running actions pattern described in
https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#post-or-delete-lro-pattern
and
https://github.com/microsoft/api-guidelines/blob/vNext/azure/ConsiderationsForServiceDesign.md#long-running-operations.

## Overview

The general idea is to allow for long-running actions by having the initial request start the action then check on its status until it is complete.

## An initial request

Some actions may take longer than we want to (or can... timeouts typically occur at 100 seconds...) wait for a response.

In that case, the function code validates the initial input and then starts the action by calling the `longRunningActionOrchestrator` function.

The initial request returns a 202 Accepted response with an `Operation-Location` header which contains the URL to use to check on the status of the action. This URL will be for the `status` endpoint (see below).

Current examples are `book/{id}:upload-start` and `book/{id}:upload-finish`.

## status function

The `status` function provides an API endpoint for checking the status of long-running actions.

### URL format

    `/status/{operation-id}`

### Response

```
HTTP/1.1 200 OK

{
   "id": "123,
   "status": "Running"
}
```

```
HTTP/1.1 200 OK

{
   "id": "123,
   "status": "Succeeded",
   "result": { ... }
}
```

```
HTTP/1.1 200 OK

{
   "id": "123,
   "status": "Failed",
   "error": { code: 400, message: "..." }
}
```

Note, there are other statuses we have not yet implemented ("NotStarted", "Canceled"). But it would probably be good for clients to handle "Canceled" as a terminal status along with "Succeeded" and "Failed".

#### Headers

The response also includes a `Retry-After` header which indicates how long, in seconds, the client should wait before checking the status again.

Currently this is always 1 second.

## longRunningActionOrchestrator function

Currently, this is just a passthrough to the longRunningActions function.

## longRunningActions function

Currently, this just maps the long-running action back to a typescript function which handles the actual long-running task(s).
