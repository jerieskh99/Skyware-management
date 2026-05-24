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

  const [
    activeJobs,
    completedCount,
    reviewedCount,
    cancelledCount,
    reopenedCount,
    totalHoursAgg,
    avgCompletionRaw,
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

    // Jobs with at least one status event marked as reopened
    prisma.jobStatusEvent.count({
      where: {
        reopened: true,
        ...(dateFilter ? { changedAt: dateFilter } : {}),
      },
    }),

    // Sum of timeSpentMinutes across all jobs (closed + work reports where available)
    prisma.job.aggregate({
      _sum: { timeSpentMinutes: true },
      where: {
        status: { in: [...CLOSED_STATUSES] },
        ...(dateFilter ? { completedTimestamp: dateFilter } : {}),
      },
    }),

    // Average minutes from assigned to completed on closed jobs with both timestamps
    prisma.job.findMany({
      where: {
        status: { in: ["done", "reviewed"] },
        assignedTimestamp: { not: null },
        completedTimestamp: { not: null },
        ...(dateFilter ? { completedTimestamp: dateFilter } : {}),
      },
      select: { assignedTimestamp: true, completedTimestamp: true },
      take: 500,
    }),
  ]);

  const totalHoursReported = Math.round(
    ((totalHoursAgg._sum.timeSpentMinutes ?? 0) / 60) * 10
  ) / 10;

  let avgCompletionHours: number | null = null;
  if (avgCompletionRaw.length > 0) {
    const totalMs = avgCompletionRaw.reduce((sum, j) => {
      return sum + (j.completedTimestamp!.getTime() - j.assignedTimestamp!.getTime());
    }, 0);
    avgCompletionHours =
      Math.round((totalMs / avgCompletionRaw.length / 3_600_000) * 10) / 10;
  }

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
    reopenedCount,
    delayedCount,
    totalHoursReported,
    avgCompletionHours,
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
