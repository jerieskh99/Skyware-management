import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { deriveSlaTargetMinutes } from "@/lib/sla";
import { generatePublicNumber } from "@/lib/jobs/numbers";
import { writeAudit } from "@/lib/audit";
import { listJobsForUser } from "@/lib/jobs/queries";
import type { JobPriority, JobSeverity, JobStatus } from "@prisma/client";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.getAll("status") as JobStatus[];
  const priority = searchParams.getAll("priority") as JobPriority[];
  const severity = searchParams.getAll("severity") as JobSeverity[];
  const departmentKey = searchParams.get("departmentKey") ?? undefined;
  const assignedToMe = searchParams.get("assignedToMe") === "1";
  const search = searchParams.get("search") ?? undefined;

  const jobs = await listJobsForUser(user, {
    status: status.length ? status : undefined,
    priority: priority.length ? priority : undefined,
    severity: severity.length ? severity : undefined,
    departmentKey,
    assignedToMe,
    search,
  });

  return NextResponse.json(jobs);
}

const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  departmentKey: z.enum(["global", "helpdesk", "it", "rnd"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  severity: z.enum(["minor", "moderate", "major", "critical"]).default("moderate"),
  assignedEmployeeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  isBillable: z.boolean().default(true),
  tagKeys: z.array(z.string()).default([]),
  sendToHub: z.boolean().default(false),
  source: z.enum(["portal_manual", "email_manual"]).default("portal_manual"),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  if (!isAdmin(user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const data = parsed.data;

  const department = await prisma.department.findUnique({
    where: { key: data.departmentKey },
  });
  if (!department) return badRequest([{ message: "Invalid department" }]);

  const slaTargetMinutes = deriveSlaTargetMinutes(data.priority, data.severity);
  const initialStatus: JobStatus = data.assignedEmployeeId
    ? "assigned"
    : data.sendToHub
    ? "available"
    : "new";

  const tagIds = data.tagKeys.length
    ? await prisma.tag
        .findMany({ where: { key: { in: data.tagKeys } }, select: { id: true } })
        .then((r) => r.map((t) => t.id))
    : [];

  const job = await prisma.$transaction(async (tx) => {
    const publicNumber = await generatePublicNumber(tx);

    const created = await tx.job.create({
      data: {
        publicNumber,
        title: data.title,
        description: data.description ?? null,
        departmentId: department.id,
        createdByUserId: user.id,
        assignedEmployeeId: data.assignedEmployeeId ?? null,
        clientId: data.clientId ?? null,
        status: initialStatus,
        priority: data.priority,
        severity: data.severity,
        slaTargetMinutes,
        isBillable: data.isBillable,
        source: data.source,
        assignedTimestamp: data.assignedEmployeeId ? new Date() : null,
        tags: tagIds.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: created.id,
        fromStatus: null,
        toStatus: initialStatus,
        changedByUserId: user.id,
        note: "Job created",
      },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "job.created",
      entityType: "Job",
      entityId: created.id,
      diff: {
        status: { old: null, new: initialStatus },
        title: { old: null, new: data.title },
      },
    });

    return created;
  });

  return NextResponse.json(job, { status: 201 });
}
