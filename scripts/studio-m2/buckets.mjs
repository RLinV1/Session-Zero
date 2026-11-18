import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
// Explicit local endpoint and synthetic credentials only; never use an AWS credential chain.
const endpoint = process.env.STUDIO_S3_ENDPOINT;
if (endpoint !== "http://127.0.0.1:18335" || !/^sz-studio-m2-[a-f0-9]{8}$/.test(process.env.STUDIO_TEST_COMPOSE_PROJECT ?? "")) throw new Error("Expected disposable M2 S3 configuration");
const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId: process.env.STUDIO_S3_ACCESS_KEY, secretAccessKey: process.env.STUDIO_S3_SECRET_KEY } });
try {
  for (const bucket of [process.env.STUDIO_S3_BUCKET, process.env.S3_BUCKET]) {
    if (!bucket?.startsWith("studio-m2-")) throw new Error("Expected M2 bucket");
    try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; await client.send(new CreateBucketCommand({ Bucket: bucket })); }
  }
  console.log("Isolated M2 public/private buckets exist; no private bucket policy was changed.");
} finally { client.destroy(); }
