import { prisma } from "@/lib/prisma";

/** Read a single feature flag from the database. Returns false if not found. */
export async function getFeatureFlag(key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: { enabled: true },
  });
  return flag?.enabled ?? false;
}

/** Read multiple feature flags at once. */
export async function getFeatureFlags(
  keys: string[]
): Promise<Record<string, boolean>> {
  const rows = await prisma.featureFlag.findMany({
    where: { key: { in: keys } },
    select: { key: true, enabled: true },
  });
  const result: Record<string, boolean> = {};
  for (const k of keys) result[k] = false;
  for (const row of rows) result[row.key] = row.enabled;
  return result;
}
