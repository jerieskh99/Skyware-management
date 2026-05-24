import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

interface S3Env {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicUrl: string | null;
}

function readEnv(): S3Env {
  const endpoint = process.env.S3_ENDPOINT ?? "";
  const region = process.env.S3_REGION ?? "auto";
  const bucket = process.env.S3_BUCKET ?? "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? "false") === "true";
  const publicUrl = process.env.S3_PUBLIC_URL || null;

  const missing: string[] = [];
  if (!endpoint) missing.push("S3_ENDPOINT");
  if (!bucket) missing.push("S3_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) {
    throw new Error(
      `S3 storage misconfigured. Missing env: ${missing.join(", ")}`,
    );
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    publicUrl,
  };
}

/** Process-singleton S3 client. Throws if required env vars are missing. */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const env = readEnv();
  cachedClient = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    forcePathStyle: env.forcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  cachedBucket = env.bucket;
  return cachedClient;
}

function getBucket(): string {
  if (!cachedBucket) {
    getS3Client();
  }
  if (!cachedBucket) throw new Error("S3 bucket not initialized");
  return cachedBucket;
}

/** For tests: reset the cached client so a fresh env read happens next call. */
export function __resetS3ForTests(): void {
  cachedClient = null;
  cachedBucket = null;
}

interface PresignUploadInput {
  key: string;
  contentType: string;
  contentLength: number;
  ttlSeconds?: number;
}

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
}

/** Sign a PUT URL the browser can use to upload directly to S3. */
export async function presignUpload(
  input: PresignUploadInput,
): Promise<PresignedUpload> {
  const client = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });
  const url = await getSignedUrl(client, cmd, {
    expiresIn: input.ttlSeconds ?? 300,
  });
  return {
    url,
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.contentLength),
    },
  };
}

interface PresignDownloadInput {
  key: string;
  ttlSeconds?: number;
}

/** Sign a GET URL for download. Short-lived by default. */
export async function presignDownload(
  input: PresignDownloadInput,
): Promise<string> {
  const client = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: getBucket(),
    Key: input.key,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: input.ttlSeconds ?? 300,
  });
}

/** Hard-delete an object from the bucket. Idempotent. */
export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

/**
 * Compute a deterministic storage key for an attachment row.
 * Layout: attachments/<yyyy>/<mm>/<attachmentId>/<safe-filename>
 * Filename is stripped of path separators and lowercased on the extension.
 */
export function objectKeyFor(attachmentId: string, filename: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safe = sanitizeFilename(filename);
  return `attachments/${yyyy}/${mm}/${attachmentId}/${safe}`;
}

export function sanitizeFilename(input: string): string {
  // Drop any path separators and control chars; collapse whitespace; cap length.
  const noSep = input.replace(/[\\/]/g, "_");
  const noCtrl = noSep.replace(/[\x00-\x1f\x7f]/g, "");
  const trimmed = noCtrl.trim().replace(/\s+/g, "_");
  const fallback = trimmed.length > 0 ? trimmed : "file";
  const dot = fallback.lastIndexOf(".");
  if (dot <= 0 || dot === fallback.length - 1) {
    return fallback.slice(0, 200);
  }
  const stem = fallback.slice(0, dot);
  const ext = fallback.slice(dot + 1).toLowerCase();
  return `${stem}.${ext}`.slice(0, 200);
}
