import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { canTakeInHub } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ scope: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { scope } = await params;
  if (!canTakeInHub(user, scope)) return forbidden();

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const jobId = typeof body["jobId"] === "string" ? body["jobId"] : null;
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const now = new Date();

  // Conditional update — only succeeds if status is still 'available'.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.updateMany({
      where: { id: jobId, status: "available", department: { key: scope as "global" | "helpdesk" | "it" | "rnd" } },
      data: {
        status: "taken",
        assignedEmployeeId: user.id,
        assignedTimestamp: now,
        takenTimestamp: now,
      },
    });

    if (updated.count === 0) return null;

    await tx.jobStatusEvent.create({
      data: {
        jobId,
        fromStatus: "available",
        toStatus: "taken",
        changedByUserId: user.id,
        note: "Taken from hub",
      },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "job.taken_from_hub",
      entityType: "Job",
      entityId: jobId,
      diff: { status: { old: "available", new: "taken" }, scope: { old: null, new: scope } },
    });

    return tx.job.findUnique({ where: { id: jobId } });
  });

  if (!result) {
    return NextResponse.json({ error: "Job is no longer available" }, { status: 409 });
  }

  return NextResponse.json(result);
}
