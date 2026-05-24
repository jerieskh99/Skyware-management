/**
 * Saved-view filters live as a flat `Record<string, string>` so they round-trip
 * cleanly through both the URL query string and `filter_json` in Postgres.
 */
export type FilterRecord = Record<string, string>;

/** Drop empty/whitespace-only values; trim keys. Stable order by key. */
export function normalizeFilters(input: Record<string, string | undefined>): FilterRecord {
  const out: FilterRecord = {};
  const keys = Object.keys(input).sort();
  for (const k of keys) {
    const v = input[k];
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    out[k] = trimmed;
  }
  return out;
}

/** Encode a filter record as a URL query string suffix (no leading `?`). */
export function toQueryString(filters: FilterRecord): string {
  return new URLSearchParams(filters).toString();
}

/** Build a `pathname[?qs]` href from a filter record. */
export function toHref(pathname: string, filters: FilterRecord): string {
  const qs = toQueryString(filters);
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Coerce an unknown JSON value (from the API) into a safe filter record.
 * Anything that isn't a `Record<string, string>` becomes `{}`.
 */
export function parseFilterJson(value: unknown): FilterRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: FilterRecord = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
