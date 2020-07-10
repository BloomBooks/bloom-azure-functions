import axios, { AxiosRequestConfig } from "axios";

export async function getReadingPerDayEventsUsingParseDBQuerySql(
  bookQuery: { url: string; options: AxiosRequestConfig },
  fromDateValidatedStr: string | undefined,
  toDateValidatedStr: string | undefined
): Promise<string | undefined> {
  // Send query to parse
  const response = await axios.get(bookQuery.url, bookQuery.options);

  // Make a temp table of the book IDs and book instance IDs in postgres
  // and
  // Query against that table in postgres
  if (response.status === 200 && response.data && response.data.results) {
    const booksInfo = response.data.results;

    // Return right away if booksInfo.length is 0. No point generating a SQL query
    if (!booksInfo || booksInfo.length === 0) {
      console.log("No results returned from Parse");
      return undefined;
    }

    const booksInfoFormattedForInsert: string = booksInfo
      .map(
        (b: { objectId: string; bookInstanceId: string }) =>
          `('${b.objectId}','${b.bookInstanceId}')`
      )
      .join(",");

    // Crude check for sql injection...
    if (booksInfoFormattedForInsert.includes(";")) {
      // ENHANCE: Check that none of the objectIds nor bookInstanceIds have ' in them.
      throw new Error("Unexpected book info caused stats lookup to fail");
    }

    // true to query based on book IDs in the temp table
    let sqlFunctionParameters = "true";
    if (fromDateValidatedStr && toDateValidatedStr) {
      sqlFunctionParameters += `, '${fromDateValidatedStr}', '${toDateValidatedStr}'`;
    }

    return `CREATE TEMP TABLE temp_book_ids(book_id,book_instance_id) AS VALUES ${booksInfoFormattedForInsert};SELECT * from get_reading_perday_events(${sqlFunctionParameters})`;
  } else {
    throw new Error("Invalid book query");
  }
}
