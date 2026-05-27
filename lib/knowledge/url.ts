import { createHash } from "node:crypto";

/**
 * Knowledge external URL helpers.
 *
 * Canonicalization is strict and deterministic: every URL that should be
 * treated as "the same source" by the duplicate-detection partial unique
 * index on `external_url_hash` must round-trip to the same canonical form.
 *
 * Per `docs/knowledge-sprint-2026-05/knowledge_security_permissions_audit.md`
 * §5 we reject non-http(s) up front.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "fbclid",
  "gclid",
  "yclid",
  "mc_eid",
  "mc_cid",
  "igshid",
]);

/** Schemes mapped to their default ports; used to strip explicit defaults. */
const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

export class InvalidExternalUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidExternalUrlError";
  }
}

/**
 * Apply the canonicalization rules:
 * - require an http(s) scheme,
 * - lowercase scheme + host,
 * - strip `www.` prefix,
 * - strip the default port for the scheme,
 * - drop fragment,
 * - sort query params alphabetically,
 * - drop tracking params (utm_*, ref, fbclid, gclid, ...).
 *
 * Throws `InvalidExternalUrlError` for malformed input or disallowed schemes.
 */
export function canonicalizeUrl(input: string): string {
  if (!input || typeof input !== "string") {
    throw new InvalidExternalUrlError("empty or non-string input");
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new InvalidExternalUrlError("blank url");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidExternalUrlError(`not a valid url: ${trimmed.slice(0, 80)}`);
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new InvalidExternalUrlError(`scheme not allowed: ${scheme}`);
  }
  url.protocol = scheme;

  // Lowercase the hostname. URL.hostname is already case-folded by the
  // browser/node implementation for ASCII, but explicit is safer.
  url.hostname = url.hostname.toLowerCase();
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }

  // Strip default port.
  if (url.port && url.port === DEFAULT_PORTS[scheme]) {
    url.port = "";
  }

  // Drop fragment.
  url.hash = "";

  // Sort and filter query params. Build a new URLSearchParams from the
  // sorted, filtered entries so the final string has stable ordering.
  const entries: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  // Replace query params atomically. Use Array.from -> set to avoid the
  // "delete-while-iterating" hazard on URLSearchParams.
  const keysToDelete: string[] = [];
  for (const key of url.searchParams.keys()) keysToDelete.push(key);
  for (const key of keysToDelete) url.searchParams.delete(key);
  for (const [key, value] of entries) url.searchParams.append(key, value);

  // Normalize the pathname: an empty path becomes "/" so example.com and
  // example.com/ collapse together. Trailing slash on non-root paths is
  // preserved because some sites treat /foo and /foo/ as distinct.
  if (url.pathname === "") url.pathname = "/";

  return url.toString();
}

/**
 * SHA-256 of the canonical URL, lowercase hex. Stable across processes and
 * Node versions. The partial unique index on `external_url_hash` relies on
 * this being deterministic for any two URLs that canonicalize to the same
 * string.
 */
export function hashCanonicalUrl(input: string): string {
  const canonical = canonicalizeUrl(input);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Returns true if `input` is a syntactically acceptable external URL per
 * the validators table. Does NOT make a network call. Use for the
 * `external_reference` submit-time validator.
 */
export function isAcceptableExternalUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  try {
    canonicalizeUrl(input);
    return true;
  } catch {
    return false;
  }
}
