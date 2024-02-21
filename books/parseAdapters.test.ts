import { Book } from "../common/BloomParseServer";
import {
  convertApiQueryParamsIntoParseWhere,
  reshapeBookRecord,
} from "./parseAdapters";

describe("parseAdapters", () => {
  it("convertApiQueryParamsIntoParseWhere single language", async () => {
    const query = {
      lang: "en",
    };
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":["en"]}},"className":"language"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple languages", async () => {
    const query = {
      lang: "en,fr,de",
    };
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"langPointers":{"$inQuery":{"where":{"isoCode":{"$in":["en","fr","de"]}},"className":"language"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere single uploader", async () => {
    const query = {
      uploader: "bob@example.com",
    };
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"uploader":{"$inQuery":{"where":{"email":{"$in":["bob@example.com"]}},"className":"_User"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple uploaders", async () => {
    const query = {
      uploader: "bob@example.com,sue@ex.com",
    };
    const where = convertApiQueryParamsIntoParseWhere(query);
    expect(where).toBe(
      '{"uploader":{"$inQuery":{"where":{"email":{"$in":["bob@example.com","sue@ex.com"]}},"className":"_User"}}}'
    );
  });

  it("convertApiQueryParamsIntoParseWhere multiple params", async () => {
    const query = {
      lang: "en",
      uploader: "bob@example.com",
    };
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
});
