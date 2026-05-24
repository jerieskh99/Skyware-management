import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { canPostInChannel } from "@/lib/permissions";
import type { CommunicationChannelKey } from "@prisma/client";

const VALID_CHANNEL_KEYS = new Set<string>(["global", "helpdesk", "it", "rnd"]);

export function isValidChannelKey(key: string): key is CommunicationChannelKey {
  return VALID_CHANNEL_KEYS.has(key);
}

export const POST_LIST_SELECT = {
  id: true,
  title: true,
  body: true,
  pinned: true,
  resolved: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, username: true, displayName: true } },
  tags: {
    select: { tag: { select: { key: true, labelEn: true, colorHex: true } } },
  },
  relatedJob: { select: { id: true, publicNumber: true, title: true } },
  _count: { select: { replies: true } },
} as const;

export const REPLY_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, username: true, displayName: true } },
} as const;

/** Returns the channel if the user can access it, null otherwise. */
export async function getChannelOrNull(user: SessionUser, channelKey: string) {
  if (!isValidChannelKey(channelKey)) return null;
  const channel = await prisma.communicationChannel.findUnique({
    where: { key: channelKey },
    include: { department: { select: { key: true, nameEn: true } } },
  });
  if (!channel) return null;
  if (!canPostInChannel(user, channel.department?.key ?? null)) return null;
  return channel;
}

/** All channels visible to the user. */
export async function listVisibleChannels(user: SessionUser) {
  const all = await prisma.communicationChannel.findMany({
    include: {
      department: { select: { key: true, nameEn: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { key: "asc" },
  });
  return all.filter((ch) =>
    canPostInChannel(user, ch.department?.key ?? null)
  );
}

/** Recent posts for a channel. */
export async function listChannelPosts(
  channelId: string,
  opts: { search?: string; resolved?: boolean } = {}
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { channelId };
  if (opts.resolved !== undefined) where.resolved = opts.resolved;
  if (opts.search) {
    where.OR = [
      { title: { contains: opts.search, mode: "insensitive" } },
      { body: { contains: opts.search, mode: "insensitive" } },
    ];
  }
  return prisma.communicationPost.findMany({
    where,
    select: POST_LIST_SELECT,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

/** Single post with full replies. */
export async function getPostWithReplies(postId: string, channelId: string) {
  return prisma.communicationPost.findFirst({
    where: { id: postId, channelId },
    select: {
      ...POST_LIST_SELECT,
      replies: {
        select: REPLY_SELECT,
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
