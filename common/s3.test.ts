import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  getS3PrefixFromEncodedPath,
  getS3UrlFromPrefix,
  deleteBook,
  listPrefixContentsKeys,
  copyBook,
  getTemporaryS3Credentials,
  kS3Region,
  uploadTestFileToS3,
  allowPublicRead,
  getBucketName,
} from "./s3";
import { Environment } from "./utils";

async function deleteTestFiles() {
  await deleteBook("testBookId", Environment.UNITTEST);
  await deleteBook("test2BookId", Environment.UNITTEST);
  await deleteBook("test3BookId", Environment.UNITTEST);
}

async function resetTestBookFolders() {
  await deleteTestFiles();
  await uploadTestFileToS3("testBookId/12345678", Environment.UNITTEST);
  await uploadTestFileToS3("testBookId/foo/bar", Environment.UNITTEST);
  await uploadTestFileToS3("test3BookId/toBeDeleted", Environment.UNITTEST);
  await uploadTestFileToS3(
    "test3BookId/toBeDeleted/subdirectory",
    Environment.UNITTEST
  );
  await uploadTestFileToS3(
    "test3BookId/toNotGetDeleted/subdirectory2",
    Environment.UNITTEST
  );
}

describe("s3", () => {
  beforeAll(async function () {
    await resetTestBookFolders();
  });
  beforeEach(() => {});
  afterAll(async function () {
    await deleteTestFiles();
  });

  it("tests setup and list contents went correctly", async () => {
    await listPrefixContentsKeys("testBookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(2);
        expect(keys).toContain("testBookId/12345678");
        expect(keys).toContain("testBookId/foo/bar");
      }
    );
    await listPrefixContentsKeys("test3BookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(3);
        expect(keys).toContain("test3BookId/toBeDeleted");
        expect(keys).toContain("test3BookId/toBeDeleted/subdirectory");
        expect(keys).toContain("test3BookId/toNotGetDeleted/subdirectory2");
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
    await copyBook("testBookId", "test2BookId", Environment.UNITTEST);
    await listPrefixContentsKeys("test2BookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).toBe(2);
        expect(keys).toContain("test2BookId/12345678");
        expect(keys).toContain("test2BookId/foo/bar");
      }
    );
  });

  it("deleteBook() works", async () => {
    await deleteBook("test3BookId/toBeDeleted", Environment.UNITTEST);
    await listPrefixContentsKeys(
      "test3BookId/toBeDeleted",
      Environment.UNITTEST
    ).then((keys) => {
      expect(keys.length).toBe(0);
    });
    await listPrefixContentsKeys("test3BookId", Environment.UNITTEST).then(
      (keys) => {
        expect(keys.length).not.toBe(0);
      }
    );
  });

  it("getTemporaryS3Credentials() and allowPublicRead() work", async () => {
    const testPrefix = "azureFunctionUnitTests";
    const creds = await getTemporaryS3Credentials(
      testPrefix,
      Environment.UNITTEST
    );

    expect(creds).toBeDefined();
    expect(creds?.AccessKeyId).toBeDefined();
    expect(creds?.SecretAccessKey).toBeDefined();
    expect(creds?.SessionToken).toBeDefined();

    // to reassure typescript that all the credentials are defined
    if (!creds || !creds.AccessKeyId || !creds.SecretAccessKey) {
      throw new Error("getTemporaryS3Credentials error");
    }

    let tempCredentialsClient = new S3Client({
      region: kS3Region,
      credentials: {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.SessionToken,
      },
    });

    // Verify that we can upload with these temporary credentials
    const uploadResponse = await uploadTestFileToS3(
      testPrefix + "/testfile",
      Environment.UNITTEST,
      tempCredentialsClient
    );
    expect(uploadResponse.$metadata.httpStatusCode).toBe(200);

    // Verify that we cannot upload to other prefixes with these temporary credentials
    try {
      await uploadTestFileToS3(
        "testBookId/shouldFailUploadFile", // try to upload to a prefix the credentials don't give access to
        Environment.UNITTEST,
        tempCredentialsClient
      );
      fail(
        "Should have thrown an error attempting to upload to a different prefix"
      );
    } catch (e) {
      expect(e.Code).toBe("AccessDenied");
    }

    // Test allowPublicRead
    const downloadCommand = new GetObjectCommand({
      Bucket: getBucketName(Environment.UNITTEST),
      Key: "testBookId/12345678",
    });

    // at first, we should not be able to read from this prefix we don't have access to
    try {
      await tempCredentialsClient.send(downloadCommand);
      fail("Should have thrown an error attempting to download");
    } catch (e) {
      expect(e.Code).toBe("AccessDenied");
    }

    // after calling allowPublicRead, we should be able to read from that prefix
    await allowPublicRead("testBookId/12345678", Environment.UNITTEST);
    const downloadResponse = await tempCredentialsClient.send(downloadCommand);
    expect(downloadResponse.$metadata.httpStatusCode).toBe(200);
  });
});
