/**
 * Pure policy module — no I/O. Used by the API route to validate uploads
 * before signing a URL, and by the client to short-circuit obviously bad
 * picks before any network call. Keep behavior identical on both sides.
 */

export const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Prefix match: any MIME starting with one of these is allowed. */
export const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.",
  "application/msword",
  "text/",
] as const;

/** Exact-match types in addition to the prefix set. */
export const ALLOWED_MIME_EXACT = new Set<string>([
  "application/zip",
  "application/x-zip-compressed",
]);

export interface UploadInput {
  filename: string;
  contentType: string;
  contentLength: number;
}

export type UploadValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateUpload(input: UploadInput): UploadValidation {
  const { filename, contentType, contentLength } = input;

  if (typeof filename !== "string" || filename.trim().length === 0) {
    return { ok: false, error: "filename_required" };
  }
  if (filename.length > 255) {
    return { ok: false, error: "filename_too_long" };
  }
  if (typeof contentType !== "string" || contentType.trim().length === 0) {
    return { ok: false, error: "content_type_required" };
  }
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { ok: false, error: "content_length_invalid" };
  }
  if (contentLength > MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  if (!isAllowedMime(contentType)) {
    return { ok: false, error: "mime_not_allowed" };
  }
  return { ok: true };
}

export function isAllowedMime(mime: string): boolean {
  const lower = mime.toLowerCase();
  if (ALLOWED_MIME_EXACT.has(lower)) return true;
  for (const prefix of ALLOWED_MIME_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}
