import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  getS3Client,
  getBucketName,
  deleteBook,
  listPrefixContentsKeys,
  copyBook,
  getTemporaryS3Credentials,
} from "./s3";
import { Environment } from "./utils";

async function uploadTestFileToS3(prefix: string, env: Environment) {
  const client = getS3Client();
  const uploadCommandInput = {
    Bucket: getBucketName(env),
    Key: prefix,
    Body: "testfilebody",
  };
  const uploadCommand = new PutObjectCommand(uploadCommandInput);
  await client.send(uploadCommand);
}

async function resetTestBookFolders() {
  await deleteBook("testBookId2", Environment.UNITTEST);
  await deleteBook("testBookId", Environment.UNITTEST);
  await uploadTestFileToS3("testBookId/12345678", Environment.UNITTEST);
  await uploadTestFileToS3("testBookId/foo/bar", Environment.UNITTEST);
}

describe("s3", () => {
  beforeAll(async function () {
    await resetTestBookFolders();
  });
  beforeEach(() => {});

  it("tests setup and list contents went correctly", async () => {
    await listPrefixContentsKeys("testBookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(2);
        expect(keys).toContain("testBookId/12345678");
        expect(keys).toContain("testBookId/foo/bar");
      }
    );
  });

  it("getS3PrefixFromEncodedPath() works", async () => {
    expect(
      getS3PrefixFromEncodedPath(
        "https://s3.amazonaws.com/BloomLibraryBooks/foo%2fbar+baz/boo/",
        Environment.PRODUCTION
      )
    ).toBe("foo/bar baz/boo/");
  });

  it("getS3UrlFromPrefix() works", async () => {
    expect(
      getS3UrlFromPrefix("testBookId/12345678/", Environment.PRODUCTION)
    ).toBe("https://s3.amazonaws.com/BloomLibraryBooks/testBookId/12345678/");
  });

  it("copyBook() works", async () => {
    await copyBook("testBookId", "testBookId2", Environment.UNITTEST);
    await listPrefixContentsKeys("testBookId2", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(2);
        expect(keys).toContain("testBookId2/12345678");
        expect(keys).toContain("testBookId2/foo/bar");
      }
    );
  });

  // // TODO make this not interfere with the rest
  it("deleteBook() works", async () => {
    await deleteBook("testBookId/foo", Environment.UNITTEST);
    await listPrefixContentsKeys("testBookId/foo", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(0);
      }
    );
    await listPrefixContentsKeys("testBookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).not.toBe(0);
      }
    );
  });

  it("getTemporaryS3Credentials() works", async () => {
    const creds = await getTemporaryS3Credentials(
      "testTempCredsPrefix",
      Environment.UNITTEST
    );
    expect(creds).toBeDefined();
    expect(creds.AccessKeyId).toBeDefined();
    expect(creds.SecretAccessKey).toBeDefined();
    expect(creds.SessionToken).toBeDefined();
    // TODO maybe BloomLibrary should test that credentials work
    // Can it test public read too?
  });
});

// TODO test more than continuation token, cleanup?
