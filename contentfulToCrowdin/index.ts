/* Suggestion: If you are working on this function, a way to get an auto run on
each save (like watch) is to install `npm add -g ts-node-dev` and then
`ts-node-dev --respawn index.ts`. */

import * as fs from "fs";
console.log("Starting...");
const input = JSON.parse(fs.readFileSync("contentful-export.json").toString());

const output = {};
// some kinds of collection labels aren't worth presenting to translators. E.g. "SIL LEAD"
const kindBlackList = ["Organization", "Project", "Language", "Publisher"];
input.entries
  // maybe uncomment this when working on this function to speed things up
  //.slice(0, 30)
  .filter(
    (e) =>
      !e.fields.kind || kindBlackList.indexOf(e.fields.kind["en-US"]) === -1
  )

  .forEach((e) => {
    const kind = e.fields.kind ? e.fields.kind["en-US"] : "";
    output[e.fields.urlKey["en-US"]] = {
      message: e.fields.label["en-US"],
      // This uilang=en-US parameter isn't implemented in blorg yet, but it could be in the future and could be useful for testing
      // thing. Meanwhile it does not harm.
      description: `label for the ${kind} collection. See "https://alpha.bloomlibrary.org/${e.fields.urlKey["en-US"]}?uilang=en-US"`,
    };
  });

// uncomment this when working on this function; use with ts-node-dev (see readme)
//console.log(output);

fs.writeFileSync(
  "./bloom-library-contentful.json",
  JSON.stringify(output, null, 4)
);
console.log("Done.");
