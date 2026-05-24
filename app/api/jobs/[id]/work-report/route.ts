import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound, badRequest } from "@/lib/api-utils";
import { getJobForUser } from "@/lib/jobs/queries";
import { resolveActorRelation } from "@/lib/jobs/lifecycle";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string }> }

const submitSchema = z.object({
  summary: z.string().min(1).max(10000),
  totalTimeMinutes: z.number().int().min(1),
  billable: z.boolean().default(true),
});

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { id } = await params;
  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  // Must be assignee or admin
  const roleKey = user.roleKey as "employee" | "ceo" | "cto";
  const relation = resolveActorRelation(roleKey, user.id, job.assignedEmployeeId);
  if (relation === "eligible_taker") return forbidden("Only the assignee or admin can submit a work report");

  // Job must be in a submittable state
  if (!["working_on_it", "waiting_for_client", "waiting_for_admin"].includes(job.status)) {
    return NextResponse.json(
      { error: `Cannot submit work report from status '${job.status}'` },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const report = await prisma.$transaction(async (tx) => {
    // Upsert so admins can re-submit
    const r = await tx.workReport.upsert({
      where: { jobId: id },
      update: {
        summary: parsed.data.summary,
        totalTimeMinutes: parsed.data.totalTimeMinutes,
        billable: parsed.data.billable,
        submittedById: user.id,
        submittedAt: new Date(),
      },
      create: {
        jobId: id,
        summary: parsed.data.summary,
        totalTimeMinutes: parsed.data.totalTimeMinutes,
        billable: parsed.data.billable,
        submittedById: user.id,
      },
    });

    // Also update job.timeSpentMinutes and transition to done
    const now = new Date();
    await tx.job.update({
      where: { id },
      data: {
        status: "done",
        timeSpentMinutes: parsed.data.totalTimeMinutes,
        completedTimestamp: now,
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: id,
        fromStatus: job.status,
        toStatus: "done",
        changedByUserId: user.id,
        note: `Work report submitted. ${parsed.data.totalTimeMinutes} min.`,
        timeSpentDeltaMinutes: parsed.data.totalTimeMinutes,
      },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "job.work_report_submitted",
      entityType: "Job",
      entityId: id,
      diff: {
        status: { old: job.status, new: "done" },
        totalTimeMinutes: { old: null, new: parsed.data.totalTimeMinutes },
      },
    });

    return r;
  });

  return NextResponse.json(report, { status: 201 });
}
