import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const kUnitTestS3BucketName = "BloomLibraryBooks-UnitTests";
const kSandboxS3BucketName = "BloomLibraryBooks-Sandbox";
const kProductionS3BucketName = "BloomLibraryBooks";
const kS3Region = "us-east-1";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts"; // ES Modules import
import { escape } from "querystring";
import { Environment } from "./utils";

export function getS3PrefixFromEncodedPath(path: string, env: Environment) {
  // sanity check if book is from a different bucket than env
  if (!path.includes(getBucketName(env))) {
    throw new Error("book path and source do not match");
  }
  // take everything after the last slash in path
  const lastSlashIndex = path.lastIndexOf("/");
  const urlEncodedPrefix = path.substring(lastSlashIndex + 1);
  return unencode(urlEncodedPrefix);
}

export function urlEncode(str: string) {
  const a = encodeURIComponent(str); // TODO delete
  const b = escape(str);
  return encodeURIComponent(str); // TODO does this encoding work?
  // return str.replace("@", "%40").replace(/\//g, "%2f").replace(/ /g, "+");
}

function unencode(path: string) {
  const a = decodeURIComponent(path); // TODO delete
  const b = unescape(path);
  return decodeURIComponent(path).replace(/\+/g, " ");
  // TODO + for spaces do not decode properly
}

async function listPrefixContents(prefix: string, env: Environment) {
  //  TODO make sure this gets all descendant levels
  const client = getS3Client();
  const listCommandInput = {
    Bucket: getBucketName(env),
    Prefix: prefix,
  };
  const listCommand = new ListObjectsV2Command(listCommandInput);
  const listResponse = await client.send(listCommand);
  return listResponse.Contents;
}

export async function allowPublicRead(prefix: string, env: Environment) {
  const bookFiles = await listPrefixContents(prefix, env);
  const client = getS3Client();
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents");
  }
  const bucket = getBucketName(env);
  //for each object in listResponse, copy it to the destination
  for (const bookFile of bookFiles) {
    const key = bookFile.Key;
    const input = {
      Bucket: bucket,
      ACL: "public-read",
      Key: key,
    };
    const command = new PutObjectAclCommand(input);
    const response = await client.send(command);
    if (response.$metadata.httpStatusCode !== 200) {
      // TODO test
      throw new Error("Allow public read failed");
    }
  }
}

export async function deleteBook(bookPath: string, env: Environment) {
  const bookPathPrefix = getS3PrefixFromEncodedPath(bookPath, env);
  const bookFiles = await listPrefixContents(bookPathPrefix, env);
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents");
  }
  const client = getS3Client();
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: getBucketName(env),
    Delete: {
      Objects: bookFiles.map((file) => ({ Key: file.Key })),
    },
  });
  const response = await client.send(deleteCommand);
  // TODO future work: we want this to somehow notify us of the now-orphan old book files
}

export async function copyBook(
  srcPath: string,
  destPath: string,
  env: Environment
) {
  const client = getS3Client();

  const bookFiles = await listPrefixContents(srcPath, env);
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents");
  }
  const bucket = getBucketName(env);
  //for each object in listResponse, copy it to the destination
  for (const bookFile of bookFiles) {
    const key = bookFile.Key;

    const copyCommandInput = {
      Bucket: bucket,
      CopySource: `/${bucket}/${key}`,
      Key: key.replace(srcPath, destPath),
    };

    const copyCommand = new CopyObjectCommand(copyCommandInput);
    const response = await client.send(copyCommand);
    if (response.$metadata.httpStatusCode !== 200) {
      // TODO test
      throw new Error("CopyObjectCommand failed");
    }
  }
}

export async function getTemporaryS3Credentials(prefix: string) {
  try {
    const client = new STSClient({ region: kS3Region });
    // policy modified from https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_getfederationtoken.html
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: [`arn:aws:s3:::${prefix}`],
        },
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          Resource: [`arn:aws:s3:::${prefix}/*`],
        },
      ],
    });
    const input = {
      Name: "testTemporaryCredentialsName",
      Policy: policy,
      DurationSeconds: 86400, // 24 hours
    };
    const command = new GetFederationTokenCommand(input);
    const response = await client.send(command);
    return response.Credentials;
  } catch (err) {
    console.error(err);
  }
}

export function getBucketName(env: Environment) {
  switch (env) {
    case Environment.PRODUCTION:
      return kProductionS3BucketName;
    case Environment.DEVELOPMENT:
      return kSandboxS3BucketName;
    case Environment.UNITTEST:
      return kUnitTestS3BucketName;
  }
}

function getS3Client() {
  return new S3Client({ region: kS3Region });
}

//hCcJWQoj1I
