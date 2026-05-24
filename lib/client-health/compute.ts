import { Prisma } from "@prisma/client";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getBankBurn } from "@/lib/billing/queries";

const ACTIVE_STATUSES_SQL = Prisma.sql`('new','assigned','available','taken','working_on_it','waiting_for_client','waiting_for_admin')`;

const OUTSTANDING_STATUSES_SQL = Prisma.sql`('draft','sent_to_client','waiting_for_payment','partially_paid','overdue')`;

const DEFAULT_TZ = "Asia/Jerusalem";

export interface SnapshotInput {
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
  openJobs: number;
  delayedJobs: number;
  hoursConsumed: Prisma.Decimal;
  outstandingMinorUnits: number;
  avgProjectedMonths: Prisma.Decimal | null;
}

interface OutstandingRow { total: bigint | number | null; }
interface DelayedRow { delayed_count: bigint; }
interface HoursRow { hours_total: number | null; }

/**
 * Compute the metric snapshot for one client across [periodStart, periodEnd).
 *
 * `hoursConsumed` counts jobs whose `completedTimestamp` falls inside the
 * period. The other KPIs are point-in-time as of call.
 */
export async function computeSnapshotFor(
  clientId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<SnapshotInput> {
  const [openJobs, delayedRows, hoursRows, outstandingRows, activeBanks] = await prisma.$transaction([
    prisma.job.count({
      where: {
        clientId,
        status: { in: ["new", "assigned", "available", "taken", "working_on_it", "waiting_for_client", "waiting_for_admin"] },
      },
    }),
    prisma.$queryRaw<DelayedRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS delayed_count
      FROM jobs
      WHERE client_id = ${clientId}::uuid
        AND status::text IN ${ACTIVE_STATUSES_SQL}
        AND assigned_timestamp IS NOT NULL
        AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
    `),
    prisma.$queryRaw<HoursRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(time_spent_minutes), 0)::float8 / 60.0 AS hours_total
      FROM jobs
      WHERE client_id = ${clientId}::uuid
        AND completed_timestamp >= ${periodStart}
        AND completed_timestamp < ${periodEnd}
    `),
    prisma.$queryRaw<OutstandingRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(amount_placeholder), 0)::bigint AS total
      FROM payments
      WHERE client_id = ${clientId}::uuid
        AND status::text IN ${OUTSTANDING_STATUSES_SQL}
    `),
    prisma.hourlyBank.findMany({
      where: { status: "active", billingAccount: { clientId } },
      select: { id: true },
    }),
  ]);

  const delayedJobs = Number(delayedRows[0]?.delayed_count ?? BigInt(0));
  const hoursTotal = Number(hoursRows[0]?.hours_total ?? 0);
  const outstandingRaw = outstandingRows[0]?.total ?? 0;
  const outstandingMinorUnits =
    typeof outstandingRaw === "bigint" ? Number(outstandingRaw) : Number(outstandingRaw);

  let avgProjectedMonths: Prisma.Decimal | null = null;
  if (activeBanks.length > 0) {
    const burnMap = await getBankBurn(activeBanks.map((b) => b.id));
    const projections: number[] = [];
    for (const burn of burnMap.values()) {
      if (burn.projectedMonthsRemaining !== null) projections.push(burn.projectedMonthsRemaining);
    }
    if (projections.length > 0) {
      const avg = projections.reduce((a, b) => a + b, 0) / projections.length;
      avgProjectedMonths = new Prisma.Decimal(avg.toFixed(2));
    }
  }

  return {
    clientId,
    periodStart,
    periodEnd,
    openJobs,
    delayedJobs,
    hoursConsumed: new Prisma.Decimal(hoursTotal.toFixed(2)),
    outstandingMinorUnits,
    avgProjectedMonths,
  };
}

/**
 * ISO-week bounds [Monday 00:00, next Monday 00:00) in the given timezone.
 * Returns absolute UTC Dates. Falls back to Asia/Jerusalem if no timezone is
 * supplied. Handles month / year rollover via UTC arithmetic on the date parts.
 */
export function isoWeekRange(
  now: Date = new Date(),
  timezone: string = DEFAULT_TZ
): { periodStart: Date; periodEnd: Date } {
  const zoned = toZonedTime(now, timezone);
  // JS getDay(): 0 = Sunday. Shift so Monday = 0.
  const dayOfWeek = (zoned.getDay() + 6) % 7;
  const mondayUtc = new Date(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate() - dayOfWeek)
  );
  const y = mondayUtc.getUTCFullYear();
  const m = mondayUtc.getUTCMonth() + 1;
  const d = mondayUtc.getUTCDate();
  const periodStart = fromZonedTime(
    `${pad4(y)}-${pad2(m)}-${pad2(d)}T00:00:00`,
    timezone
  );
  const periodEnd = new Date(periodStart.getTime() + 7 * 86_400_000);
  return { periodStart, periodEnd };
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function pad4(n: number): string { return String(n).padStart(4, "0"); }
