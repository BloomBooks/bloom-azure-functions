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
    }

    fail(
      context,
      "Url and/or request body are not in a valid state. Be sure to provide a valid filter object in the request payload. This requires POST, not GET."
    );
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
