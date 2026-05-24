// Statistics queries.
//
// Per docs/audit-2026-05/backend_audit.md §6.1 and database_audit.md §7, the
// per-row functions used to fan out into 2-3 Prisma queries per user / dept /
// client (classic N+1). Phase 2 §4.8 collapses each into a single GROUP BY
// per metric and merges in JS, so getEmployeeStats / getDepartmentStats /
// getClientStats are now O(constant) queries regardless of fleet size.
//
// API field names (`activeCount`, `completedCount`, `delayedCount`,
// `hoursReported`, `avgCompletionHours`, `medianCompletionHours`,
// `p90CompletionHours`, `completionSampleSize`, `totalHoursReported`,
// `reopenedEventsCount`) are preserved for /statistics and /api/statistics.
//
// Phase 2 §4.5 adds `getSelfStats(userId, rangeDays)` for the employee-scoped
// `/statistics/me` view. It reuses the raw-SQL median / p90 pattern from
// `getOverviewKpis` with `assigned_employee_id = $userId` added inside the
// `Prisma.sql` so the query plan stays on the indexed path.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = [
  "new",
  "assigned",
  "available",
  "taken",
  "working_on_it",
  "waiting_for_client",
  "waiting_for_admin",
] as const;

const CLOSED_STATUSES = ["done", "reviewed", "cancelled"] as const;

const ACTIVE_STATUSES_SQL = Prisma.sql`('new','assigned','available','taken','working_on_it','waiting_for_client','waiting_for_admin')`;

/** Build a `gte` date filter. `days=30` → last 30 days. `undefined` → all time. */
export function sinceDate(days?: number): Date | undefined {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function round1(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}

function minutesToHours1(min: number | null | undefined): number {
  return Math.round(((min ?? 0) / 60) * 10) / 10;
}

// ─── Overview KPIs ──────────────────────────────────────────────────────────

export async function getOverviewKpis(rangeDays?: number) {
  const since = sinceDate(rangeDays);
  const dateFilter = since ? { gte: since } : undefined;

  // Deterministic completion-time aggregation over the full closed-job set.
  // PERCENTILE_CONT is exact median / p90 over all rows in window.
  const completionWindowSql = since
    ? Prisma.sql`AND completed_timestamp >= ${since}`
    : Prisma.empty;

  const [
    activeJobs,
    completedCount,
    reviewedCount,
    cancelledCount,
    reopenedEventsCount,
    totalHoursAgg,
    completionStats,
    delayedAgg,
  ] = await Promise.all([
    prisma.job.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),

    prisma.job.count({
      where: {
        status: { in: ["done", "reviewed"] },
        ...(dateFilter ? { completedTimestamp: dateFilter } : {}),
      },
    }),

    prisma.job.count({
      where: {
        status: "reviewed",
        ...(dateFilter ? { reviewedTimestamp: dateFilter } : {}),
      },
    }),

    prisma.job.count({
      where: {
        status: "cancelled",
        ...(dateFilter ? { cancelledTimestamp: dateFilter } : {}),
      },
    }),

    // Raw event count: one reopen transition = one tick. Not a rate.
    prisma.jobStatusEvent.count({
      where: {
        reopened: true,
        ...(dateFilter ? { changedAt: dateFilter } : {}),
      },
    }),

    prisma.job.aggregate({
      _sum: { timeSpentMinutes: true },
      where: {
        status: { in: [...CLOSED_STATUSES] },
        ...(dateFilter ? { completedTimestamp: dateFilter } : {}),
      },
    }),

    prisma.$queryRaw<
      Array<{ n: bigint; avg_h: number | null; median_h: number | null; p90_h: number | null }>
    >`
      SELECT
        COUNT(*)::bigint                                                                                            AS n,
        AVG(EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8                        AS avg_h,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8 AS median_h,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8 AS p90_h
      FROM jobs
      WHERE status IN ('done', 'reviewed')
        AND assigned_timestamp  IS NOT NULL
        AND completed_timestamp IS NOT NULL
        ${completionWindowSql}
    `,

    // Delayed: count active jobs whose elapsed minutes exceed slaTargetMinutes.
    // Computed entirely in SQL so the row payload is one bigint.
    prisma.$queryRaw<Array<{ delayed_count: bigint }>>`
      SELECT COUNT(*)::bigint AS delayed_count
      FROM jobs
      WHERE status IN ${ACTIVE_STATUSES_SQL}
        AND assigned_timestamp IS NOT NULL
        AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
    `,
  ]);

  const totalHoursReported = minutesToHours1(totalHoursAgg._sum.timeSpentMinutes);

  const cs = completionStats[0];
  const completionSampleSize = cs ? Number(cs.n) : 0;
  const avgCompletionHours = round1(cs?.avg_h);
  const medianCompletionHours = round1(cs?.median_h);
  const p90CompletionHours = round1(cs?.p90_h);

  const delayedCount = Number(delayedAgg[0]?.delayed_count ?? BigInt(0));

  return {
    activeJobs,
    completedCount,
    reviewedCount,
    cancelledCount,
    // Raw event count over window. Renamed from `reopenedCount` to avoid
    // implying a rate. Consumers that want a rate should compute
    // reopenedEventsCount / completedCount themselves.
    reopenedEventsCount,
    delayedCount,
    totalHoursReported,
    avgCompletionHours,
    medianCompletionHours,
    p90CompletionHours,
    completionSampleSize,
  };
}

