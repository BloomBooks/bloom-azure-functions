import { Context } from "@azure/functions";
import axios, { AxiosRequestConfig } from "axios";
import { IFilter } from ".";

const moment = require("moment");

function isValidDateStr(dateStr: string | null | undefined): boolean {
  return new moment(dateStr, "YYYY-MM-DD", true).isValid();
}

// Go to postgresql to get the information asked for based on category and rowType.
export async function processEvents(
  context: Context,
  category: string,
  rowType: string,
  filter: IFilter
): Promise<void> {
  if (filter.fromDate && !isValidDateStr(filter.fromDate)) {
    throw new Error(`Invalid from date: ${filter.fromDate}`);
  } else if (filter.toDate && !isValidDateStr(filter.toDate)) {
    throw new Error(`Invalid to date: ${filter.toDate}`);
  }

  let sqlFunctionName: string;
  if (category === "reading" && rowType === "per-day") {
    sqlFunctionName = "common.get_reading_perday_events";
  } else if (category === "reading" && rowType === "per-book") {
    sqlFunctionName = "common.get_reading_perbook_events";
  } else if (category === "reading" && rowType === "overview") {
    sqlFunctionName = "common.get_reading_overview";
  } else {
    throw new Error(`Unknown category and rowType: (${category}, ${rowType})`);
  }

  const sqlQuery: string | undefined = await getCombinedParseAndOrSqlFunction(
    sqlFunctionName,
    filter
  );

  // Return results as json
  context.res = {
    headers: { "Content-Type": "application/json" },
  };

  if (sqlQuery) {
    const { Client } = require("pg");
    const client = new Client();
    await client.connect();

    //const t0 = new Date().getTime();
    const statsResult = await client.query(sqlQuery);
    //const t1 = new Date().getTime();
    //console.log("SQL query took " + (t1 - t0) + " milliseconds to return.");

    await client.end();

    const jsonResult = Array.isArray(statsResult)
      ? statsResult[statsResult.length - 1].rows
      : statsResult.rows;
    context.res.body = {
      stats: jsonResult,
    };
  } else {
    context.res.body = {
      stats: [],
    };
  }

  context.done();
}

function getDatesFromFilter(filter: IFilter): [string, string] {
  let fromDate = filter.fromDate;
  if (!fromDate) fromDate = "2000-01-01";
  let toDate = filter.toDate;
  if (!toDate) toDate = "9999-12-31";

  return [fromDate, toDate];
}

async function addParseBooksToTempTableQuery(
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
      console.log(
        "booksInfoFormattedForInsert = " + booksInfoFormattedForInsert
      );
      throw new Error("Unexpected book info caused stats lookup to fail");
    }

    // true to query based on book IDs in the temp table
    let sqlFunctionParameters = "true";
    if (fromDateValidatedStr && toDateValidatedStr) {
      sqlFunctionParameters += `, '${fromDateValidatedStr}', '${toDateValidatedStr}'`;
    }

    return `CREATE TEMP TABLE temp_book_ids(book_id,book_instance_id) AS VALUES ${booksInfoFormattedForInsert}; `;
  } else {
    throw new Error("Invalid book query");
  }
}

async function getCombinedParseAndOrSqlFunction(
  functionName,
  filter: IFilter
): Promise<string | undefined> {
  let sqlQuery = "";
  const parseDBQuery = filter.parseDBQuery;
  const queryBasedOnIdsInTempTable: boolean = !!parseDBQuery;
  if (parseDBQuery) {
    // First, asynchronously determine the group of books by asking parse using the given query.
    sqlQuery = await addParseBooksToTempTableQuery(
      parseDBQuery,
      filter.fromDate,
      filter.toDate
    );

    if (!sqlQuery) {
      // Parse has no records
      return undefined;
    }
  }

  // Determine which books by passing parameters to postgresql directly (not book IDs from parse in a temp table).
  const [fromDate, toDate] = getDatesFromFilter(filter);
  sqlQuery += `SELECT * from ${functionName}(${queryBasedOnIdsInTempTable.toString()}, '${fromDate}', '${toDate}', '${
    filter.branding
  }', '${filter.country}')`;
  return sqlQuery;
}
