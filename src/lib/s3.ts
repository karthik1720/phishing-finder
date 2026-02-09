import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, HeadObjectCommand, ListMultipartUploadsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.S3_BUCKET || '';

// Validate bucket name (S3 bucket names cannot contain slashes)
if (BUCKET.includes('/')) {
  throw new Error(`Invalid S3_BUCKET: "${BUCKET}". Bucket names cannot contain slashes. Use only the bucket name (e.g., "my-bucket"), not a path.`);
}

export const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function createMultipartUpload(key: string) {
  const command = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return s3Client.send(command);
}

export async function getPresignedPartUrl(key: string, uploadId: string, partNumber: number, expiresIn: number) {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedGetUrl(key: string, expiresIn: number) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function uploadJson(key: string, json: any) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify(json),
    ContentType: 'application/json',
  });
  return s3Client.send(command);
}

export async function uploadText(key: string, text: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: text,
    ContentType: 'text/plain',
  });
  return s3Client.send(command);
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  });
  return s3Client.send(command);
}

export async function headObject(key: string) {
  const command = new HeadObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return s3Client.send(command);
}

export async function findUploadId(key: string) {
  const command = new ListMultipartUploadsCommand({
    Bucket: BUCKET,
    Prefix: key,
  });
  const response = await s3Client.send(command);
  // Return the most recent one if multiple, or just the first one.
  // We assume one active upload per key for this simple flow, or we filter.
  // The key must match exactly.
  const upload = response.Uploads?.find(u => u.Key === key);
  return upload?.UploadId;
}

