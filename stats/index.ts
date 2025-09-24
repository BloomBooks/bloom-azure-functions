import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
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

async function stats(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const category = request.params.category;
    const rowType = request.params.rowType;
    const body: any = await request.json();
    const filter = request.query.get("filter") || body.filter;

    if (category && rowType && filter) {
      const response = await processEvents(context, category, rowType, filter);
      return response;
    }

    return fail(
      "Url and/or request body are not in a valid state. Be sure to provide a valid filter object in the request payload. This requires POST, not GET."
    );
  } catch (e) {
    return fail(e.message);
  }
}

function fail(message: string): HttpResponseInit {
  return {
    status: 400,
    body: message,
  };
}

app.http("stats", {
  methods: ["GET", "POST"],
  route: "stats/{category}/{rowType}",
  handler: stats,
});
