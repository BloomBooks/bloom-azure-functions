import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BookQuery from "./bookQuery";

const stats: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const book = req.query.book || (req.body && req.body.book);
  const bookInstanceId =
    req.query["book-instance-id"] || (req.body && req.body["book-instance-id"]);

  // We aren't actually using these yet.
  // When we do, we should consider validating them here to guard against sql injection.
  // And likely we should let the database handle the default so it can be more performant if possible.
  // const from = req.query.from || (req.body && req.body.from) || "20000101";
  // const to = req.query.to || (req.body && req.body.to) || "30000101";

  const bookQuery =
    req.query["book-query"] || (req.body && req.body["book-query"]);

  // We may end up not using this and just using bookQuery instead...
  const publisher = req.query.publisher || (req.body && req.body.publisher);

  if (bookQuery) {
    await BookQuery.processStats(context, bookQuery); //, from, to);
    return;
  } else if (book || publisher) {
    const { Client } = require("pg");
    const client = new Client();
    await client.connect();

    let query;
    if (book)
      query = client.query(
        "SELECT * FROM public.get_book_stats($1, $2)", //, $3, $4)",
        [book, bookInstanceId] //, from, to]
      );
    else
      query = client.query(
        "SELECT * FROM public.get_publisher_stats($1)", //, $2, $3)",
        [publisher] //, from, to]
      );
    const queryResult = await query;
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { bookstats: queryResult.rows[0] },
    };
    context.done();

    await client.end();
  } else {
    context.res = {
      status: 400,
      body:
        "Please pass a book, publisher, or book query in the query string or body",
    };
  }
};

export default stats;
