import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import BloomParseServer, { ApiAccount } from "../common/BloomParseServer";
import { Environment } from "../common/utils";
import { getApiAccount } from "./apiAccount";
import Catalog, { CatalogParams } from "./catalog";

// See https://specs.opds.io/opds-1.2.html for the OPDS catalog standard.
// See https://validator.w3.org/feed/docs/atom.html for the basic (default) tags
// See https://www.dublincore.org/specifications/dublin-core/dcmi-terms/ for the Dublin Core
//     (dcterms) tags

export async function opds(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(
    "HTTP trigger function 'opds' processed a request. url=" + request.url
  );
  let baseUrl: string;
  const idxQuestion = request.url.indexOf("?");
  if (idxQuestion > 0) {
    baseUrl = request.url.substring(0, idxQuestion);
  } else {
    baseUrl = request.url;
  }

  BloomParseServer.ApiBaseUrl = baseUrl.substring(0, baseUrl.indexOf("v1") + 2);

  const params = request.query;
  var account: ApiAccount;
  if (params.get("key")) {
    const accountResult = await getApiAccount(
      params.get("key"),
      params.get("src")?.toLowerCase() as Environment
    );
    if (accountResult.resultCode) {
      return {
        status: accountResult.resultCode,
        body: accountResult.errorMessage,
      };
    } else {
      account = accountResult.account;
      // each OPDS api account has a tag that we propagate through all
      // links for eventual use in analytics.
      params.set("ref", account.referrerTag);
    }
  }
  try {
    const catalogParams: CatalogParams = Object.fromEntries(params.entries());
    const body = await Catalog.getCatalog(baseUrl, catalogParams, account);
    return {
      headers: { "Content-Type": "application/xml" },
      body: body,
    };
  } catch (err) {
    return {
      status: 500,
      body: err.toString(),
    };
  }
}

app.http("opds", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: opds,
});
