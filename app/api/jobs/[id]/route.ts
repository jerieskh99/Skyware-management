import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getJobForUser } from "@/lib/jobs/queries";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  return NextResponse.json(job);
}

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  severity: z.enum(["minor", "moderate", "major", "critical"]).optional(),
  adminNote: z.string().optional(),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
  isBillable: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;
  if (!isAdmin(user)) return forbidden();

  const { id } = await params;
  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
        ...(parsed.data.severity !== undefined && { severity: parsed.data.severity }),
        ...(parsed.data.adminNote !== undefined && { adminNote: parsed.data.adminNote }),
        ...(parsed.data.assignedEmployeeId !== undefined && {
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          assignedTimestamp: parsed.data.assignedEmployeeId ? new Date() : null,
        }),
        ...(parsed.data.isBillable !== undefined && { isBillable: parsed.data.isBillable }),
      },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "job.updated",
      entityType: "Job",
      entityId: id,
      diff: Object.fromEntries(
        Object.entries(parsed.data).map(([k, v]) => [k, { old: null, new: v }])
      ),
    });

    return u;
  });

  return NextResponse.json(updated);
}
