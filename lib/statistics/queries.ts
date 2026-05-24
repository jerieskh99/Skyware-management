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

/** Build a `gte` date filter. `days=30` → last 30 days. `undefined` → all time. */
function sinceDate(days?: number): Date | undefined {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
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
  ]);

  const totalHoursReported = Math.round(
    ((totalHoursAgg._sum.timeSpentMinutes ?? 0) / 60) * 10
  ) / 10;

  const round1 = (v: number | null | undefined): number | null =>
    v == null ? null : Math.round(v * 10) / 10;

  const cs = completionStats[0];
  const completionSampleSize = cs ? Number(cs.n) : 0;
  const avgCompletionHours = round1(cs?.avg_h);
  const medianCompletionHours = round1(cs?.median_h);
  const p90CompletionHours = round1(cs?.p90_h);

  // Delayed: active jobs where elapsed > slaTargetMinutes
  const activeWithSla = await prisma.job.findMany({
    where: { status: { in: [...ACTIVE_STATUSES] }, assignedTimestamp: { not: null } },
    select: { assignedTimestamp: true, slaTargetMinutes: true },
  });
  const delayedCount = activeWithSla.filter((j) => {
    const elapsed = (Date.now() - j.assignedTimestamp!.getTime()) / 60_000;
    return elapsed > j.slaTargetMinutes;
  }).length;

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

export async function getEmployeeStats(rangeDays?: number) {
  const since = sinceDate(rangeDays);

  const employees = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      displayName: true,
      department: { select: { nameEn: true, key: true } },
    },
    orderBy: { displayName: "asc" },
  });

  const rows = await Promise.all(
    employees.map(async (emp) => {
      const [activeCount, completedCount, hoursAgg] = await Promise.all([
        prisma.job.count({
          where: {
            assignedEmployeeId: emp.id,
            status: { in: [...ACTIVE_STATUSES] },
          },
        }),
        prisma.job.count({
          where: {
            assignedEmployeeId: emp.id,
            status: { in: ["done", "reviewed"] },
            ...(since ? { completedTimestamp: { gte: since } } : {}),
          },
        }),
        prisma.job.aggregate({
          _sum: { timeSpentMinutes: true },
          where: {
            assignedEmployeeId: emp.id,
            status: { in: [...CLOSED_STATUSES] },
            ...(since ? { completedTimestamp: { gte: since } } : {}),
          },
        }),
      ]);

      return {
        id: emp.id,
        displayName: emp.displayName,
        department: emp.department.nameEn,
        departmentKey: emp.department.key,
        activeCount,
        completedCount,
        hoursReported:
          Math.round(((hoursAgg._sum.timeSpentMinutes ?? 0) / 60) * 10) / 10,
      };
    })
  );

  return rows;
}

// ─── Per-department breakdown ────────────────────────────────────────────────

export async function getDepartmentStats(rangeDays?: number) {
  const since = sinceDate(rangeDays);

  const departments = await prisma.department.findMany({
    select: { id: true, key: true, nameEn: true },
    orderBy: { key: "asc" },
  });

  const rows = await Promise.all(
    departments.map(async (dept) => {
      const [activeCount, completedCount, delayedRaw] = await Promise.all([
        prisma.job.count({
          where: {
            departmentId: dept.id,
            status: { in: [...ACTIVE_STATUSES] },
          },
        }),
        prisma.job.count({
          where: {
            departmentId: dept.id,
            status: { in: ["done", "reviewed"] },
            ...(since ? { completedTimestamp: { gte: since } } : {}),
          },
        }),
        prisma.job.findMany({
          where: {
            departmentId: dept.id,
            status: { in: [...ACTIVE_STATUSES] },
            assignedTimestamp: { not: null },
          },
          select: { assignedTimestamp: true, slaTargetMinutes: true },
        }),
      ]);

      const delayedCount = delayedRaw.filter((j) => {
        const elapsed = (Date.now() - j.assignedTimestamp!.getTime()) / 60_000;
        return elapsed > j.slaTargetMinutes;
      }).length;

      return {
        key: dept.key,
        nameEn: dept.nameEn,
        activeCount,
        completedCount,
        delayedCount,
      };
    })
  );

  return rows;
}

// ─── Per-client workload ─────────────────────────────────────────────────────

export async function getClientStats(rangeDays?: number) {
  const since = sinceDate(rangeDays);

  const clients = await prisma.client.findMany({
    where: { status: "active" },
    select: {
      id: true,
      companyName: true,
      _count: { select: { jobs: true } },
    },
    orderBy: { companyName: "asc" },
    take: 100,
  });

  const rows = await Promise.all(
    clients.map(async (c) => {
      const [activeCount, completedCount] = await Promise.all([
        prisma.job.count({
          where: { clientId: c.id, status: { in: [...ACTIVE_STATUSES] } },
        }),
        prisma.job.count({
          where: {
            clientId: c.id,
            status: { in: ["done", "reviewed"] },
            ...(since ? { completedTimestamp: { gte: since } } : {}),
          },
        }),
      ]);

      return {
        id: c.id,
        companyName: c.companyName,
        totalJobs: c._count.jobs,
        activeCount,
        completedCount,
      };
    })
  );

  // Only return clients that have at least one job ever
  return rows.filter((r) => r.totalJobs > 0);
}
