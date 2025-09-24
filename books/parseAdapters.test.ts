import { Book } from "../common/BloomParseServer";
import {
  convertApiQueryParamsIntoParseAdditionalParams,
  convertApiQueryParamsIntoParseWhere,
  reshapeBookRecord,
} from "./parseAdapters";

describe("parseAdapters", () => {
  it("convertApiQueryParamsIntoParseWhere single language", async () => {
    const query = new URLSearchParams({ lang: "en" });
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":["en"]}},"className":"language"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple languages", async () => {
    const query = new URLSearchParams({ lang: "en,fr,de" });
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":["en","fr","de"]}},"className":"language"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere single uploader", async () => {
    const query = new URLSearchParams({ uploader: "bob@example.com" });
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"uploader":{"$inQuery":{"where":{"email":{"$in":["bob@example.com"]}},"className":"_User"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple uploaders", async () => {
    const query = new URLSearchParams({
      uploader: "bob@example.com,sue@ex.com",
    });
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"uploader":{"$inQuery":{"where":{"email":{"$in":["bob@example.com","sue@ex.com"]}},"className":"_User"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple params", async () => {
    const query = new URLSearchParams({
      lang: "en",
      uploader: "bob@example.com",
    });
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":["en"]}},"className":"language"}},"uploader":{"$inQuery":{"where":{"email":{"$in":["bob@example.com"]}},"className":"_User"}}}'
    );
  });

  const rawParseBook = {
    objectId: "123",
    title: "The Title",
    allTitles: '{ "en": "The Title", "fr": "Le Titre\n"}',
    langPointers: [
      {
        objectId: "456",
        isoCode: "fr",
        name: "français",
        englishName: "French",
        usageCount: 10,
      },
      {
        objectId: "789",
        isoCode: "en",
        name: "English",
        englishName: "English",
        usageCount: 1,
      },
    ],
    uploader: { objectId: "123", username: "bob@example.com" },
  };
  it("reshapeBookRecord does not expand languages by default", () => {
    const result = reshapeBookRecord(rawParseBook as unknown as Book);
    expect(result["languages"]).toEqual([
      {
        tag: "fr",
      },
      {
        tag: "en",
      },
    ]);
  });
  it("reshapeBookRecord expands languages when asked", () => {
    const result = reshapeBookRecord(
      rawParseBook as unknown as Book,
      "languages"
    );
    expect(result["languages"]).toEqual([
      {
        id: "456",
        tag: "fr",
        name: "français",
        englishName: "French",
        usageCount: 10,
      },
      {
        id: "789",
        tag: "en",
        name: "English",
        englishName: "English",
        usageCount: 1,
      },
    ]);
  });
  it("reshapeBookRecord creates titles object", () => {
    const result = reshapeBookRecord(rawParseBook as unknown as Book);
    expect(result["titles"]).toEqual([
      { lang: "en", title: "The Title" },
      { lang: "fr", title: "Le Titre\n" },
    ]);
  });
  it("reshapeBookRecord returns properly shaped uploader object", () => {
    const result = reshapeBookRecord(rawParseBook as unknown as Book);
    expect(result["uploader"]).toEqual({ email: "bob@example.com" });
  });

  it("convertApiQueryParamsIntoParseAdditionalParams handles empty query", () => {
    const query = new URLSearchParams();
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({});
  });
  it("convertApiQueryParamsIntoParseAdditionalParams handles limit", () => {
    const query = new URLSearchParams({ limit: "10" });
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({ limit: 10 });
  });
  it("convertApiQueryParamsIntoParseAdditionalParams handles offset", () => {
    const query = new URLSearchParams({ offset: "10" });
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({ skip: 10 });
  });
  it("convertApiQueryParamsIntoParseAdditionalParams handles limit and offset", () => {
    const query = new URLSearchParams({ limit: "10", offset: "10" });
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({ limit: 10, skip: 10 });
  });
  it("convertApiQueryParamsIntoParseAdditionalParams handles limit, offset, and count", () => {
    const query = new URLSearchParams({
      limit: "10",
      offset: "10",
      count: "true",
    });
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({ limit: 10, skip: 10, count: 1 });
  });
  it("convertApiQueryParamsIntoParseAdditionalParams handles count as false", () => {
    const query = new URLSearchParams({ count: "false" });
    const additionalParams =
      convertApiQueryParamsIntoParseAdditionalParams(query);
    expect(additionalParams).toEqual({ count: 0 });
  });
});
