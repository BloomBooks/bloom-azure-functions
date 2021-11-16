import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { processEvents } from "./events";
import { AxiosRequestConfig } from "axios";

export interface IFilter {
  parseDBQuery?: {
    url: string;
    options: AxiosRequestConfig;
    method: string | undefined;
  };
  branding?: string;
  country?: string;
  fromDate?: string;
  toDate?: string;
  bookId?: string;
  bookInstanceId?: string;
}

const stats: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    const category = req.params.category;
    const rowType = req.params.rowType;

    const filter = req.query.filter || (req.body && req.body.filter);

    if (category && rowType && filter) {
      await processEvents(context, category, rowType, filter);
      return;
    } else {
      // This whole else is obsolete, having been replaced by the category/rowType url model (handled by processEvents above).
      // Temporarily, we have to leave it in until the changes in blorg2 get all the way through to production.

      const t0 = new Date().getTime();

      const book = req.query.book || (req.body && req.body.book);
      const bookInstanceId =
        req.query["book-instance-id"] ||
        (req.body && req.body["book-instance-id"]);

      if (book && bookInstanceId) {
        const { Client } = require("pg");
        const client = new Client();
        await client.connect();

        const tSql0 = new Date().getTime();
        const queryResult = await client.query(
          "SELECT * FROM common.get_book_stats($1, $2)", //, $3, $4)",
          [book, bookInstanceId] //, from, to]
        );
        const tSql1 = new Date().getTime();
        context.log(
          `stats - SQL query (get_book_stats) took ${tSql1 -
            tSql0} milliseconds to return.`
        );

        context.res = {
          headers: { "Content-Type": "application/json" },
          body: { bookstats: queryResult.rows[0] },
        };

        await client.end();

        const t1 = new Date().getTime();
        context.log(
          `stats function (book detail) took ${t1 -
            t0} milliseconds to complete.`
        );
        context.done();
      } else {
        fail(
          context,
          "Url, request body, or params are not in a valid state. Provide filter or book."
        );
      }
    }
  } catch (e) {
    fail(context, e.message);
  }
};

function fail(context: Context, message: string): void {
  context.res = {
    status: 400,
    body: message,
  };
}

export default stats;
