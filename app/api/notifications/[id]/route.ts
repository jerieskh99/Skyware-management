import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  seen: z.literal(true),
});

/** PATCH — mark a single notification as seen. 404 if not owned by caller. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  // Owner check is part of the same query so a row belonging to another user
  // returns 404 instead of leaking existence.
  const existing = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { id: true, seenAt: true },
  });
  if (!existing) return notFound("Notification");

  // No-op if already seen — return the row but skip audit so we don't spam.
  if (existing.seenAt) {
    const row = await prisma.notification.findUnique({ where: { id } });
    return NextResponse.json(row);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.notification.update({
      where: { id },
      data: { seenAt: new Date() },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      action: "notification.seen",
      entityType: "Notification",
      entityId: id,
      diff: { seenAt: { old: null, new: row.seenAt } },
    });
    return row;
  });

  return NextResponse.json(updated);
}
