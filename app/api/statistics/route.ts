import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  getOverviewKpis,
  getEmployeeStats,
  getDepartmentStats,
  getClientStats,
} from "@/lib/statistics/queries";

const VALID_RANGES = new Set(["7", "30", "90"]);

/**
 * Cross-request cache for the ~19-aggregation statistics snapshot.
 *
 * `rangeDays` is the only per-request input and is passed as an argument, so it
 * is folded into the cache key by `unstable_cache` (one entry per 7 / 30 / 90).
 * The data is admin-only and identical for every admin, so no per-user scoping
 * is needed. A 60s TTL is the invalidation strategy — per-transition tag
 * invalidation would be too broad (nearly every job mutation moves a metric),
 * so we accept up to 60s of staleness instead.
 */
const getStatisticsSnapshot = unstable_cache(
  async (rangeDays: number) => {
    const [overview, employees, departments, clients] = await Promise.all([
      getOverviewKpis(rangeDays),
      getEmployeeStats(rangeDays),
      getDepartmentStats(rangeDays),
      getClientStats(rangeDays),
    ]);
    return { overview, employees, departments, clients };
  },
  ["statistics-snapshot"],
  { tags: ["stats"], revalidate: 60 },
);

/** GET — admin-only statistics snapshot. ?range=7|30|90 (default: 30) */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get("range") ?? "30";
  const rangeDays = VALID_RANGES.has(rangeParam) ? Number(rangeParam) : 30;

  const { overview, employees, departments, clients } =
    await getStatisticsSnapshot(rangeDays);

  return NextResponse.json({ overview, employees, departments, clients, rangeDays });
}