// ─── Per-employee breakdown ──────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  displayName: string;
  department: string;
  departmentKey: string;
  activeCount: number;
  completedCount: number;
  hoursReported: number;
}

export async function getEmployeeStats(rangeDays?: number): Promise<EmployeeRow[]> {
  const since = sinceDate(rangeDays);

  const [employees, activeGroups, completedGroups, hoursGroups] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        department: { select: { nameEn: true, key: true } },
      },
      orderBy: { displayName: "asc" },
    }),

    prisma.job.groupBy({
      by: ["assignedEmployeeId"],
      where: {
        assignedEmployeeId: { not: null },
        status: { in: [...ACTIVE_STATUSES] },
      },
      _count: { _all: true },
    }),

    prisma.job.groupBy({
      by: ["assignedEmployeeId"],
      where: {
        assignedEmployeeId: { not: null },
        status: { in: ["done", "reviewed"] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
      _count: { _all: true },
    }),

    prisma.job.groupBy({
      by: ["assignedEmployeeId"],
      where: {
        assignedEmployeeId: { not: null },
        status: { in: [...CLOSED_STATUSES] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
      _sum: { timeSpentMinutes: true },
    }),
  ]);

  const activeMap = new Map<string, number>();
  for (const g of activeGroups) {
    if (g.assignedEmployeeId) activeMap.set(g.assignedEmployeeId, g._count._all);
  }
  const completedMap = new Map<string, number>();
  for (const g of completedGroups) {
    if (g.assignedEmployeeId) completedMap.set(g.assignedEmployeeId, g._count._all);
  }
  const hoursMap = new Map<string, number>();
  for (const g of hoursGroups) {
    if (g.assignedEmployeeId) {
      hoursMap.set(g.assignedEmployeeId, g._sum.timeSpentMinutes ?? 0);
    }
  }

  return employees.map((emp) => ({
    id: emp.id,
    displayName: emp.displayName,
    department: emp.department.nameEn,
    departmentKey: emp.department.key,
    activeCount: activeMap.get(emp.id) ?? 0,
    completedCount: completedMap.get(emp.id) ?? 0,
    hoursReported: minutesToHours1(hoursMap.get(emp.id)),
  }));
}

// ─── Per-department breakdown ────────────────────────────────────────────────

interface DepartmentRow {
  key: string;
  nameEn: string;
  activeCount: number;
  completedCount: number;
  delayedCount: number;
}

export async function getDepartmentStats(
  rangeDays?: number
): Promise<DepartmentRow[]> {
  const since = sinceDate(rangeDays);

  const [departments, activeGroups, completedGroups, delayedGroups] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, key: true, nameEn: true },
      orderBy: { key: "asc" },
    }),

    prisma.job.groupBy({
      by: ["departmentId"],
      where: { status: { in: [...ACTIVE_STATUSES] } },
      _count: { _all: true },
    }),

    prisma.job.groupBy({
      by: ["departmentId"],
      where: {
        status: { in: ["done", "reviewed"] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
      _count: { _all: true },
    }),

    prisma.$queryRaw<Array<{ department_id: string; delayed_count: bigint }>>`
      SELECT department_id, COUNT(*)::bigint AS delayed_count
      FROM jobs
      WHERE status IN ${ACTIVE_STATUSES_SQL}
        AND assigned_timestamp IS NOT NULL
        AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
      GROUP BY department_id
    `,
  ]);

  const activeMap = new Map<string, number>();
  for (const g of activeGroups) activeMap.set(g.departmentId, g._count._all);
  const completedMap = new Map<string, number>();
  for (const g of completedGroups) completedMap.set(g.departmentId, g._count._all);
  const delayedMap = new Map<string, number>();
  for (const r of delayedGroups) {
    delayedMap.set(r.department_id, Number(r.delayed_count));
  }

  return departments.map((dept) => ({
    key: dept.key,
    nameEn: dept.nameEn,
    activeCount: activeMap.get(dept.id) ?? 0,
    completedCount: completedMap.get(dept.id) ?? 0,
    delayedCount: delayedMap.get(dept.id) ?? 0,
  }));
}

