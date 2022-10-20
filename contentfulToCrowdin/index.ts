/* Suggestion: If you are working on this function,
1) install `npm add -g ts-node` and then `ts-node index.ts`. or
if you want to get an auto run on each save (like watch),
2) install `npm add -g ts-node-dev` and then `ts-node-dev --respawn index.ts`. */

import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as contentful from "contentful";
import crowdin from "@crowdin/crowdin-api-client";
import { isLocalEnvironment } from "../common/utils";

const runEvenIfLocal = false;

const crowdinApiToken = process.env.bloomCrowdinApiToken;
const contentfulReadOnlyToken = process.env.bloomContentfulReadOnlyToken;
const kCrowdinProjectId = 261564;

// uncomment this listCrowdinFiles(); and do ts-node index.ts to get a file list
//listCrowdinFiles();
readTransformUpload();

const contentfulToCrowdin: AzureFunction = async (
  context: Context
): Promise<void> => {
  try {
    context.log("contentfulToCrowdin starting", new Date().toISOString());
    readTransformUpload();
    context.log("contentfulToCrowdin finished", new Date().toISOString());
    context.done();
  } catch (err) {
    console.error(err);
    context.done("Error: " + JSON.stringify(err));
  }
};

async function readTransformUpload() {
  // By default, we don't want to run this if we are running the functions locally.
  // Typically, if we are running locally, we want to test some other function, not this one.
  // Some reasons not to: so you don't have to get the environment variables set up and
  //  so as not to be making production-level modifications unnecessarily.
  if (!runEvenIfLocal && isLocalEnvironment()) return;

  if (!validateEnvironmentVariables()) return;

  const contentfulEntries = await getContentfulEntries();
  const highPriorityJson = transformContentfulEntriesToL10nJson(
    contentfulEntries,
    includeInHighPriorityFile
  );
  console.log("--------- HIGH Priority ----------");
  //console.log(highPriorityJson);

  const lowPriorityJson = transformContentfulEntriesToL10nJson(
    contentfulEntries,
    includeInLowPriorityFile
  );
  console.log("---------- LOW Priority ---------");
  //console.log(lowPriorityJson);

  const churchJson = transformContentfulEntriesToL10nJson(
    contentfulEntries,
    includeInChurchFile,
    "NOTE: This is a Biblical or Christian term which should be translated with particular care and in accordance with how these terms are used in the church in this language."
  );
  // console.log("----------- CHURCH ----------");
  // console.log(churchJson);

  // //console.log(JSON.stringify(l10nJson, null, 4));
  await Promise.all([
    updateCrowdinFile(highPriorityJson, 106),
    updateCrowdinFile(lowPriorityJson, 108),
    updateCrowdinFile(churchJson, 104),
  ]);
}

function validateEnvironmentVariables() {
  if (!contentfulReadOnlyToken) {
    console.error(
      "env.bloomContentfulReadOnlyToken is not set; unable to run contentfulToCrowdin."
    );
    return false;
  }

  if (!crowdinApiToken) {
    console.error(
      "env.bloomCrowdinApiToken is not set; unable to run contentfulToCrowdin."
    );
    return false;
  }
  return true;
}

async function getContentfulEntries() {
  console.log("Querying Contentful...");
  const client = contentful.createClient({
    space: "72i7e2mqidxz",
    accessToken: contentfulReadOnlyToken,
  });
  const collectionResponse = await client.getEntries({
    content_type: "collection",
    "fields.localization[ne]": "No",
    limit: 1000, // 1000 is the max we are allowed; beyond that, we will have to page.
  });
  //console.log(`got ${collectionResponse.items.length} collection entries`);
  if (collectionResponse.items.length >= 1000)
    throw Error(
      "More than 1000 collection entries; don't update Crowdin until code is enhanced lest we delete strings."
    );
  const bannerResponse = await client.getEntries({
    content_type: "pageBanner",
    "fields.localization[ne]": "No",
    limit: 1000, // 1000 is the max we are allowed; beyond that, we will have to page.
  });
  //console.log(`got ${bannerResponse.items.length} banner entries`);
  if (bannerResponse.items.length >= 1000)
    throw Error(
      "More than 1000 banner entries; don't update Crowdin until code is enhanced lest we delete strings."
    );
  return [...collectionResponse.items, ...bannerResponse.items];
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

function transformContentfulEntriesToL10nJson(
  entries: any[],
  filter: (entry: any) => boolean,
  extraNotice?: string
) {
  const output = {};
  // -      first do the page banners
  entries
    .filter((i) => i.sys.contentType.sys.id === "pageBanner")
    //.slice(0, 5)
    .filter(filter)
    .forEach((e) => {
      const previewLink = `https://alpha.bloomlibrary.org/_previewBanner/${e.sys.id}?uilang=en-US`;
      output["banner." + e.fields.title] = {
        message: e.fields.title,
        description: `This is a title part of a page banner. See ${previewLink}. ${
          extraNotice || ""
        }`,
      };
      if (e.fields.description) {
        // bold, headings, and links would seem to be relatively unambiguous ways to detect that there is markdown
        const markdownDetected =
          e.fields.description.indexOf("**") > -1 ||
          e.fields.description.indexOf("#") > -1 ||
          e.fields.description.indexOf("[") > -1;
        const markdownMessage = markdownDetected
          ? // this link at bit.ly is under john hatton sil account
            " MAKE SURE YOU PRESERVE THE MARKDOWN FORMATTING (see https://bit.ly/blorgmd). "
          : "";
        output["banner.description." + e.fields.title] = {
          message: e.fields.description,
          description: `This is the description part of a page banner titled "${
            e.fields.title
          }".  ${markdownMessage}To see this in Bloom Library, go to ${previewLink}. ${
            extraNotice || ""
          }`,
        };
      }
    });

  // -      next, do the collections
  entries
    .filter((i) => i.sys.contentType.sys.id === "collection")
    //.slice(0, 5)
    .filter(filter)
    .forEach((e) => {
      const kind = e.fields.kind ? e.fields.kind : "";
      //console.log(JSON.stringify(e, null, 4));
      //console.log(`${e.fields.label}: ${kind}`);
      output[e.sys.contentType.sys.id + "." + e.fields.urlKey] = {
        message: e.fields.label,
        // This uilang=en-US parameter isn't implemented in blorg yet, but it could be in the future and could be useful for testing
        // thing. Meanwhile it does not harm.
        description: `This is a label for a ${kind} collection. See "https://alpha.bloomlibrary.org/${
          e.fields.urlKey
        }?uilang=en-US" ${extraNotice || ""}`,
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
