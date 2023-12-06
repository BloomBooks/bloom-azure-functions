import * as df from "durable-functions";

const longRunningActionOrchestrator = df.orchestrator(function* (context) {
  return yield context.df.callActivity(
    "longRunningActions",
    context.df.getInput()
  );
});

export default longRunningActionOrchestrator;
