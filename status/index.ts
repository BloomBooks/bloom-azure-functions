import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as df from "durable-functions";

const status = async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const operationId = request.params["operation-id"];
  if (!operationId) {
    return {
      status: 400,
      body: "Provide a valid operation-id",
    };
  }

  const client = df.getClient(context);

  const status = await client.getStatus(operationId);
  if (!status) {
    return {
      status: 404,
      body: "Status not found for the given operation-id",
    };
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

    return {
      status: 200,
      body: JSON.stringify(body),
      headers: { "Retry-After": "1" }, // in seconds
    };
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

app.http("status", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status/{operation-id}",
  handler: status,
});
