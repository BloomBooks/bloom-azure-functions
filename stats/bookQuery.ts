import axios, { AxiosRequestConfig } from "axios";
import { Context } from "@azure/functions";
const moment = require("moment");

function isValidDateStr(dateStr: string | null | undefined): boolean {
  return new moment(dateStr, "YYYY-MM-DD", true).isValid();
}

// Go to postgresql to get the information about a group of books.
// Determine the group of books by asking parse using the given query.
export async function processBookEventsUsingBookQuery(
  context: Context,
    bookQuery: { url: string; options: AxiosRequestConfig },
    fromDateStr: string | undefined,
    toDateStr: string | undefined
) {
  // Send query to parse
  const response = await axios.get(bookQuery.url, bookQuery.options);

  // Make a temp table of the book IDs and book instance IDs in postgres
  // and
  // Query against that table in postgres
  if (response.status === 200 && response.data && response.data.results) {
    let booksInfo = response.data.results;

    const { Client } = require("pg");
    const client = new Client();
    await client.connect();

    const booksInfoFormattedForInsert: string = booksInfo
      .map((b) => `('${b.objectId}','${b.bookInstanceId}')`)
      .join(",");

    // Crude check for sql injection...
    if (booksInfoFormattedForInsert.includes(";")) {
      fail(context, "Unexpected book info caused stats lookup to fail");
    }

      let get_books_stats_args = "";
      if (isValidDateStr(fromDateStr) && isValidDateStr(toDateStr)) {
        get_books_stats_args = `'${fromDateStr}', '${toDateStr}'`;
      } else if (fromDateStr && toDateStr) {
        console.log(
          `WARNING: Invalid dates passed. '${fromDateStr}', '${toDateStr}'`
        );
      }

    const statsResult = await client.query(
        `CREATE TEMP TABLE temp_book_ids(book_id,book_instance_id) AS VALUES ${booksInfoFormattedForInsert};SELECT * from get_books_stats(${get_books_stats_args})`
    );

    // Return results as json
    context.res = {
      headers: { "Content-Type": "application/json" },
      // The second (1th) result is what we want, because that is the select statement.
      body: { stats: statsResult[1].rows },
    };
    context.done();

    await client.end();
  } else {
    fail(context, "Invalid book query");
  }
}

function fail(context: Context, message: string): void {
  context.res = {
    status: 400,
    body: message,
  };
}
