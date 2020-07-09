import { Context } from "@azure/functions";
import { AxiosRequestConfig } from "axios";
import { IFilter } from ".";
import { getReadingPerDayEventsUsingParseDBQuerySql } from "./readingPerDayEventsByParseDBQuery";

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
    sqlQuery = getReadingPerBookEventsSql(filter);
  } else if (category === "reading" && rowType === "per-book-comprehension") {
    sqlQuery = getReadingPerBookComprehensionEventsSql(filter);
  } else if (category === "reading" && rowType === "overview") {
    sqlQuery = getReadingOverviewSql(filter);
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

// Asynchronously returns a string representing the SQL query needed to get the reading events per day
async function getReadingPerDayEventsSql(filter: {
  parseDBQuery?: { url: string; options: AxiosRequestConfig };
  branding?: string;
  country?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<string | undefined> {
  const parseDBQuery = filter.parseDBQuery;
  if (parseDBQuery) {
    // Asynchronously determine the group of books by asking parse using the given query.
    return getReadingPerDayEventsUsingParseDBQuerySql(
      parseDBQuery,
      filter.fromDate,
      filter.toDate
    );
  } else {
    // Determine which books by passing parameters to postgresql directly (not book IDs from parse in a temp table).
    const [fromDate, toDate] = getDatesFromFilter(filter);
    const queryBasedOnIdsInTempTable = "false";
    return `SELECT * from get_reading_perday_events(${queryBasedOnIdsInTempTable}, '${fromDate}', '${toDate}', '${filter.branding}', '${filter.country}')`;
  }
}

// Returns a string representing the SQL query needed to get the reading events per book
function getReadingPerBookEventsSql(filter: IFilter): string {
  // Determine which books by passing parameters to postgresql directly (not book IDs from parse in a temp table).
  const [fromDate, toDate] = getDatesFromFilter(filter);
  const queryBasedOnIdsInTempTable = "false";
  return `SELECT * from get_reading_perbook_events(${queryBasedOnIdsInTempTable}, '${fromDate}', '${toDate}', '${filter.branding}', '${filter.country}')`;
}

// Returns a string representing the SQL query needed to get the reading comprehension events per book
function getReadingPerBookComprehensionEventsSql(filter: IFilter): string {
  // Determine which books by passing parameters to postgresql directly (not book IDs from parse in a temp table).
  const [fromDate, toDate] = getDatesFromFilter(filter);
  const queryBasedOnIdsInTempTable = "false";
  return `SELECT * from get_reading_perbook_comprehension_events(${queryBasedOnIdsInTempTable}, '${fromDate}', '${toDate}', '${filter.branding}', '${filter.country}')`;
}

function getDatesFromFilter(filter: IFilter): [string, string] {
  let fromDate = filter.fromDate;
  if (!fromDate) fromDate = "2000-01-01";
  let toDate = filter.toDate;
  if (!toDate) toDate = "9999-12-31";

  return [fromDate, toDate];
}

// Returns a string representing the SQL query needed to get the reading overview
function getReadingOverviewSql(filter: IFilter): string {
  // Determine which books by passing parameters to postgresql directly (not book IDs from parse in a temp table).
  const [fromDate, toDate] = getDatesFromFilter(filter);
  const queryBasedOnIdsInTempTable = "false";
  return `SELECT * from get_reading_overview(${queryBasedOnIdsInTempTable}, '${fromDate}', '${toDate}', '${filter.branding}', '${filter.country}')`;
}
