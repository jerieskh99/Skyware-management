import { NextResponse } from "next/server";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { checkRateLimit, getClientIp, tooManyRequests, LIMITS } from "@/lib/rate-limit";

interface Params { params: Promise<{ id: string }> }

const schema = z.object({ newPassword: z.string().min(8).max(200) });

/** POST — admin reset of another user's password. Does not require current password. */
export async function POST(req: Request, { params }: Params) {
  if (checkRateLimit(`pw-reset:${getClientIp(req)}`, LIMITS.passwordReset)) {
    return tooManyRequests();
  }

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return notFound("User");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const newHash = await bcryptjs.hash(parsed.data.newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash: newHash } });
    // Never log the password value — only the event.
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "user.password_reset_by_admin",
      entityType: "User",
      entityId: id,
    });
  });

  return NextResponse.json({ ok: true });
}
