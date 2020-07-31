import { AzureFunction, Context } from "@azure/functions";

const timerTrigger: AzureFunction = async function(
  context: Context,
  dailyTimer: any
): Promise<void> {
  context.log("dailyTimer trigger function started", new Date().toISOString());

  if (dailyTimer.isPastDue) {
    context.log("dailyTimer trigger function is running late");
  }

  try {
    await refreshMaterializedViews();
    context.log("refreshMaterializedViews() succeeded");
  } catch (e) {
    context.log("refreshMaterializedViews() failed", e);
  }

  context.log("dailyTimer trigger function finished", new Date().toISOString());
  context.done();
};

async function refreshMaterializedViews() {
  // These environment variables are used by pg (node-postgres).
  // We leave them normally set to the values for the readonly (stats) user which is safer
  // (and used by the stats function).
  // But here we need elevated privileges, so we temporarily copy them over from separate env variables
  // for the admin (silpgadmin) user.
  process.env.PGUSER = process.env.PGUSER_admin;
  process.env.PGPASSWORD = process.env.PGPASSWORD_admin;

  const { Client } = require("pg");
  const client = new Client();
  await client.connect();

  await client.query("select common.refresh_materialized_views()");

  await client.end();
}

export default timerTrigger;
