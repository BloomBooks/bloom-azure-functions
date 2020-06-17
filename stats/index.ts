import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const stats: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const book = req.query.book; // || (req.body && req.body.book);
  const publisher = req.query.publisher;
  const from = req.query.from || "20000101";
  const to = req.query.to || "30000101";

  if (book || publisher) {
    const { Client } = require("pg");
    const client = new Client();
    await client.connect();

    let query;
    if (book)
      query = client.query("SELECT * FROM public.get_book_stats($1, $2, $3)", [
        book,
        from,
        to,
      ]);
    else
      query = client.query(
        "SELECT * FROM public.get_publisher_stats($1, $2, $3)",
        [publisher, from, to]
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
      body: "Please pass a book or publisher in the query string",
    };
  }
};

export default stats;
