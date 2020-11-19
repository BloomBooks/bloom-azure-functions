/* Suggestion: If you are working on this function, 
1) install `npm add -g ts-node` and then `ts-node index.ts`. or
if you want to get an auto run on each save (like watch),
2) install `npm add -g ts-node-dev` and then `ts-node-dev --respawn index.ts`. */

import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as contentful from "contentful";
import crowdin from "@crowdin/crowdin-api-client";

const crowdinApiToken = process.env.bloomCrowdinApiToken;
const contentfulReadOnlyToken = process.env.bloomContentfulReadOnlyToken;
const kCrowdinProjectId = 261564;

// uncomment this listCrowdinFiles(); and do ts-node index.ts to get a file list
readTransformUpload();

const contentfulToCrowdin: AzureFunction = async (
  context: Context,
  req: HttpRequest
): Promise<void> => {
  try {
    readTransformUpload();
  } catch (err) {
    console.error(err);
    context.res.status = 500;
    context.res.statusText = "Error: " + JSON.stringify(err);
  }
};
async function readTransformUpload() {
  const contentfulEntries = await getContentfulEntries();
  const highPriorityJson = transformContentfulToL10File(
    contentfulEntries,
    includeInHighPriorityFile
  );
  // console.log("--------- HIGH Priority ----------");
  // console.log(highPriorityJson);

  const lowPriorityJson = transformContentfulToL10File(
    contentfulEntries,
    includeInLowPriorityFile
  );
  console.log("---------- LOW Priority ---------");
  // console.log(lowPriorityJson);

  const churchJson = transformContentfulToL10File(
    contentfulEntries,
    includeInChurchFile,
    "NOTE: This is a Biblical or Christian term which should be translated with particular care and in accordance with how these terms are used in the church in this language."
  );
  // console.log("----------- CHURCH ----------");
  // console.log(churchJson);

  // //console.log(JSON.stringify(l10nJson, null, 4));
  await Promise.all([
    updateCrowdinFile(highPriorityJson, 98),
    updateCrowdinFile(lowPriorityJson, 100),
    updateCrowdinFile(churchJson, 102),
  ]);
}

async function getContentfulEntries() {
  console.log("Querying Contentful...");
  console.log(contentfulReadOnlyToken);
  const client = contentful.createClient({
    space: "72i7e2mqidxz",
    accessToken: contentfulReadOnlyToken,
  });
  const response = await client.getEntries({ content_type: "collection" });
  return response.items;
}

function doNotLocalizeFilter(e: any) {
  // Originally, I was using the existing "kind" field to control localization, which mostly worked.
  // That is what this "kindBlackList" is. If a collection is one of these "kinds", then we know
  // we don't want to localize it.
  // Note, we later added an explicit "localization" field, so once that gets filled in everywhere
  // we can retire using the kind field for localization purposes at all.
  const kindBlackList = [
    "Organization",
    "Project",
    "Language",
    "Publisher",
    "Series",
  ];

  if (e.fields.localization) return e.fields.localization === "No";
  // otherwise default for collections that don't have this field yet
  else return e.fields.kind && kindBlackList.indexOf(e.fields.kind) > -1;
}

function includeInHighPriorityFile(e: any) {
  if (doNotLocalizeFilter(e)) {
    return false;
  }
  return (
    // because this field is new, the majority are currently un-filled in
    !e.fields.localization ||
    // once these are marked, then we can just us this:
    e.fields.localization === "Localizable High Visibility"
  );
}

function includeInLowPriorityFile(e: any) {
  if (doNotLocalizeFilter(e)) {
    return false;
  }
  return e.fields.localization === "Localizable Low Visibility";
}

function includeInChurchFile(e: any) {
  if (doNotLocalizeFilter(e)) {
    return false;
  }
  return e.fields.localization === "Church";
}

function transformContentfulToL10File(
  entries: any[],
  filter: (entry: any) => boolean,
  extraNotice?: string
) {
  console.log(`transforming ${entries.length} entries...`);
  const output = {};
  // some kinds of collection labels aren't worth presenting to translators. E.g. "SIL LEAD"
  entries
    //.slice(0, 5)
    .filter(filter)
    .forEach((e) => {
      const kind = e.fields.kind ? e.fields.kind : "";
      //console.log(`${e.fields.label}: ${kind}`);
      output[e.sys.contentType.sys.id + "." + e.fields.urlKey] = {
        message: e.fields.label,
        // This uilang=en-US parameter isn't implemented in blorg yet, but it could be in the future and could be useful for testing
        // thing. Meanwhile it does not harm.
        description: `label for the BloomLibrary ${kind} collection. See "https://alpha.bloomlibrary.org/${e.fields.urlKey}?uilang=en-US" ${extraNotice}`,
      };
    });

  return output;
}

// use this when you add a new file (manually) and need to get the file id so you can add it to code
async function listCrowdinFiles() {
  const crowdinAccess = new crowdin({
    token: crowdinApiToken,
  });

  const files = await crowdinAccess.sourceFilesApi.listProjectFiles(
    kCrowdinProjectId,
    {}
  );
  console.log(JSON.stringify(files, null, 4));
}

async function updateCrowdinFile(l10Json: any, fileId: number) {
  const crowdinAccess = new crowdin({
    token: crowdinApiToken,
  });

  crowdinAccess.uploadStorageApi
    .addStorage("Bloom Library Contentful.json", l10Json)
    .then((response) => {
      console.log(`new storage id: ${response.data.id}`);
      crowdinAccess.sourceFilesApi
        .updateOrRestoreFile(kCrowdinProjectId, fileId, {
          storageId: response.data.id,
        })
        .then((updateResponse) =>
          console.log(
            `crowdin update response: ${JSON.stringify(updateResponse)}`
          )
        )
        .catch((error) => {
          console.error(error);
        });
    });
}

export default contentfulToCrowdin;
