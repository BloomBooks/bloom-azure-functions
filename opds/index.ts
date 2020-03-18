import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { CatalogType } from "./catalog";
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
  const idxQuestion = req.url.indexOf("?");
  let catalogType: CatalogType = CatalogType.MAIN;
  let baseUrl: string;
  if (idxQuestion > 0) {
    const type = req.url.substring(idxQuestion + 1);
    baseUrl = req.url.substring(0, idxQuestion);
    if (type.toLowerCase().startsWith(CatalogType.EPUB)) {
      catalogType = CatalogType.EPUB;
    } else if (type.toLowerCase().startsWith(CatalogType.ALL)) {
      // "all" include ePUB, PDF, and BloomPub
      catalogType = CatalogType.ALL;
    }
  } else {
    baseUrl = req.url;
  }
  context.res = {
    body: await Catalog.getCatalog(catalogType, baseUrl, req.query)
  };
};

export default opds;
