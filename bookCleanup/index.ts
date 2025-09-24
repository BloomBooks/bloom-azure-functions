import { app, InvocationContext, Timer } from "@azure/functions";
import { Environment, isLocalEnvironment } from "../common/utils";
import { bookCleanupInternal } from "./bookCleanup";

const runEvenIfLocal: boolean = false;

// See README for schedule of time triggered tasks
export async function bookCleanupTimer(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  // By default, we don't want to run this if we are running the functions locally.
  if (!runEvenIfLocal && isLocalEnvironment()) return;

  context.log("bookCleanup trigger function started", new Date().toISOString());

  if (timer.isPastDue) {
    context.log("bookCleanup trigger function is running late");
  }

  try {
    context.log("running book cleanup for development");
    await bookCleanupInternal(Environment.DEVELOPMENT, context.log);
    context.log("running book cleanup for production");
    await bookCleanupInternal(Environment.PRODUCTION, context.log);
    context.log("book cleanup succeeded");
  } catch (e) {
    context.log("book cleanup failed", e);
  }

  context.log(
    "bookCleanup trigger function finished",
    new Date().toISOString()
  );
}

app.timer("bookCleanup", {
  schedule: "0 40 12 * * *",
  handler: bookCleanupTimer,
});
