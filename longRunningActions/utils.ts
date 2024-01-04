import { Context } from "@azure/functions";
import * as df from "durable-functions";

export enum LongRunningAction {
  UploadStart,
  UploadFinish,
}

// Starts a long-running action using durable-functions.
// Returns the instance ID of the action which will be used by the client to check the status.
// e.g. https://api.bloomlibrary.org/v1/status/{instanceId}
export async function startLongRunningAction(
  context: Context,
  action: LongRunningAction,
  params: unknown
): Promise<string> {
  const client = df.getClient(context);
  return await client.startNew("longRunningActionOrchestrator", undefined, {
    action: action,
    params: params,
  });
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
  message: string,
  context: Context,
  error: Error
) {
  if (error && context) context.log.error(error);
  return {
    failed: true,
    // see https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#post-or-delete-lro-pattern
    error: { code: httpCode, message: message },
  };
}
