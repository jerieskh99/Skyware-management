import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getChannelOrNull } from "@/lib/communication/queries";

interface Params { params: Promise<{ key: string; id: string }> }

const schema = z.object({
  body: z.string().min(1).max(5000).trim(),
});

/** POST — add a reply to a post. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { key, id: postId } = await params;
  const channel = await getChannelOrNull(user, key);
  if (!channel) return notFound("Channel");

  const post = await prisma.communicationPost.findFirst({
    where: { id: postId, channelId: channel.id },
    select: { id: true },
  });
  if (!post) return notFound("Post");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const reply = await prisma.$transaction(async (tx) => {
    const r = await tx.communicationReply.create({
      data: {
        postId,
        authorId: user.id,
        body: parsed.data.body,
      },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      action: "communication_reply.created",
      entityType: "CommunicationReply",
      entityId: r.id,
    });
    return r;
  });

  return NextResponse.json(reply, { status: 201 });
}
