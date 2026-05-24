import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  displayName: z.string().min(1).max(100).trim(),
});

/** PATCH — update current user's display name. */
export async function PATCH(req: Request) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { displayName: parsed.data.displayName },
      select: { id: true, username: true, displayName: true, email: true },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "user.display_name_changed",
      entityType: "User",
      entityId: user.id,
      diff: { displayName: { old: null, new: parsed.data.displayName } },
    });

    return u;
  });

  return NextResponse.json(updated);
}
