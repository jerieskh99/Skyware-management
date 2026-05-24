import { prisma } from "@/lib/prisma";
import type { Notification, Prisma } from "@prisma/client";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface ListOptions {
  limit?: number;
  before?: Date;
}

/** Newest-first slice of a user's notifications. */
export async function listForUser(
  userId: string,
  opts: ListOptions = {}
): Promise<Notification[]> {
  const take = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const where: Prisma.NotificationWhereInput = { userId };
  if (opts.before) where.createdAt = { lt: opts.before };
  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Number of unseen rows for the user. */
export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, seenAt: null },
  });
}

/**
 * Mark a specific set of rows as seen — only rows owned by the caller. Returns
 * the number of rows updated. The userId filter is defense-in-depth: the API
 * layer already gates by owner, but the query also enforces it so a misuse
 * elsewhere in the codebase cannot leak across users.
 */
export async function markSeen(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const now = new Date();
  const res = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, seenAt: null },
    data: { seenAt: now },
  });
  return res.count;
}

/** Mark every unseen row for this user as seen. */
export async function markAllSeen(userId: string): Promise<number> {
  const now = new Date();
  const res = await prisma.notification.updateMany({
    where: { userId, seenAt: null },
    data: { seenAt: now },
  });
  return res.count;
}
