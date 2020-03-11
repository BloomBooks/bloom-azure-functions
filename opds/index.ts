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
  if (idxQuestion > 0) {
    const type = req.url.substring(idxQuestion + 1);
    if (type.toLowerCase() == "epub") {
      // epub is shorthand for "epub and pdf"
      catalogType = CatalogType.EPUBANDPDF;
    } else if (type.toLowerCase() == "bloompub") {
      catalogType = CatalogType.BLOOMPUB;
    }
  }
  context.res = {
    body: await Catalog.getCatalog(catalogType)
  };
};

export default opds;
