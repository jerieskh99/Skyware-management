import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  getOverviewKpis,
  getEmployeeStats,
  getDepartmentStats,
  getClientStats,
} from "@/lib/statistics/queries";

const VALID_RANGES = new Set(["7", "30", "90"]);

/** GET — admin-only statistics snapshot. ?range=7|30|90 (default: 30) */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get("range") ?? "30";
  const rangeDays = VALID_RANGES.has(rangeParam) ? Number(rangeParam) : 30;

  const [overview, employees, departments, clients] = await Promise.all([
    getOverviewKpis(rangeDays),
    getEmployeeStats(rangeDays),
    getDepartmentStats(rangeDays),
    getClientStats(rangeDays),
  ]);

  return NextResponse.json({ overview, employees, departments, clients, rangeDays });
}
