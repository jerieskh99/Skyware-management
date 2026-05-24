import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { FALLBACK_PRIORITY_SLA_MINUTES } from "@/lib/sla";
import type { JobPriority } from "@prisma/client";

interface Params { params: Promise<{ priority: string }> }

const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const bodySchema = z.object({
  // 7200 min = 5 days. Tighter ceiling than a year keeps the field meaningful.
  targetMinutes: z.number().int().positive().max(7200),
});

/** PATCH — set the SLA target minutes for one priority. Admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { priority: rawPriority } = await params;
  const parsedPriority = prioritySchema.safeParse(rawPriority);
  if (!parsedPriority.success) return badRequest(parsedPriority.error.issues);
  const priority: JobPriority = parsedPriority.data;

  const body = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return badRequest(parsedBody.error.issues);
  const { targetMinutes } = parsedBody.data;

  const existing = await prisma.slaDefaults.findUnique({
    where: { priority },
    select: { id: true, targetMinutes: true },
  });
  const oldValue = existing?.targetMinutes ?? FALLBACK_PRIORITY_SLA_MINUTES[priority];

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.slaDefaults.upsert({
      where: { priority },
      update: { targetMinutes, updatedByUserId: auth.user.id },
      create: { priority, targetMinutes, updatedByUserId: auth.user.id },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "sla_defaults.updated",
      entityType: "SlaDefaults",
      entityId: row.id,
      diff: {
        priority: { old: priority, new: priority },
        targetMinutes: { old: oldValue, new: targetMinutes },
      },
    });
    return row;
  });

  return NextResponse.json({
    priority: updated.priority,
    targetMinutes: updated.targetMinutes,
    updatedAt: updated.updatedAt,
  });
}
