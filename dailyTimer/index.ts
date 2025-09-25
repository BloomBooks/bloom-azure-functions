import { AzureFunction, Context } from "@azure/functions";
import { isLocalEnvironment } from "../common/utils";

const runEvenIfLocal: boolean = false;

// See README for schedule of timer-triggered tasks
const timerTrigger: AzureFunction = async function (
  context: Context,
  dailyTimer: any
): Promise<void> {
  context.log("dailyTimer trigger function started", new Date().toISOString());

  if (dailyTimer.isPastDue) {
    context.log("dailyTimer trigger function is running late");
  }

  const errors = [];
  try {
    await refreshMaterializedViewsAsync(context);
    context.log("refreshMaterializedViews() succeeded");
  } catch (e) {
    context.log.error("refreshMaterializedViews() failed:", e);
    errors.push(e);
  }

  context.log("dailyTimer trigger function finished", new Date().toISOString());
  if (errors.length > 0) {
    throw errors[0];
  }
};

async function refreshMaterializedViewsAsync(context: Context) {
  // By default, we don't want to run this if we are running the functions locally.
  // Typically, if we are running locally, we want to test some other function, not this one.
  // And if we let this run, it will perform a long, blocking action on the production database.
  if (!runEvenIfLocal && isLocalEnvironment()) return;

  // These environment variables are used by pg (node-postgres).
  // We leave them normally set to the values for the readonly (stats) user which is safer
  // (and used by the stats function).
  // But here we need elevated privileges, so we temporarily copy them over from separate env variables
  // for the admin (silpgadmin) user.
  process.env.PGUSER = process.env.PGUSER_admin;
  process.env.PGPASSWORD = process.env.PGPASSWORD_admin;

  const { Client } = require("pg");
  const client = new Client();
  try {
    await client.connect();
    await client.query("call common.refresh_materialized_views()");
  } finally {
    await client
      .end()
      .catch((e) => context.log.error("Error closing database connection:", e));
  }
}

export default timerTrigger;
