import { NextResponse } from "next/server";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { checkRateLimit, getClientIp, tooManyRequests, LIMITS } from "@/lib/rate-limit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** POST — change current user's password. Requires current password. */
export async function POST(req: Request) {
  if (checkRateLimit(`pw-change:${getClientIp(req)}`, LIMITS.passwordReset)) {
    return tooManyRequests();
  }

  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, passwordHash: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcryptjs.compare(parsed.data.currentPassword, dbUser.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 422 });
  }

  const newHash = await bcryptjs.hash(parsed.data.newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "user.password_changed",
      entityType: "User",
      entityId: user.id,
      // Never write password values — just the event
    });
  });

  return NextResponse.json({ ok: true });
}
