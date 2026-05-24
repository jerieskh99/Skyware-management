import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api-utils";
import { getJobForUser } from "@/lib/jobs/queries";
import { isTransitionAllowed, resolveActorRelation, isReopening } from "@/lib/jobs/lifecycle";
import { writeAudit } from "@/lib/audit";
import type { JobStatus } from "@prisma/client";

interface Params { params: Promise<{ id: string }> }

const transitionSchema = z.object({
  toStatus: z.enum([
    "new", "assigned", "available", "taken", "working_on_it",
    "waiting_for_client", "waiting_for_admin", "done", "reviewed", "cancelled",
  ]),
  note: z.string().max(2000).optional(),
  assignedEmployeeId: z.string().uuid().optional(), // required when toStatus = 'assigned'
});

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { id } = await params;
  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  const body = await req.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { toStatus, note, assignedEmployeeId } = parsed.data;
  const fromStatus = job.status as JobStatus;

  const roleKey = user.roleKey as "employee" | "ceo" | "cto";
  const actorRelation = resolveActorRelation(roleKey, user.id, job.assignedEmployeeId);
  const check = isTransitionAllowed(fromStatus, toStatus as JobStatus, actorRelation);

  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 422 });
  }

  const now = new Date();
  const reopened = isReopening(fromStatus, toStatus as JobStatus);

  // Compute timestamp updates
  const updates: Record<string, Date | null> = {};
  if (toStatus === "assigned" || (toStatus === "taken")) updates["assignedTimestamp"] = now;
  if (toStatus === "taken") updates["takenTimestamp"] = now;
  if (toStatus === "working_on_it" && !job.startedTimestamp) updates["startedTimestamp"] = now;
  if (toStatus === "done") updates["completedTimestamp"] = now;
  if (toStatus === "reviewed") updates["reviewedTimestamp"] = now;
  if (toStatus === "cancelled") updates["cancelledTimestamp"] = now;

  // Set first_response_at on first exit from assigned/taken
  const setsFirstResponse =
    !job.firstResponseAt &&
    (fromStatus === "assigned" || fromStatus === "taken") &&
    toStatus === "working_on_it";

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({
      where: { id },
      data: {
        status: toStatus as JobStatus,
        ...updates,
        ...(setsFirstResponse && { firstResponseAt: now }),
        ...(assignedEmployeeId && toStatus === "assigned" && {
          assignedEmployeeId,
          assignedTimestamp: now,
        }),
        // When taken from hub, set the taker as assignee
        ...(toStatus === "taken" && {
          assignedEmployeeId: user.id,
          assignedTimestamp: now,
          takenTimestamp: now,
        }),
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: id,
        fromStatus,
        toStatus: toStatus as JobStatus,
        changedByUserId: user.id,
        note: note ?? null,
        reopened,
      },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "job.status_changed",
      entityType: "Job",
      entityId: id,
      diff: {
        status: { old: fromStatus, new: toStatus },
        ...(note ? { note: { old: null, new: note } } : {}),
      },
    });

    return u;
  });

  return NextResponse.json(updated);
}
