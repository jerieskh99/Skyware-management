import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  canDeleteAttachment,
  canReadAttachmentVisibility,
} from "@/lib/storage/attachments";
import { deleteObject, presignDownload } from "@/lib/storage/s3";
import { withErrorLog, logger } from "@/lib/logger";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/attachments/[id] — returns a short-lived presigned download URL. */
export async function GET(_req: Request, { params }: Params) {
  return withErrorLog("attachments.download", async () => {
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

    const { id } = await params;
    const row = await prisma.attachment.findUnique({
      where: { id },
      select: {
        id: true,
        storageKey: true,
        fileName: true,
        mimeType: true,
        byteSize: true,
        visibility: true,
      },
    });
    if (!row) return notFound("Attachment");

    if (!canReadAttachmentVisibility(user, row.visibility)) {
      return forbidden();
    }

    const url = await presignDownload({ key: row.storageKey });
    return NextResponse.json({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      visibility: row.visibility,
      url,
    });
  });
}

/** DELETE /api/attachments/[id] — admin or uploader only. Removes row + S3 object. */
export async function DELETE(_req: Request, { params }: Params) {
  return withErrorLog("attachments.delete", async () => {
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

    const { id } = await params;
    const row = await prisma.attachment.findUnique({
      where: { id },
      select: {
        id: true,
        storageKey: true,
        uploadedByUserId: true,
        fileName: true,
      },
    });
    if (!row) return notFound("Attachment");

    if (!canDeleteAttachment(user, row.uploadedByUserId)) {
      return forbidden();
    }

    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id } });
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "attachment.deleted",
        entityType: "Attachment",
        entityId: id,
        diff: {
          fileName: { old: row.fileName, new: null },
        },
      });
    });

    // S3 delete is best-effort: if it fails, log but do not fail the request.
    // The DB row is already gone, and orphan objects can be cleaned up later.
    try {
      await deleteObject(row.storageKey);
    } catch (err) {
      logger.warn("attachment.s3_delete_failed", {
        attachmentId: id,
        key: row.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true });
  });
}
