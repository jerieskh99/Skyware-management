import { prisma } from "@/lib/prisma";
import { getBillingKpis } from "@/lib/billing/queries";

const ACTIVE_STATUSES = [
  "new",
  "assigned",
  "available",
  "taken",
  "working_on_it",
  "waiting_for_client",
  "waiting_for_admin",
] as const;


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
  const [activeJobs, reviewsCount, billingKpis] = await Promise.all([
    prisma.job.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, assignedTimestamp: true, slaTargetMinutes: true },
    }),
    prisma.job.count({ where: { status: "done" } }),
    getBillingKpis(),
  ]);

  const activeCount = activeJobs.length;
  const delayedCount = activeJobs.filter((j) =>
    isDelayed(j.assignedTimestamp, j.slaTargetMinutes)
  ).length;

  return {
    activeCount,
    delayedCount,
    reviewsCount,
    unpaidCount: billingKpis.unpaidCount,
    overdueCount: billingKpis.overdueCount,
  };
}

// Recent admin items for dashboard lists
export async function getAdminDashboardLists() {
  const [reviewsPending, waitingForAdmin, recentlyDelayed] = await Promise.all([
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
    // Recent jobs that are past SLA — fetch and filter in JS
    prisma.job.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] }, assignedTimestamp: { not: null } },
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
      orderBy: { priority: "desc" },
      take: 50,
    }),
  ]);

  const delayed = recentlyDelayed
    .filter((j) => isDelayed(j.assignedTimestamp, j.slaTargetMinutes))
    .slice(0, 5);

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
