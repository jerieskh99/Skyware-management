import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Cache tag for the cross-request feature-flag cache. The admin flag-toggle
 * route (`app/api/admin/feature-flags/[key]/route.ts`) calls
 * `revalidateTag(FEATURE_FLAGS_TAG)` after a successful write so a toggle takes
 * effect on the next navigation instead of waiting out the TTL backstop below.
 */
export const FEATURE_FLAGS_TAG = "feature-flags";

/**
 * TTL backstop (seconds) for the cross-request cache. Invalidation is
 * tag-driven on write; this only bounds staleness if a flag row is ever changed
 * out-of-band (e.g. a manual DB edit) without going through the admin route.
 */
const FEATURE_FLAGS_TTL_SECONDS = 300;

/**
 * `unstable_cache` throws `Invariant: incrementalCache missing` (Next error
 * code E469) when invoked without a Next.js request/render context — i.e.
 * outside a route handler or RSC render, such as in unit tests or a standalone
 * script. Every real navigation that reads a flag runs inside such a context,
 * so this only matches non-request execution.
 */
function isIncrementalCacheMissing(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE;
  return code === "E469" || err.message.includes("incrementalCache missing");
}

/**
 * Read `read` through Next's cross-request `unstable_cache`, keyed by
 * `keyParts` and tagged so the admin toggle can purge it. Outside a request
 * context (where the incremental cache is unavailable) fall back to reading
 * straight through: correct data, just not cross-request cached.
 */
async function readCrossRequestCached<T>(
  read: () => Promise<T>,
  keyParts: string[],
): Promise<T> {
  try {
    return await unstable_cache(read, keyParts, {
      tags: [FEATURE_FLAGS_TAG],
      revalidate: FEATURE_FLAGS_TTL_SECONDS,
    })();
  } catch (err) {
    if (isIncrementalCacheMissing(err)) return read();
    throw err;
  }
}

/**
 * Read a single feature flag from the database. Returns false if not found.
 *
 * Two cache layers compose here:
 *  - `unstable_cache` (inner, via `readCrossRequestCached`) caches the DB read
 *    ACROSS requests, keyed per flag key through `keyParts`, tagged
 *    `FEATURE_FLAGS_TAG`, with a TTL backstop. Flags change rarely, so this
 *    avoids a Postgres round-trip on every navigation, and it is purged
 *    immediately when an admin toggles a flag.
 *  - React `cache()` (outer) dedupes repeated reads of the SAME key WITHIN one
 *    server request (the portal shell reads several flags across layout,
 *    header, and page, some keys twice) down to a single call.
 */
export const getFeatureFlag = cache((key: string): Promise<boolean> => {
  return readCrossRequestCached(async () => {
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    return flag?.enabled ?? false;
  }, ["feature-flag", key]);
});

/**
 * Read multiple feature flags at once. Cross-request cached (keyed by the set
 * of requested keys, order-independent) and request-deduped, same as
 * `getFeatureFlag`. The request-dedup layer only hits when callers pass an
 * equal `keys` array reference — prefer this for a known batch, and
 * `getFeatureFlag` for individual gated checks.
 */
export const getFeatureFlags = cache(
  (keys: string[]): Promise<Record<string, boolean>> => {
    return readCrossRequestCached(async () => {
      const rows = await prisma.featureFlag.findMany({
        where: { key: { in: keys } },
        select: { key: true, enabled: true },
      });
      const result: Record<string, boolean> = {};
      for (const k of keys) result[k] = false;
      for (const row of rows) result[row.key] = row.enabled;
      return result;
    }, ["feature-flags", [...keys].sort().join(",")]);
  },
);
