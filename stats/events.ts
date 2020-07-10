import { Context } from "@azure/functions";
import { AxiosRequestConfig } from "axios";
import { IFilter } from ".";
import { addParseBooksToTempTableQuery } from "./readingPerDayEventsByParseDBQuery";

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

  let sqlQuery: string | undefined;
  if (category === "reading" && rowType === "per-day") {
    sqlQuery = await getReadingPerDayEventsSql(filter);
  } else if (category === "reading" && rowType === "per-book") {
    sqlQuery = await getReadingPerBookEventsSql(filter);
  } else if (category === "reading" && rowType === "per-book-comprehension") {
    sqlQuery = await getReadingPerBookComprehensionEventsSql(filter);
  } else if (category === "reading" && rowType === "overview") {
    sqlQuery = await getReadingOverviewSql(filter);
  } else {
    throw new Error(`Unknown category and rowType: (${category}, ${rowType})`);
  }

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

async function getCombinedParseAndOrSqlFunction(
  functionName,
  filter: {
    parseDBQuery?: { url: string; options: AxiosRequestConfig };
    branding?: string;
    country?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<string | undefined> {
  let sqlQuery = "";
  const parseDBQuery = filter.parseDBQuery;
  let queryBasedOnIdsInTempTable: boolean = !!parseDBQuery;
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

// Asynchronously returns a string representing the SQL query needed to get the reading events per day
async function getReadingPerDayEventsSql(filter: {
  parseDBQuery?: { url: string; options: AxiosRequestConfig };
  branding?: string;
  country?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<string | undefined> {
  return getCombinedParseAndOrSqlFunction("get_reading_perday_events", filter);
}

// Returns a string representing the SQL query needed to get the reading events per book
async function getReadingPerBookEventsSql(
  filter: IFilter
): Promise<string | undefined> {
  return getCombinedParseAndOrSqlFunction("get_reading_perbook_events", filter);
}

// Returns a string representing the SQL query needed to get the reading comprehension events per book
async function getReadingPerBookComprehensionEventsSql(
  filter: IFilter
): Promise<string | undefined> {
  return getCombinedParseAndOrSqlFunction(
    "get_reading_perbook_comprehension_events",
    filter
  );
}

// Returns a string representing the SQL query needed to get the reading overview
async function getReadingOverviewSql(
  filter: IFilter
): Promise<string | undefined> {
  return getCombinedParseAndOrSqlFunction("get_reading_overview", filter);
}
