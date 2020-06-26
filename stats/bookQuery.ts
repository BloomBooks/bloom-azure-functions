import axios, { AxiosRequestConfig } from "axios";
import { Context } from "vm";

export default class BookQuery {
  public static async processStats(
    context: Context,
    bookQuery: { url: string; options: AxiosRequestConfig }
    // fromDate: string,
    // toDate: string
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
        this.fail(context, "Unexpected book info caused stats lookup to fail");
      }

      const statsResult = await client.query(
        `CREATE TEMP TABLE temp_book_ids(book_id,book_instance_id) AS VALUES ${booksInfoFormattedForInsert};SELECT * from get_books_stats()` //'${fromDate}', '${toDate}')`
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
      this.fail(context, "Invalid book query");
    }
  }

  public static fail(context: Context, message: string) {
    context.res = {
      status: 400,
      body: message,
    };
  }
}
