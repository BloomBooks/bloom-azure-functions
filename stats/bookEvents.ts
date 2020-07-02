import { Context } from "@azure/functions";

// Go to postgresql to get the information about a group of books.
// Determine which books by passing parameters to postgresql directly.
export async function processBookEvents(
  context: Context,
  filter: { branding: string; country: string }
  // fromDate: string,
  // toDate: string
) {
  const { Client } = require("pg");
  const client = new Client();
  await client.connect();

  const statsResult = await client.query(
    "SELECT * from get_book_events($1, $2)",
    [filter.branding, filter.country] //, fromDate, toDate]
  );

  // Return results as json
  context.res = {
    headers: { "Content-Type": "application/json" },
    body: { stats: statsResult.rows },
  };
  context.done();

  await client.end();
}
