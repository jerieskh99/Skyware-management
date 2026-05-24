import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { listForUser, unreadCount } from "@/lib/notifications/queries";

/** GET — list the caller's notifications and their unread count. */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get("limit");
  const beforeRaw = searchParams.get("before");

  const limit = limitRaw
    ? Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), 50)
    : 10;

  let before: Date | undefined;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (Number.isNaN(d.getTime())) {
      return badRequest([{ message: "before: invalid ISO date" }]);
    }
    before = d;
  }

  const opts: { limit: number; before?: Date } = { limit };
  if (before) opts.before = before;
  const [items, unread] = await Promise.all([
    listForUser(user.id, opts),
    unreadCount(user.id),
  ]);
  return NextResponse.json({ items, unread });
}

const patchSchema = z.object({
  action: z.literal("mark_all_seen"),
});

/** PATCH — bulk action; only `mark_all_seen` for now. */
export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const res = await tx.notification.updateMany({
      where: { userId: user.id, seenAt: null },
      data: { seenAt: now },
    });
    if (res.count > 0) {
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "notification.mark_all_seen",
        entityType: "Notification",
        entityId: user.id,
        diff: { count: { old: null, new: res.count } },
      });
    }
    return res.count;
  });

  return NextResponse.json({ updated });
}
