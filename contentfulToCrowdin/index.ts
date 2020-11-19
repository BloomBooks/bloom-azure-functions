/* Suggestion: If you are working on this function, a way to get an auto run on
each save (like watch) is to install `npm add -g ts-node-dev` and then
`ts-node-dev --respawn index.ts`. */

import * as contentful from "contentful";

console.log("Querying...");

const client = contentful.createClient({
  space: "72i7e2mqidxz",
  accessToken: "XPudkny5JX74w0dxrwqS_WY3GUBA5xO_AzFR7fwO2aE",
});

client
  .getEntries({ content_type: "collection" })
  .then((response) => transform(response.items))
  .catch((err) => console.log(err));

function transform(entries: any[]) {
  console.log(`transforming ${entries.length} entries...`);
  const output = {};
  // some kinds of collection labels aren't worth presenting to translators. E.g. "SIL LEAD"
  const kindBlackList = ["Organization", "Project", "Language", "Publisher"];
  entries
    // maybe uncomment this when working on this function to speed things up
    .slice(0, 30)
    .filter(
      (e) => !e.fields.kind || kindBlackList.indexOf(e.fields.kind) === -1
    )

    .forEach((e) => {
      const kind = e.fields.kind ? e.fields.kind : "";
      output[e.sys.contentType.sys.id + "." + e.fields.urlKey] = {
        message: e.fields.label,
        // This uilang=en-US parameter isn't implemented in blorg yet, but it could be in the future and could be useful for testing
        // thing. Meanwhile it does not harm.
        description: `label for the BloomLibrary ${kind} collection. See "https://alpha.bloomlibrary.org/${e.fields.urlKey}?uilang=en-US"`,
      };
    });

  // // uncomment this when working on this function; use with ts-node-dev (see readme)
  console.log(output);

  // fs.writeFileSync(
  //   "./bloom-library-contentful.json",
  //   JSON.stringify(output, null, 4)
  // );
  console.log("Done.");
}
