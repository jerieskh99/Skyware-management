import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getChannelOrNull, getPostWithReplies } from "@/lib/communication/queries";

interface Params { params: Promise<{ key: string; id: string }> }

/** GET — post detail with replies. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { key, id } = await params;
  const channel = await getChannelOrNull(auth.user, key);
  if (!channel) return notFound("Channel");

  const post = await getPostWithReplies(id, channel.id);
  if (!post) return notFound("Post");

  return NextResponse.json(post);
}

const patchSchema = z.object({
  resolved: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

/** PATCH — toggle resolved (author or admin) or pinned (admin only). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { key, id } = await params;
  const channel = await getChannelOrNull(user, key);
  if (!channel) return notFound("Channel");

  const post = await prisma.communicationPost.findFirst({
    where: { id, channelId: channel.id },
    select: { id: true, authorId: true, resolved: true, pinned: true },
  });
  if (!post) return notFound("Post");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { resolved, pinned } = parsed.data;

  if (pinned !== undefined && !isAdmin(user)) {
    return forbidden("Only admins can pin posts.");
  }
  if (resolved !== undefined && !isAdmin(user) && post.authorId !== user.id) {
    return forbidden("Only the post author or an admin can mark resolved.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.communicationPost.update({
      where: { id },
      data: {
        ...(resolved !== undefined ? { resolved } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      action: "communication_post.updated",
      entityType: "CommunicationPost",
      entityId: id,
      diff: {
        ...(resolved !== undefined
          ? { resolved: { old: post.resolved, new: resolved } }
          : {}),
        ...(pinned !== undefined
          ? { pinned: { old: post.pinned, new: pinned } }
          : {}),
      },
    });
    return u;
  });

  return NextResponse.json(updated);
}
