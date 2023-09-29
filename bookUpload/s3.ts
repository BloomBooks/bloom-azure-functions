// import https from "https";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const kUnitTestS3BucketName = "BloomLibraryBooks-UnitTests";
const kSandboxS3BucketName = "BloomLibraryBooks-Sandbox";
const kProductionS3BucketName = "BloomLibraryBooks";
const kS3Region = "us-east-1";

export async function createPresignedUrl(src, key) {
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

// copied from https://docs.aws.amazon.com/AmazonS3/latest/userguide/example_s3_Scenario_PresignedUrl_section.html
const createPresignedUrlWithClient = ({ region, bucket, key }) => {
  const client = new S3Client({ region });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
};
