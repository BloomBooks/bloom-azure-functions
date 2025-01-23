import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { google } from "googleapis";
import { checkForRequiredEnvVars } from "../common/utils";

export interface SubscriptionResult {
  code: string;
  replacementCode: string;
  tier: string;
  brandingLabel: string;
  showMessage: string;
}

// This code expects this to cover 4 columns:
// Code, Replacement Code, Branding Label, Show Message
const RANGE = "SUBSCRIPTION_API_DATA";

export const getSubscriptionInfo: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  if (!req.params?.code) {
    context.res = {
      status: 400,
      body: "Missing required parameter: code",
    };
    return;
  }

  checkForRequiredEnvVars([
    "BLOOM_GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "BLOOM_GOOGLE_SERVICE_PRIVATE_KEY",
    "BLOOM_SUBSCRIPTION_SPREADSHEET_ID",
  ]);

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.BLOOM_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.BLOOM_GOOGLE_SERVICE_PRIVATE_KEY.replace(
        /\\n/g,
        "\n"
      ),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({
    version: "v4",
    auth: auth,
  });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.BLOOM_SUBSCRIPTION_SPREADSHEET_ID,
      range: RANGE,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    //console.log(JSON.stringify(response.data, null, 2));
    const rows = response.data.values;
    // The first row is labels
    if (rows?.length) {
      // find the first row matching the code we were given
      const cells = rows.find((columns) => columns[0] === req.params.code);
      if (cells) {
        context.res = {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
          body: {
            code: cells[0],
            replacementCode: cells[1],
            tier: cells[2],
            brandingLabel: cells[3],
            showMessage: cells[4],
          } as SubscriptionResult,
        };
      } else {
        context.res = {
          status: 404,
          body: "Did not find a row with that code",
        };
      }
    } else {
      context.res = {
        status: 404,
        body: "No data found",
      };
    }
  } catch (error) {
    console.error(error.message);
    context.res = {
      status: 500,
    };
  }
};
