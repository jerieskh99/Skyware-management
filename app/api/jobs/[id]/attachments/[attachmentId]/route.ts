import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import { getJobForUser } from "@/lib/jobs/queries";
import { canDeleteAttachment } from "@/lib/storage/attachments";
import { deleteObject } from "@/lib/storage/s3";
import { withErrorLog, logger } from "@/lib/logger";

interface Params {
  params: Promise<{ id: string; attachmentId: string }>;
}

/**
 * DELETE — remove the job/attachment link, the underlying Attachment row,
 * and the S3 object. Permission: admin or original uploader.
 */
export async function DELETE(_req: Request, { params }: Params) {
  return withErrorLog("jobs.attachments.delete", async () => {
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

    const { id, attachmentId } = await params;
    const job = await getJobForUser(user, id);
    if (!job) return notFound("Job");

    const row = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, storageKey: true, uploadedByUserId: true, fileName: true },
    });
    if (!row) return notFound("Attachment");

    if (!canDeleteAttachment(user, row.uploadedByUserId)) {
      return forbidden();
    }

    await prisma.$transaction(async (tx) => {
      // ON DELETE CASCADE handles the JobAttachment join row.
      await tx.attachment.delete({ where: { id: attachmentId } });
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "attachment.deleted",
        entityType: "Attachment",
        entityId: attachmentId,
        diff: {
          fileName: { old: row.fileName, new: null },
          jobId: { old: id, new: null },
        },
      });
    });

    try {
      await deleteObject(row.storageKey);
    } catch (err) {
      logger.warn("attachment.s3_delete_failed", {
        attachmentId,
        key: row.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true });
  });
}
