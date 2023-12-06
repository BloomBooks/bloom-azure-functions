export enum LongRunningAction {
  UploadStart,
  UploadFinish,
}

export function createResponseWithAcceptedStatusAndStatusUrl(
  instanceId: string,
  originalRequestUrl: string
) {
  return {
    status: 202, // Accepted
    // One could make the argument that the status should be "NotStarted",
    // but in the happy path, the action **has** already started. I suppose the "right"
    // thing to do might be to get the real status (client.getStatus(id)) at this point.
    // But it doesn't seem worth the complication. Either way, the client will call the status
    // endpoint to get the real status.
    body: { id: instanceId, status: "Running" },
    headers: {
      "Operation-Location": `${originalRequestUrl.substring(
        0,
        originalRequestUrl.indexOf("/v1/")
      )}/v1/status/${instanceId}`,
    },
  };
}

export function handleError(
  httpCode: 400 | 404 | 500, // More can be added if/when needed
  message: string
) {
  return {
    failed: true,
    // see https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#post-or-delete-lro-pattern
    error: { code: httpCode, message: message },
  };
}
