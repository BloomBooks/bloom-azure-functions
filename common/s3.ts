import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts";
import { Environment } from "./utils";

const kUnitTestS3BucketName = "BloomLibraryBooks-UnitTests";
const kSandboxS3BucketName = "BloomLibraryBooks-Sandbox";
const kProductionS3BucketName = "BloomLibraryBooks";
export const kS3Region = "us-east-1";

function getS3UrlBase(env) {
  return `https://s3.amazonaws.com/${getBucketName(env)}/`;
}

export function getS3PrefixFromEncodedPath(path: string, env: Environment) {
  // sanity check if book is from a different bucket than env
  if (!path.includes(getBucketName(env))) {
    throw new Error("book path and environments do not match");
  }
  const urlBase = getS3UrlBase(env);
  if (!path.startsWith(urlBase)) {
    throw new Error(`book path should start with ${urlBase}`);
  }
  // remove the url base
  const urlEncodedPrefix = path.substring(urlBase.length);
  return unencode(urlEncodedPrefix);
}

export function getS3UrlFromPrefix(prefix: string, env: Environment) {
  return `${getS3UrlBase(env)}${prefix}`;
}

function unencode(path: string) {
  return decodeURIComponent(path).replace(/\+/g, " "); // also replaces + with space
}

export async function listPrefixContentsKeys(prefix: string, env: Environment) {
  const client = getS3Client(env);

  let continuationToken;
  let contentKeys = [];
  // S3 only allows 1000 keys per request, so we need to loop until we get them all
  do {
    const listCommandInput = {
      Bucket: getBucketName(env),
      Prefix: prefix,
      ContinuationToken: continuationToken,
    };
    const listCommand = new ListObjectsV2Command(listCommandInput);
    const listResponse = await client.send(listCommand);
    if (!listResponse.Contents) {
      break;
    }
    const keys = listResponse.Contents.map((file) => file.Key);
    contentKeys = contentKeys.concat(keys);
    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);
  return contentKeys;
}

export async function allowPublicRead(prefix: string, env: Environment) {
  const bookFileKeys = await listPrefixContentsKeys(prefix, env);
  const client = getS3Client(env);
  if (!bookFileKeys) {
    throw new Error(
      "s3 allowPublicRead - listPrefixContentsKeys returned no contents"
    );
  }
  const bucket = getBucketName(env);
  //for each object in listResponse, copy it to the destination
  for (const key of bookFileKeys) {
    const input = {
      Bucket: bucket,
      ACL: "public-read",
      Key: key,
    };
    const command = new PutObjectAclCommand(input);
    const response = await client.send(command);
    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(
        `s3 allowPublicRead - PutObjectAclCommand failed:\n${JSON.stringify(
          response.$metadata
        )}`
      );
    }
  }
}

export async function deleteBook(bookPathPrefix: string, env: Environment) {
  const client = getS3Client(env);
  let errorOcurred = false;
  let continuationToken;
  // S3 only allows 1000 keys per request, so we need to loop until we delete them all
  do {
    const listCommandInput = {
      Bucket: getBucketName(env),
      Prefix: bookPathPrefix,
      continuationToken,
    };
    const listCommand = new ListObjectsV2Command(listCommandInput);
    const listResponse = await client.send(listCommand);
    continuationToken = listResponse.NextContinuationToken;
    if (!listResponse.Contents) {
      break;
    }
    const keys = listResponse.Contents.map((file) => file.Key);
    const deleteCommandResponse = await deleteFiles(keys, env);
    if (deleteCommandResponse.$metadata.httpStatusCode !== 200) {
      errorOcurred = true;
    }
  } while (continuationToken);

  if (errorOcurred) {
    console.log("DeleteObjectsCommand failed");
    // TODO future work: we want this to somehow notify us of the now-orphan old book files
  }
}

