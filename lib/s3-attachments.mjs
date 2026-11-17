import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const prefix = 'wono/BizNest/New BIZ Nest Website/Resumes/';
const bucket = 'wonov-aws-s3-storage';
const region = 'ap-south-1';
const origin = `https://${bucket}.s3.${region}.amazonaws.com`;
let client;

function s3() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.PROJECT_AWS_ACCESS_KEY;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.PROJECT_AWS_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 upload credentials are required.');
  return client ??= new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN },
    maxAttempts: 2,
  });
}

function keyFromLink(link) {
  const key = decodeURIComponent(new URL(link).pathname.slice(1));
  if (!link.startsWith(`${origin}/`) || !key.startsWith(prefix)) throw new Error('Invalid attachment link.');
  return key;
}

export async function ensureAttachmentPrefix() {
  try {
    await s3().send(new PutObjectCommand({
      Bucket: bucket, Key: prefix, Body: new Uint8Array(), IfNoneMatch: '*',
    }), { abortSignal: AbortSignal.timeout(20000) });
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 412) throw error;
  }
}

/** @param {string} id @param {string} filename @param {string} contentType @param {Uint8Array} bytes */
export async function uploadAttachment(id, filename, contentType, bytes) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid attachment ID.');
  const extension = filename.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() || '';
  const key = `${prefix}${id}/file${extension}`;
  await s3().send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: bytes, ContentType: contentType,
    ContentDisposition: 'attachment', ChecksumAlgorithm: 'SHA256',
  }), { abortSignal: AbortSignal.timeout(20000) });
  return `${origin}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** @param {string} link */
export async function deleteAttachment(link) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: keyFromLink(link) }), {
    abortSignal: AbortSignal.timeout(5000),
  });
}

/** @param {string} link */
export async function readAttachment(link) {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: keyFromLink(link) }), {
    abortSignal: AbortSignal.timeout(20000),
  });
  if (!result.Body) throw new Error('Attachment missing from S3 response.');
  return result.Body.transformToByteArray();
}
