import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBillingKpis, computeBurnFor, type BankBurn } from "@/lib/billing/queries";

const ACTIVE_STATUSES = [
  "new",
  "assigned",
  "available",
  "taken",
  "working_on_it",
  "waiting_for_client",
  "waiting_for_admin",
] as const;

const ACTIVE_STATUSES_SQL = Prisma.sql`('new','assigned','available','taken','working_on_it','waiting_for_client','waiting_for_admin')`;


function isDelayed(
  assignedTimestamp: Date | null,
  slaTargetMinutes: number
): boolean {
  if (!assignedTimestamp) return false;
  const elapsedMin = (Date.now() - assignedTimestamp.getTime()) / 60_000;
  return elapsedMin > slaTargetMinutes;
}

function startOfISOWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diffDays = day === 0 ? -6 : 1 - day; // Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffDays);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ---- Admin KPIs ----

export async function getAdminKpis() {
  const [activeCount, delayedRows, reviewsCount, billingKpis] =
    await Promise.all([
      prisma.job.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
      // Count SLA breaches directly in SQL instead of loading every active job
      // into Node to filter in JS. Uses the same breach predicate the dashboard
      // delayed list already relies on (getAdminDashboardLists below), so the
      // KPI number and the list stay in agreement.
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM jobs
        WHERE status IN ${ACTIVE_STATUSES_SQL}
          AND assigned_timestamp IS NOT NULL
          AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
      `,
      prisma.job.count({ where: { status: "done" } }),
      getBillingKpis(),
    ]);

  const delayedCount = Number(delayedRows[0]?.count ?? 0);

  return {
    activeCount,
    delayedCount,
    reviewsCount,
    unpaidCount: billingKpis.unpaidCount,
    overdueCount: billingKpis.overdueCount,
  };
}

// Recent admin items for dashboard lists.
//
// `delayed` previously fetched the top-50 active jobs by priority then filtered
// to SLA breaches in JS. That hid breaches at low-priority jobs whenever the
// top-50-by-priority window did not happen to contain them
// (docs/audit-2026-05/analytics_audit.md §6, §10). The query now selects the
// active-with-breach set directly in SQL, ranks by breach severity (oldest
// breach first), and only takes the top 5. Priority is still kept in the
// payload for display, but is no longer the gate.
export async function getAdminDashboardLists() {
  const [reviewsPending, waitingForAdmin, delayedIds] = await Promise.all([
    prisma.job.findMany({
      where: { status: "done" },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        priority: true,
        severity: true,
        completedTimestamp: true,
        client: { select: { companyName: true } },
        assignedEmployee: { select: { displayName: true } },
      },
      orderBy: { completedTimestamp: "desc" },
      take: 5,
    }),
    prisma.job.findMany({
      where: { status: "waiting_for_admin" },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        priority: true,
        severity: true,
        updatedAt: true,
        client: { select: { companyName: true } },
        assignedEmployee: { select: { displayName: true } },
      },
      orderBy: { priority: "desc" },
      take: 5,
    }),
    // Pull ONLY the breached set, ordered by how far past SLA they are.
    // Lower-priority jobs are no longer silently dropped.
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM jobs
      WHERE status IN ${ACTIVE_STATUSES_SQL}
        AND assigned_timestamp IS NOT NULL
        AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
      ORDER BY (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) ASC
      LIMIT 5
    `,
  ]);

  const ids = delayedIds.map((r) => r.id);
  const delayedRows = ids.length
    ? await prisma.job.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          publicNumber: true,
          title: true,
          priority: true,
          severity: true,
          slaTargetMinutes: true,
          assignedTimestamp: true,
          client: { select: { companyName: true } },
          assignedEmployee: { select: { displayName: true } },
        },
      })
    : [];

  // Preserve the SQL-side ordering (oldest breach first).
  const byId = new Map(delayedRows.map((r) => [r.id, r]));
  const delayed = ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof delayedRows)[number] => !!r);

  return { reviewsPending, waitingForAdmin, delayed };
}

// ---- Employee KPIs ----