// ─── Per-client workload ─────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  companyName: string;
  totalJobs: number;
  activeCount: number;
  completedCount: number;
}

/**
 * NOTE: per docs/audit-2026-05/analytics_audit.md §5 the prior implementation
 * capped at 100 clients ordered alphabetically. We keep the same explicit cap
 * but order by window activity (most-completed first, then most-active) so the
 * cap surfaces the busiest clients rather than the first 100 by name. The
 * `take` is intentionally documented at the API surface; proper pagination is
 * P1 follow-up.
 */
const CLIENT_LIST_CAP = 100;

export async function getClientStats(rangeDays?: number): Promise<ClientRow[]> {
  const since = sinceDate(rangeDays);

  const [activeGroups, completedGroups, totalGroups] = await Promise.all([
    prisma.job.groupBy({
      by: ["clientId"],
      where: { clientId: { not: null }, status: { in: [...ACTIVE_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["clientId"],
      where: {
        clientId: { not: null },
        status: { in: ["done", "reviewed"] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["clientId"],
      where: { clientId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const activeMap = new Map<string, number>();
  for (const g of activeGroups) {
    if (g.clientId) activeMap.set(g.clientId, g._count._all);
  }
  const completedMap = new Map<string, number>();
  for (const g of completedGroups) {
    if (g.clientId) completedMap.set(g.clientId, g._count._all);
  }
  const totalMap = new Map<string, number>();
  for (const g of totalGroups) {
    if (g.clientId) totalMap.set(g.clientId, g._count._all);
  }

  // Candidate client ids: union of active + completed in window. Avoids
  // listing all clients ever when most are inactive in this window.
  const candidateIds = new Set<string>();
  for (const id of activeMap.keys()) candidateIds.add(id);
  for (const id of completedMap.keys()) candidateIds.add(id);

  if (candidateIds.size === 0) return [];

  const clients = await prisma.client.findMany({
    where: { id: { in: [...candidateIds] }, status: "active" },
    select: { id: true, companyName: true },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    totalJobs: totalMap.get(c.id) ?? 0,
    activeCount: activeMap.get(c.id) ?? 0,
    completedCount: completedMap.get(c.id) ?? 0,
  }));

  rows.sort((a, b) => {
    const c = b.completedCount - a.completedCount;
    if (c !== 0) return c;
    const ac = b.activeCount - a.activeCount;
    if (ac !== 0) return ac;
    return a.companyName.localeCompare(b.companyName);
  });

  return rows.slice(0, CLIENT_LIST_CAP);
}

// ─── Per-caller self-view (Phase 2 §4.5) ─────────────────────────────────────

export interface SelfStatsJob {
  id: string;
  publicNumber: string;
  title: string;
  priority: string;
  severity: string;
  status: string;
  slaTargetMinutes: number;
  assignedTimestamp: Date | null;
  client: { companyName: string } | null;
}

export interface SelfStats {
  activeCount: number;
  completedInWindow: number;
  reopenEventsInWindow: number;
  hoursReportedInWindow: number;
  avgCompletionHours: number | null;
  medianCompletionHours: number | null;
  p90CompletionHours: number | null;
  completionSampleSize: number;
  currentlyWorking: SelfStatsJob[];
  delayedMine: SelfStatsJob[];
}

export async function getSelfStats(
  userId: string,
  rangeDays?: number
): Promise<SelfStats> {
  const since = sinceDate(rangeDays);
  const completionWindowSql = since
    ? Prisma.sql`AND completed_timestamp >= ${since}`
    : Prisma.empty;

  const [
    activeCount,
    completedInWindow,
    reopenEventsInWindow,
    hoursAgg,
    completionStats,
    currentlyWorking,
    delayedRaw,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        assignedEmployeeId: userId,
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),

    prisma.job.count({
      where: {
        assignedEmployeeId: userId,
        status: { in: ["done", "reviewed"] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
    }),

    prisma.jobStatusEvent.count({
      where: {
        reopened: true,
        job: { assignedEmployeeId: userId },
        ...(since ? { changedAt: { gte: since } } : {}),
      },
    }),

    prisma.job.aggregate({
      _sum: { timeSpentMinutes: true },
      where: {
        assignedEmployeeId: userId,
        status: { in: [...CLOSED_STATUSES] },
        ...(since ? { completedTimestamp: { gte: since } } : {}),
      },
    }),

    prisma.$queryRaw<
      Array<{ n: bigint; avg_h: number | null; median_h: number | null; p90_h: number | null }>
    >`
      SELECT
        COUNT(*)::bigint                                                                                            AS n,
        AVG(EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8                        AS avg_h,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8 AS median_h,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_timestamp - assigned_timestamp)) / 3600.0)::float8 AS p90_h
      FROM jobs
      WHERE status IN ('done', 'reviewed')
        AND assigned_employee_id = ${userId}::uuid
        AND assigned_timestamp  IS NOT NULL
        AND completed_timestamp IS NOT NULL
        ${completionWindowSql}
    `,

    prisma.job.findMany({
      where: {
        assignedEmployeeId: userId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        priority: true,
        severity: true,
        status: true,
        slaTargetMinutes: true,
        assignedTimestamp: true,
        client: { select: { companyName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),

    prisma.$queryRaw<
      Array<{
        id: string;
        public_number: string;
        title: string;
        priority: string;
        severity: string;
        status: string;
        sla_target_minutes: number;
        assigned_timestamp: Date | null;
        client_id: string | null;
      }>
    >`
      SELECT
        id, public_number, title, priority::text AS priority, severity::text AS severity,
        status::text AS status, sla_target_minutes, assigned_timestamp, client_id
      FROM jobs
      WHERE assigned_employee_id = ${userId}::uuid
        AND status IN ${ACTIVE_STATUSES_SQL}
        AND assigned_timestamp IS NOT NULL
        AND (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) < NOW()
      ORDER BY (assigned_timestamp + (sla_target_minutes || ' minutes')::interval) ASC
      LIMIT 10
    `,
  ]);

  // Hydrate client company names for the delayed rows in a single follow-up
  // query to keep this O(constant).
  const clientIds = [
    ...new Set(delayedRaw.map((r) => r.client_id).filter((v): v is string => !!v)),
  ];
  const clientMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, companyName: true },
    });
    for (const c of clients) clientMap.set(c.id, c.companyName);
  }

  const delayedMine: SelfStatsJob[] = delayedRaw.map((r) => ({
    id: r.id,
    publicNumber: r.public_number,
    title: r.title,
    priority: r.priority,
    severity: r.severity,
    status: r.status,
    slaTargetMinutes: r.sla_target_minutes,
    assignedTimestamp: r.assigned_timestamp,
    client: r.client_id ? { companyName: clientMap.get(r.client_id) ?? "" } : null,
  }));

  const cs = completionStats[0];
  const completionSampleSize = cs ? Number(cs.n) : 0;

  return {
    activeCount,
    completedInWindow,
    reopenEventsInWindow,
    hoursReportedInWindow: minutesToHours1(hoursAgg._sum.timeSpentMinutes),
    avgCompletionHours: round1(cs?.avg_h),
    medianCompletionHours: round1(cs?.median_h),
    p90CompletionHours: round1(cs?.p90_h),
    completionSampleSize,
    currentlyWorking: currentlyWorking.map((j) => ({
      id: j.id,
      publicNumber: j.publicNumber,
      title: j.title,
      priority: j.priority,
      severity: j.severity,
      status: j.status,
      slaTargetMinutes: j.slaTargetMinutes,
      assignedTimestamp: j.assignedTimestamp,
      client: j.client,
    })),
    delayedMine,
  };
}
