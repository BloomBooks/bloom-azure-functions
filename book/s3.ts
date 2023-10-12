// import https from "https";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const kUnitTestS3BucketName = "BloomLibraryBooks-UnitTests";
const kSandboxS3BucketName = "BloomLibraryBooks-Sandbox";
const kProductionS3BucketName = "BloomLibraryBooks";
const kS3Region = "us-east-1";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts"; // ES Modules import

// TODO compare this with extractBookFilename and getS3LinkBase from BloomParseSErver
export function getS3PrefixFromEncodedPath(path: string, src: "prod" | "dev") {
  // sanity check if book is from a different bucket than src
  if (!path.includes(getBucketName(src))) {
    throw new Error("book path and source do not match");
  }
  // take everything after the last slash in path
  const lastSlashIndex = path.lastIndexOf("/");
  const urlEncodedPrefix = path.substring(lastSlashIndex + 1);
  return unencode(urlEncodedPrefix);
  // ("noel_chou@sil.org/fdb49f4f-4414-4269-ab1c-38ad8658a22d/BL-12238 test5+in+test5Damal/");
}

export function getS3UrlFromPrefix(prefix: string, src: "prod" | "dev") {
  const encodedPrefix = urlEncode(prefix);
  return `https://s3.amazonaws.com/${getBucketName(src)}/${encodedPrefix}`;
}

function urlEncode(str: string) {
  return str.replace("@", "%40").replace("/", "%2f").replace(/ /g, "+");
}

function unencode(path: string) {
  return path.replace("%40", "@").replace(/%2f/g, "/").replace(/\+/g, " ");
}

async function listPrefixContents(src: "prod" | "dev", prefix: string) {
  //  TODO make sure this gets all descendant levels
  const client = getS3Client();
  const listCommandInput = {
    Bucket: getBucketName(src),
    Prefix: prefix,
  };
  const listCommand = new ListObjectsV2Command(listCommandInput);
  const listResponse = await client.send(listCommand);
  return listResponse.Contents;
}

export async function allowPublicRead(src: "prod" | "dev", prefix: string) {
  const bookFiles = await listPrefixContents(src, prefix);
  const client = getS3Client();
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents"); // TODO redo
  }
  const bucket = getBucketName(src);
  //for each object in listResponse, copy it to the destination
  for (let i = 0; i < bookFiles.length; i++) {
    // TODO can this be a foreach?
    const object = bookFiles[i];
    const key = object.Key;

    const input = {
      Bucket: bucket,
      ACL: "public-read",
      Key: key,
    };
    const command = new PutObjectAclCommand(input);
    const response = await client.send(command);
    console.log(response);
  }
}

export async function deleteBook(src: "prod" | "dev", bookPath: string) {
  const bookPathPrefix = getS3PrefixFromEncodedPath(bookPath, src);
  const bookFiles = await listPrefixContents(src, bookPathPrefix);
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents"); // TODO redo
  }
  const client = getS3Client();
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: getBucketName(src),
    Delete: {
      Objects: bookFiles.map((file) => ({ Key: file.Key })),
    },
  });
  const response = await client.send(deleteCommand);
  console.log(response);
  // if (response.Errors) {
  //   console.log("Error deleting book from S3");
  //   console.log(response.Errors);
  // }
}

export async function copyBook(
  src: "prod" | "dev",
  srcPath: string,
  destPath: string
) {
  const client = getS3Client();

  const bookFiles = await listPrefixContents(src, srcPath);
  if (!bookFiles) {
    throw new Error("ListObjectsV2Command returned no contents"); // TODO redo
  }
  const bucket = getBucketName(src);
  //for each object in listResponse, copy it to the destination
  for (let i = 0; i < bookFiles.length; i++) {
    // TODO can this be a foreach?
    const object = bookFiles[i];
    const key = object.Key;

    const copyCommandInput = {
      Bucket: bucket,
      CopySource: `/${bucket}/${key}`,
      Key: key.replace(srcPath, destPath),
    };

    const copyCommand = new CopyObjectCommand(copyCommandInput);
    const response = await client.send(copyCommand); // TODO what if errors?
    console.log(response);
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
      // DurationSeconds: Number("int"),
      // Tags: [
      //   // tagListType
      //   {
      //     // Tag
      //     Key: "STRING_VALUE", // required
      //     Value: "STRING_VALUE", // required
      //   },
      // ],
    };
    const command = new GetFederationTokenCommand(input);
    const response = await client.send(command);
    return response.Credentials;
  } catch (err) {
    console.error(err);
  }
}

export function getBucketName(src: "prod" | "dev") {
  // TODO switch to switch statement?
  if (src === "prod") {
    return kProductionS3BucketName;
  } else if (src === "dev") {
    return kSandboxS3BucketName;
  } else {
    throw new Error("Invalid src parameter"); // TODO is this still neccesary?
  }
}

// TODO delete?
export async function createPresignedUrl(src: "prod" | "dev", key) {
  let s3BucketName;
  if (src === "prod") {
    s3BucketName = kProductionS3BucketName;
  } else if (src === "dev") {
    s3BucketName = kSandboxS3BucketName;
  } else {
    throw new Error("Invalid src parameter");
  }
  return createPresignedUrlWithClient({
    region: kS3Region,
    bucket: s3BucketName,
    key,
  });
}

// TODO delete?
// copied from https://docs.aws.amazon.com/AmazonS3/latest/userguide/example_s3_Scenario_PresignedUrl_section.html
const createPresignedUrlWithClient = ({ region, bucket, key }) => {
  const client = getS3Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
};

function getS3Client() {
  return new S3Client({ region: kS3Region });
}
