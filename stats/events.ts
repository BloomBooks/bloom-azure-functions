import { Context } from "@azure/functions";
import { getReadingPerDayEventsUsingParseDBQuerySql } from "./readingPerDayEventsByParseDBQuery";
import { AxiosRequestConfig } from "axios";

const moment = require("moment");

function isValidDateStr(dateStr: string | null | undefined): boolean {
  return new moment(dateStr, "YYYY-MM-DD", true).isValid();
}

// Go to postgresql to get the information asked for based on category and rowType.
export async function processEvents(
  context: Context,
  category: string,
  rowType: string,
  filter: {
    parseDBQuery?: { url: string; options: AxiosRequestConfig };
    branding?: string;
    country?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<void> {
  if (filter.fromDate && !isValidDateStr(filter.fromDate)) {
    throw new Error(`Invalid from date: ${filter.fromDate}`);
  } else if (filter.toDate && !isValidDateStr(filter.toDate)) {
    throw new Error(`Invalid to date: ${filter.toDate}`);
  }

  let sqlQuery;
  if (category === "reading" && rowType === "per-day") {
    sqlQuery = await getReadingPerDayEventsSql(filter);
  } else {
    throw new Error(`Unknown category and rowType: (${category}, ${rowType})`);
  }

  const { Client } = require("pg");
  const client = new Client();
  await client.connect();

  const statsResult = await client.query(sqlQuery);

  const jsonResult = Array.isArray(statsResult)
    ? statsResult[statsResult.length - 1].rows
    : statsResult.rows;

  // Return results as json
  context.res = {
    headers: { "Content-Type": "application/json" },
    body: { stats: jsonResult },
  };
  context.done();

  await client.end();
}

// Asynchronously returns a string representing the SQL query needed to get the reading events per day
async function getReadingPerDayEventsSql(filter: {
  parseDBQuery?: { url: string; options: AxiosRequestConfig };
  branding?: string;
  country?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<string> {
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
    let fromDate = filter.fromDate;
    if (!fromDate) fromDate = "2000-01-01";
    let toDate = filter.toDate;
    if (!toDate) toDate = "9999-12-31";
    const queryBasedOnIdsInTempTable = "false";
    return `SELECT * from get_reading_perday_events(${queryBasedOnIdsInTempTable}, '${fromDate}', '${toDate}', '${filter.branding}', '${filter.country}')`;
  }
}