export async function deleteFiles(fileKeys: string[], env: Environment) {
  if (fileKeys.length === 0) return;

  const client = getS3Client(env);
  const deleteCommandInput = {
    Bucket: getBucketName(env),
    Delete: {
      Objects: fileKeys.map((key) => ({
        Key: key,
      })),
    },
  };
  const deleteCommand = new DeleteObjectsCommand(deleteCommandInput);
  return await client.send(deleteCommand);
}

export async function copyBook(
  srcPath: string,
  destPath: string,
  env: Environment
) {
  const client = getS3Client(env);

  const bookFileKeys = await listPrefixContentsKeys(srcPath, env);
  if (!bookFileKeys) {
    // Unexpected; somehow the existing book has no files.
    // However, we don't want to fail the upload.
    return;
  }
  const bucket = getBucketName(env);
  //for each object in listResponse, copy it to the destination
  for (const key of bookFileKeys) {
    // We make a new PDF every time, so there is no need to copy the old one.
    if (key.endsWith(".pdf")) {
      continue;
    }

    const copyCommandInput = {
      Bucket: bucket,
      CopySource: `/${bucket}/${encodeURI(key)}`,
      Key: key.replace(srcPath, destPath),
    };

    const copyCommand = new CopyObjectCommand(copyCommandInput);
    const response = await client.send(copyCommand);
    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(
        `s3 copyBook - CopyObjectCommand failed:\n${JSON.stringify(
          response.$metadata
        )}`
      );
    }
  }
}

export async function getTemporaryS3Credentials(
  prefix: string,
  env: Environment
) {
  const client = new STSClient({
    region: kS3Region,
    credentials: getS3Credentials(env),
  });
  const bucket = getBucketName(env);
  // policy modified from https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_getfederationtoken.html
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        Resource: [`arn:aws:s3:::${bucket}/${prefix}*`],
      },
      {
        Effect: "Allow",
        Action: ["s3:PutObjectAcl"],
        Resource: [`arn:aws:s3:::${bucket}/${prefix}*`],
        Condition: {
          StringEquals: {
            "s3:x-amz-acl": "public-read",
          },
        },
      },
    ],
  });
  const input = {
    Name: "TemporaryBookUploadCredentials",
    Policy: policy,
    DurationSeconds: 86400, // 24 hours
  };
  const command = new GetFederationTokenCommand(input);
  const response = await client.send(command);
  return response.Credentials;
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

let s3ClientProd;
let s3ClientDev;
let s3ClientUnitTest;
function getS3Client(env: Environment) {
  switch (env) {
    case Environment.PRODUCTION:
      return s3ClientProd || (s3ClientProd = createS3Client(env));
    case Environment.DEVELOPMENT:
      return s3ClientDev || (s3ClientDev = createS3Client(env));
    case Environment.UNITTEST:
      return s3ClientUnitTest || (s3ClientUnitTest = createS3Client(env));
  }
}
function createS3Client(env: Environment) {
  return new S3Client({
    region: kS3Region,
    credentials: getS3Credentials(env),
  });
}
function getS3Credentials(env: Environment) {
  let suffix = "";
  switch (env) {
    case Environment.PRODUCTION:
      suffix = "Prod";
      break;
    case Environment.DEVELOPMENT:
      suffix = "Dev";
      break;
    case Environment.UNITTEST:
      suffix = "UnitTest";
      break;
  }
  return {
    accessKeyId: process.env[`BloomUploadPermissionManagerS3Key${suffix}`],
    secretAccessKey:
      process.env[`BloomUploadPermissionManagerS3SecretKey${suffix}`],
  };
}

// for unit tests
export async function uploadTestFileToS3(
  prefix: string,
  env: Environment,
  client?: S3Client
) {
  if (!client) {
    client = getS3Client(env);
  }
  const uploadCommandInput = {
    Bucket: getBucketName(env),
    Key: prefix,
    Body: "testfilebody",
  };
  const uploadCommand = new PutObjectCommand(uploadCommandInput);
  return await client.send(uploadCommand);
}
