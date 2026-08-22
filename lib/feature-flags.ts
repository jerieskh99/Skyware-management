import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Read a single feature flag from the database. Returns false if not found.
 *
 * Wrapped in React `cache()` so repeated reads of the SAME key within one
 * server request (the portal shell reads several flags across layout, header,
 * and page, some keys twice) collapse to a single DB round-trip. This is
 * request-scoped deduplication only — it does not cache across requests. A
 * cross-request TTL cache (`unstable_cache` + tag invalidation on the admin
 * flag PATCH) is the Phase B follow-up.
 */
export const getFeatureFlag = cache(async (key: string): Promise<boolean> => {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: { enabled: true },
  });
  return flag?.enabled ?? false;
});

/**
 * Read multiple feature flags at once. Also request-cached, though the dedup
 * only hits when callers pass an equal `keys` array reference — prefer this
 * for a known batch, and `getFeatureFlag` for individual gated checks.
 */
export const getFeatureFlags = cache(
  async (keys: string[]): Promise<Record<string, boolean>> => {
    const rows = await prisma.featureFlag.findMany({
      where: { key: { in: keys } },
      select: { key: true, enabled: true },
    });
    const result: Record<string, boolean> = {};
    for (const k of keys) result[k] = false;
    for (const row of rows) result[row.key] = row.enabled;
    return result;
  },
);
