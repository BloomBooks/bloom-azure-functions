// This file contains functions which sit in on the edge between the parse server and our books API.
// They don't belong in BloomParseServer because they are only applicable to the books API.
// But they contain code specific to parse server, so they deserve their own space.

import { HttpRequestQuery } from "@azure/functions";
import { Book } from "../common/BloomParseServer";

export function convertApiQueryParamsIntoParseAdditionalParams(
  query: HttpRequestQuery
): {}[] {
  const { limit, offset, count } = query;
  const additionalParams = [];
  if (limit) additionalParams.push({ limit });
  if (offset) additionalParams.push({ skip: offset });
  if (count) additionalParams.push({ count: count === "true" ? 1 : 0 });
  return additionalParams;
}

export function convertExpandParamToParseFields(expandStr: string): string[] {
  // We actually have to get the full language and uploader records from parse either way
  // because even our unexpanded record contains the language tags and email addresses
  // and parse doesn't return those unless we ask for the full records.
  // And for now, those are the only two fields we can expand,
  // so there's no sense in doing extra processing like below.
  return ["langPointers", "uploader"];

  const parseFields = [];
  commaSeparatedStringToArray(expandStr).forEach((item) => {
    if (item === "languages") {
      parseFields.push("langPointers");
    } else {
      // This includes "uploader" but is also a catch-all for any other fields which match in name.
      parseFields.push(item);
    }
  });

  // We actually have to get the full language and uploader records from parse either way
  // because even our unexpanded record contains the language tags and email addresses
  // and parse doesn't return those unless we ask for the full records.
  if (!parseFields.includes("langPointers")) parseFields.push("langPointers");
  if (!parseFields.includes("uploader")) parseFields.push("uploader");

  return parseFields;
}

export function convertApiQueryParamsIntoParseWhere(
  query: HttpRequestQuery
): string {
  const {
    lang: langParam,
    uploader: uploaderParam,
    instanceIds: instanceIdsParam,
  } = query;
  const whereParts = [];

  if (langParam) {
    const langs = wrapCommaSeparatedListInQuotes(langParam);
    whereParts.push(
      `"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":[${langs}]}},"className":"language"}}`
    );
  }
  if (uploaderParam) {
    const uploaders = wrapCommaSeparatedListInQuotes(uploaderParam);
    whereParts.push(
      `"uploader":{"$inQuery":{"where":{"email":{"$in":[${uploaders}]}},"className":"_User"}}`
    );
  }
  if (instanceIdsParam) {
    const instanceIds = wrapCommaSeparatedListInQuotes(instanceIdsParam);
    whereParts.push(`"bookInstanceId":{"$in":[${instanceIds}]}`);
  }
  return `{${whereParts.join(",")}}`;
}

function wrapCommaSeparatedListInQuotes(commaSeparatedList: string): string {
  if (!commaSeparatedList) return "";

  return commaSeparatedList
    .split(",")
    .map((item) => `"${item}"`)
    .join(",");
}

// Given a raw parse book record, reshape it into the format we want to return
// from our API.
export function reshapeBookRecord(book: Book, expandStr: string = null) {
  const expand = expandStr ? commaSeparatedStringToArray(expandStr) : [];

  const reshapedBook = { ...book } as any;

  reshapedBook["id"] = reshapedBook.objectId;
  delete reshapedBook["objectId"];

  reshapedBook["titles"] = [];
  if (book["allTitles"]) {
    let allTitlesObject;
    try {
      allTitlesObject = JSON.parse(book["allTitles"]);
    } catch (e) {
      try {
        // Properly encoded JSON strings will have \n escaped as \\n,
        // but we don't have properly encoded JSON, apparently.
        allTitlesObject = JSON.parse(book["allTitles"].replaceAll("\n", "\\n"));
      } catch (e2) {
        console.error(
          `Error parsing allTitles for book ${book.objectId}, ${book[
            "allTitles"
          ].replaceAll("\n", "\\n")}:  ${e2}`
        );
      }
    }
    for (const lang in allTitlesObject) {
      reshapedBook["titles"].push({
        lang: lang,
        title: allTitlesObject[lang],
      });
    }
  }
  delete reshapedBook["allTitles"];

  reshapedBook["titleFromUpload"] = reshapedBook["title"];
  delete reshapedBook["title"];

  reshapedBook["languages"] = [];
  book["langPointers"].forEach((langPointer) => {
    if (expand.includes("languages"))
      reshapedBook["languages"].push({
        id: langPointer.objectId,
        tag: langPointer.isoCode,
        name: langPointer.name,
        englishName: langPointer.englishName,
        usageCount: langPointer.usageCount,
      });
    else
      reshapedBook["languages"].push({
        tag: langPointer.isoCode,
      });
  });
  delete reshapedBook["langPointers"];

  delete reshapedBook["uploader"];
  reshapedBook["uploader"] = { email: book.uploader.username };
  if (expand.includes("uploader")) {
    reshapedBook["uploader"]["id"] = book.uploader.objectId;
  }

  delete reshapedBook["ACL"];

  // Simplify all date fields to ISO strings
  for (const field in reshapedBook) {
    if (
      reshapedBook[field] instanceof Object &&
      reshapedBook[field].__type === "Date"
    ) {
      reshapedBook[field] = reshapedBook[field].iso;
    }
  }

  return reshapedBook;
}

function commaSeparatedStringToArray(commaSeparatedString: string): string[] {
  return commaSeparatedString.split(",").map((item) => item.trim());
}
