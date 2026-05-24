import { prisma } from "@/lib/prisma";
import { canReadJob } from "@/lib/permissions";
import type { SessionUser } from "@/lib/permissions";
import type { JobStatus, JobPriority, JobSeverity } from "@prisma/client";

export interface JobFilters {
  status?: JobStatus[];
  priority?: JobPriority[];
  severity?: JobSeverity[];
  departmentKey?: string;
  clientId?: string;
  assignedToMe?: boolean;
  tags?: string[];
  search?: string;
  /** undefined = all statuses; false = active only; true = closed only */
  showClosed?: boolean;
}

const JOB_SELECT = {
  id: true,
  publicNumber: true,
  title: true,
  status: true,
  priority: true,
  severity: true,
  slaTargetMinutes: true,
  assignedTimestamp: true,
  startedTimestamp: true,
  completedTimestamp: true,
  timeSpentMinutes: true,
  isBillable: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, companyName: true } },
  department: { select: { id: true, key: true, nameEn: true } },
  assignedEmployee: {
    select: { id: true, username: true, displayName: true },
  },
  createdBy: { select: { id: true, username: true, displayName: true } },
  tags: { select: { tag: { select: { id: true, key: true, labelEn: true, labelHe: true, colorHex: true } } } },
  _count: { select: { statusEvents: true } },
} as const;

export type JobSummary = Awaited<
  ReturnType<typeof listJobsForUser>
>[number];

export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJobForUser>>>;

/** Permission-filtered job list. Admins see all. Employees see own + dept + global. */
export async function listJobsForUser(
  user: SessionUser,
  filters: JobFilters = {}
): Promise<typeof rows> {
  const where = buildWhere(user, filters);

  const rows = await prisma.job.findMany({
    where,
    select: JOB_SELECT,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows;
}

/** Single job — returns null if the user cannot read it. */
export async function getJobForUser(user: SessionUser, id: string) {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, companyName: true } },
      department: true,
      assignedEmployee: { select: { id: true, username: true, displayName: true } },
      createdBy: { select: { id: true, username: true, displayName: true } },
      tags: {
        include: { tag: true },
      },
      statusEvents: {
        include: {
          changedBy: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { changedAt: "asc" },
      },
      workReport: {
        include: {
          submittedBy: { select: { id: true, username: true, displayName: true } },
          approvedBy: { select: { id: true, username: true, displayName: true } },
        },
      },
      timeSessions: {
        where: { userId: user.id },
        orderBy: { startedAt: "desc" },
        take: 20,
      },
      relatedPosts: {
        select: {
          id: true,
          title: true,
          createdAt: true,
          channel: { select: { key: true } },
          author: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      linkedPayment: {
        select: {
          id: true,
          status: true,
          amountPlaceholder: true,
          currency: true,
          issuedDate: true,
          dueDate: true,
        },
      },
      _count: { select: { statusEvents: true } },
    },
  });

  if (!job) return null;

  if (
    !canReadJob(user, {
      departmentKey: job.department.key,
      assignedEmployeeId: job.assignedEmployeeId,
    })
  ) {
    return null;
  }

  return job;
}

function buildWhere(user: SessionUser, filters: JobFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];

  // Permission scope
  if (!user.isAdmin) {
    conditions.push({
      OR: [
        { assignedEmployeeId: user.id },
        { department: { key: user.departmentKey } },
        { department: { key: "global" } },
      ],
    });
  }

  const ACTIVE: JobStatus[] = [
    "new", "assigned", "available", "taken",
    "working_on_it", "waiting_for_client", "waiting_for_admin",
  ];
  const CLOSED: JobStatus[] = ["done", "reviewed", "cancelled"];

  if (filters.status?.length) {
    conditions.push({ status: { in: filters.status } });
  } else if (filters.showClosed === false) {
    conditions.push({ status: { in: ACTIVE } });
  } else if (filters.showClosed === true) {
    conditions.push({ status: { in: CLOSED } });
  }
  // showClosed undefined → no status filter (API default: return all)
  if (filters.priority?.length) conditions.push({ priority: { in: filters.priority } });
  if (filters.severity?.length) conditions.push({ severity: { in: filters.severity } });
  if (filters.departmentKey) conditions.push({ department: { key: filters.departmentKey } });
  if (filters.clientId) conditions.push({ clientId: filters.clientId });
  if (filters.assignedToMe) conditions.push({ assignedEmployeeId: user.id });
  if (filters.tags?.length) {
    conditions.push({
      tags: { some: { tag: { key: { in: filters.tags } } } },
    });
  }
  if (filters.search) {
    conditions.push({
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
}
