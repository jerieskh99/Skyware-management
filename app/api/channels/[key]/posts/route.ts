import { NextResponse } from "next/server";
import { z } from "zod";
import type { DepartmentKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api-utils";
import { canPostInChannel } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  getChannelOrNull,
  listChannelPosts,
} from "@/lib/communication/queries";

interface Params { params: Promise<{ key: string }> }

/** GET — list posts in a channel. Query params: search, resolved (0|1) */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { key } = await params;
  const channel = await getChannelOrNull(auth.user, key);
  if (!channel) return notFound("Channel");

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || undefined;
  const resolvedParam = searchParams.get("resolved");
  const resolved =
    resolvedParam === "1" ? true : resolvedParam === "0" ? false : undefined;

  const posts = await listChannelPosts(channel.id, { search, resolved });
  return NextResponse.json(posts);
}

const createSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(10000).trim(),
  tagKeys: z.array(z.string()).max(8).optional(),
  relatedJobId: z.string().uuid().optional(),
});

/** POST — create a new post in a channel. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { key } = await params;
  const channel = await getChannelOrNull(user, key);
  if (!channel) return notFound("Channel");

  if (!canPostInChannel(user, channel.department?.key ?? null)) {
    return forbidden("You cannot post in this channel.");
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { title, body: postBody, tagKeys, relatedJobId } = parsed.data;

  // Validate that the referenced job exists and the poster can read it.
  if (relatedJobId) {
    const jobWhere = user.isAdmin
      ? { id: relatedJobId }
      : {
          id: relatedJobId,
          OR: [
            { assignedEmployeeId: user.id },
            { department: { key: user.departmentKey as DepartmentKey } },
            { department: { key: "global" as DepartmentKey } },
          ],
        };
    const job = await prisma.job.findFirst({ where: jobWhere, select: { id: true } });
    if (!job) return badRequest([{ message: "relatedJobId: job not found or not accessible." }]);
  }

  const post = await prisma.$transaction(async (tx) => {
    const newPost = await tx.communicationPost.create({
      data: {
        channelId: channel.id,
        authorId: user.id,
        title,
        body: postBody,
        ...(relatedJobId ? { relatedJobId } : {}),
      },
    });

    if (tagKeys?.length) {
      const tags = await tx.tag.findMany({
        where: { key: { in: tagKeys }, scope: { in: ["communication", "both"] } },
        select: { id: true },
      });
      await tx.postTag.createMany({
        data: tags.map((t) => ({ postId: newPost.id, tagId: t.id })),
        skipDuplicates: true,
      });
    }

    await writeAudit(tx, {
      actorUserId: user.id,
      action: "communication_post.created",
      entityType: "CommunicationPost",
      entityId: newPost.id,
    });

    return newPost;
  });

  return NextResponse.json(post, { status: 201 });
}
