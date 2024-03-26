import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as df from "durable-functions";

const status: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const operationId = req.params["operation-id"];
  if (!operationId) {
    context.res = {
      status: 400,
      body: "Provide a valid operation-id",
    };
    return;
  }

  const client = df.getClient(context);

  const status = await client.getStatus(operationId);
  if (!status) {
    context.res = {
      status: 404,
      body: "Status not found for the given operation-id",
    };
    return;
  } else {
    const body = {
      id: status.instanceId,
      status: getStatus(status.runtimeStatus),
    };
    if (status.runtimeStatus === "Failed") {
      // This would be a completely unexpected error.
      body["error"] = { code: 500, message: status.output };
    } else if (status?.output?.["error"]) {
      // This handles all the errors we have coded for.
      // i.e. all the ones for which we called utils.ts' handleError.
      body.status = "Failed";
      body["error"] = status.output?.["error"];
    } else if (status?.output) {
      body["result"] = status.output;
    }

    context.res = { status: 200, body: body };
    context.res.headers = { "Retry-After": "1" }; // in seconds
  }
};

// Well this is frustrating. Azure doesn't use its own guidelines for statuses.
// See https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md#post-or-delete-lro-pattern.
function getStatus(status: df.OrchestrationRuntimeStatus) {
  switch (status) {
    case df.OrchestrationRuntimeStatus.Completed:
      return "Succeeded";
    case df.OrchestrationRuntimeStatus.Running:
    case df.OrchestrationRuntimeStatus.ContinuedAsNew:
      return "Running";
    case df.OrchestrationRuntimeStatus.Failed:
    case df.OrchestrationRuntimeStatus.Terminated:
      return "Failed";
    case df.OrchestrationRuntimeStatus.Canceled:
      return "Canceled";
    case df.OrchestrationRuntimeStatus.Pending:
      return "NotStarted";
    default:
      return "Unknown";
  }
}

export default status;
