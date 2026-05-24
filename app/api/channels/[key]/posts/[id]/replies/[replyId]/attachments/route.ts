import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import { getChannelOrNull } from "@/lib/communication/queries";
import { canReadAttachmentVisibility } from "@/lib/storage/attachments";
import { presignDownload } from "@/lib/storage/s3";
import { withErrorLog } from "@/lib/logger";

interface Params {
  params: Promise<{ key: string; id: string; replyId: string }>;
}

const linkSchema = z.object({
  attachmentId: z.string().uuid(),
});

/** GET — list attachments on this reply. */
export async function GET(_req: Request, { params }: Params) {
  return withErrorLog("replies.attachments.list", async () => {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const enabled = await getFeatureFlag("attachments_enabled");
    if (!enabled) {
      return NextResponse.json(
        { error: "Attachments are disabled." },
        { status: 503 },
      );
    }

    const { key, id, replyId } = await params;
    const channel = await getChannelOrNull(user, key);
    if (!channel) return notFound("Channel");

    const reply = await prisma.communicationReply.findFirst({
      where: { id: replyId, postId: id, post: { channelId: channel.id } },
      select: { id: true },
    });
    if (!reply) return notFound("Reply");

    const rows = await prisma.replyAttachment.findMany({
      where: { replyId },
      include: {
        attachment: {
          select: {
            id: true,
            storageKey: true,
            fileName: true,
            mimeType: true,
            byteSize: true,
            visibility: true,
            createdAt: true,
            uploadedBy: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    const visible = rows.filter((r) =>
      canReadAttachmentVisibility(user, r.attachment.visibility),
    );

    const items = await Promise.all(
      visible.map(async (r) => ({
        id: r.attachment.id,
        fileName: r.attachment.fileName,
        mimeType: r.attachment.mimeType,
        byteSize: r.attachment.byteSize,
        visibility: r.attachment.visibility,
        createdAt: r.attachment.createdAt,
        uploadedBy: r.attachment.uploadedBy,
        url: await presignDownload({ key: r.attachment.storageKey }),
      })),
    );

    return NextResponse.json(items);
  });
}

/** POST — link an existing Attachment row to this reply. */
export async function POST(req: Request, { params }: Params) {
  return withErrorLog("replies.attachments.link", async () => {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const enabled = await getFeatureFlag("attachments_enabled");
    if (!enabled) {
      return NextResponse.json(
        { error: "Attachments are disabled." },
        { status: 503 },
      );
    }

    const { key, id, replyId } = await params;
    const channel = await getChannelOrNull(user, key);
    if (!channel) return notFound("Channel");

    const reply = await prisma.communicationReply.findFirst({
      where: { id: replyId, postId: id, post: { channelId: channel.id } },
      select: { id: true },
    });
    if (!reply) return notFound("Reply");

    const json = await req.json().catch(() => null);
    const parsed = linkSchema.safeParse(json);
    if (!parsed.success) return badRequest(parsed.error.issues);

    const { attachmentId } = parsed.data;
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, uploadedByUserId: true },
    });
    if (!attachment) return notFound("Attachment");

    if (!isAdmin(user) && attachment.uploadedByUserId !== user.id) {
      return forbidden();
    }

    await prisma.$transaction(async (tx) => {
      await tx.replyAttachment.upsert({
        where: { replyId_attachmentId: { replyId, attachmentId } },
        create: { replyId, attachmentId },
        update: {},
      });
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "reply_attachment.linked",
        entityType: "ReplyAttachment",
        entityId: attachmentId,
        diff: { replyId: { old: null, new: replyId } },
      });
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