export async function getEmployeeKpis(userId: string) {
  const [activeJobs, weekReports] = await Promise.all([
    prisma.job.findMany({
      where: {
        assignedEmployeeId: userId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: { id: true, assignedTimestamp: true, slaTargetMinutes: true },
    }),
    prisma.workReport.findMany({
      where: {
        submittedById: userId,
        submittedAt: { gte: startOfISOWeek() },
      },
      select: { totalTimeMinutes: true },
    }),
  ]);

  const activeCount = activeJobs.length;
  const delayedCount = activeJobs.filter((j) =>
    isDelayed(j.assignedTimestamp, j.slaTargetMinutes)
  ).length;
  const hoursThisWeek =
    Math.round(
      (weekReports.reduce((sum, r) => sum + r.totalTimeMinutes, 0) / 60) * 10
    ) / 10;

  return { activeCount, delayedCount, hoursThisWeek };
}

export async function getEmployeeDashboardLists(userId: string) {
  const [working, assigned] = await Promise.all([
    prisma.job.findMany({
      where: { assignedEmployeeId: userId, status: "working_on_it" },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        priority: true,
        severity: true,
        slaTargetMinutes: true,
        assignedTimestamp: true,
        client: { select: { companyName: true } },
      },
      orderBy: { priority: "desc" },
    }),
    prisma.job.findMany({
      where: {
        assignedEmployeeId: userId,
        status: { in: ["assigned", "taken"] },
      },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        priority: true,
        severity: true,
        client: { select: { companyName: true } },
      },
      orderBy: { priority: "desc" },
      take: 5,
    }),
  ]);

  return { working, assigned };
}

// ---- Hourly banks low ----

export interface HourlyBankLowRow {
  bankId: string;
  clientId: string;
  clientName: string;
  remainingMinutes: number;
  avgMonthlyMinutes: number;
  projectedMonthsRemaining: number | null;
}

/**
 * Top-5 hourly banks most at risk of running out. "Concerning" = projected
 * months remaining under two, or projection unavailable while burn is already
 * past the bank's purchased balance.
 *
 * Computed in two queries: one for active banks + client metadata, one for
 * usages joined by bank id. Burn math is the pure helper used elsewhere.
 */
export async function getHourlyBanksLow(opts: { take?: number; thresholdMonths?: number } = {}): Promise<HourlyBankLowRow[]> {
  const take = opts.take ?? 5;
  const threshold = opts.thresholdMonths ?? 2;

  const banks = await prisma.hourlyBank.findMany({
    where: { status: "active" },
    select: {
      id: true,
      totalHoursPurchasedMinutes: true,
      billingAccount: {
        select: {
          client: { select: { id: true, companyName: true } },
        },
      },
    },
  });

  if (banks.length === 0) return [];

  const bankIds = banks.map((b) => b.id);
  const usages = await prisma.hourlyBankUsage.findMany({
    where: { hourlyBankId: { in: bankIds } },
    select: { hourlyBankId: true, minutesUsed: true, usedAt: true },
  });

  const byBank = new Map<string, Array<{ minutesUsed: number; usedAt: Date }>>();
  for (const u of usages) {
    const arr = byBank.get(u.hourlyBankId);
    if (arr) arr.push({ minutesUsed: u.minutesUsed, usedAt: u.usedAt });
    else byBank.set(u.hourlyBankId, [{ minutesUsed: u.minutesUsed, usedAt: u.usedAt }]);
  }

  const rows: Array<HourlyBankLowRow & { _sortKey: number }> = [];
  for (const bank of banks) {
    const burn: BankBurn = computeBurnFor(
      { totalHoursPurchasedMinutes: bank.totalHoursPurchasedMinutes },
      byBank.get(bank.id) ?? [],
    );
    // Filter: keep banks below the threshold, or where projection is null and
    // the bank is already depleted (rare but worth surfacing).
    const concerning =
      (burn.projectedMonthsRemaining !== null && burn.projectedMonthsRemaining < threshold) ||
      (burn.projectedMonthsRemaining === null && burn.remainingMinutes === 0 && burn.minutesUsedTotal > 0);
    if (!concerning) continue;
    rows.push({
      bankId: bank.id,
      clientId: bank.billingAccount.client.id,
      clientName: bank.billingAccount.client.companyName,
      remainingMinutes: burn.remainingMinutes,
      avgMonthlyMinutes: burn.avgMonthlyMinutes,
      projectedMonthsRemaining: burn.projectedMonthsRemaining,
      _sortKey: burn.projectedMonthsRemaining ?? -1,
    });
  }

  rows.sort((a, b) => a._sortKey - b._sortKey);
  return rows.slice(0, take).map((r) => ({
    bankId: r.bankId,
    clientId: r.clientId,
    clientName: r.clientName,
    remainingMinutes: r.remainingMinutes,
    avgMonthlyMinutes: r.avgMonthlyMinutes,
    projectedMonthsRemaining: r.projectedMonthsRemaining,
  }));
}
