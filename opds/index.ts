import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { BloomParseServerMode } from "../common/BloomParseServer";
import { getApiAccount } from "./apiAccount";
import Catalog from "./catalog";

// See https://specs.opds.io/opds-1.2.html for the OPDS catalog standard.
// See https://validator.w3.org/feed/docs/atom.html for the basic (default) tags
// See https://www.dublincore.org/specifications/dublin-core/dcmi-terms/ for the Dublin Core
//     (dcterms) tags

const opds: AzureFunction = async function(
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
  const accountResult = await getApiAccount(
    req.query["key"],
    req.query["src"] as BloomParseServerMode
  );
  if (accountResult.resultCode) {
    context.res = {
      status: accountResult.resultCode,
      body: accountResult.errorMessage,
    };
  } else {
    context.res = {
      headers: { "Content-Type": "application/xml" },
      body: await Catalog.getCatalog(baseUrl, req.query, accountResult.account),
    };
  }
};

export default opds;
