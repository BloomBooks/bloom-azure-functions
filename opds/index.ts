import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import BloomParseServer, { ApiAccount } from "../common/BloomParseServer";
import { Environment } from "../common/utils";
import { getApiAccount } from "./apiAccount";
import Catalog from "./catalog";

// See https://specs.opds.io/opds-1.2.html for the OPDS catalog standard.
// See https://validator.w3.org/feed/docs/atom.html for the basic (default) tags
// See https://www.dublincore.org/specifications/dublin-core/dcmi-terms/ for the Dublin Core
//     (dcterms) tags

const opds: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log(
    "HTTP trigger function 'opds' processed a request. url=" + req.url
  );
  let baseUrl: string;
  const idxQuestion = req.url.indexOf("?");
  if (idxQuestion > 0) {
    baseUrl = req.url.substring(0, idxQuestion);
  } else {
    baseUrl = req.url;
  }

  BloomParseServer.ApiBaseUrl = baseUrl.substring(0, baseUrl.indexOf("v1") + 2);

  const params = req.query;
  var account: ApiAccount;
  if (params["key"]) {
    const accountResult = await getApiAccount(
      params["key"],
      params["src"]?.toLowerCase() as Environment
    );
    if (accountResult.resultCode) {
      context.res = {
        status: accountResult.resultCode,
        body: accountResult.errorMessage,
      };
      return;
    } else {
      account = accountResult.account;
      // each OPDS api account has a tag that we propagate through all
      // links for eventual use in analytics.
      params.ref = account.referrerTag;
    }
  }
  try {
    const body = await Catalog.getCatalog(baseUrl, params, account);
    context.res = {
      headers: { "Content-Type": "application/xml" },
      body: body,
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: err.toString(),
    };
  }
};

export default opds;
