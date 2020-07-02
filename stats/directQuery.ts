import { Context } from "@azure/functions";

export default class DirectQuery {
  public static async processStats(
    context: Context,
    directQuery: { branding: string; country: string }
    // fromDate: string,
    // toDate: string
  ) {
    const { Client } = require("pg");
    const client = new Client();
    await client.connect();

    const statsResult = await client.query(
      "SELECT * from get_books_stats_by_branding_and_country($1, $2)",
      [directQuery.branding, directQuery.country] //, fromDate, toDate]
    );

    // Return results as json
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { stats: statsResult.rows },
    };
    context.done();

    await client.end();
  }
}
