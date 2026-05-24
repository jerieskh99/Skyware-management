import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import { validateUpload } from "@/lib/storage/upload-policy";
import { objectKeyFor, presignUpload } from "@/lib/storage/s3";
import { withErrorLog } from "@/lib/logger";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  contentLength: z.number().int().positive(),
  visibility: z.enum(["public_in_org", "admin_only"]).optional(),
});

/**
 * POST /api/attachments
 *
 * Allocates an Attachment row, computes a storage key, and returns a
 * presigned PUT URL the client can upload to directly. The actual link to
 * a parent (job, post, reply) is made in a separate request.
 */
export async function POST(req: Request) {
  return withErrorLog("attachments.create", async () => {
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

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return badRequest(parsed.error.issues);

    const { filename, contentType, contentLength, visibility } = parsed.data;
    const policy = validateUpload({ filename, contentType, contentLength });
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error }, { status: 400 });
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          storageKey: "", // filled below once we know the id
          fileName: filename,
          mimeType: contentType,
          byteSize: contentLength,
          uploadedByUserId: user.id,
          visibility: visibility ?? "public_in_org",
        },
      });
      const storageKey = objectKeyFor(created.id, filename);
      const updated = await tx.attachment.update({
        where: { id: created.id },
        data: { storageKey },
      });
      await writeAudit(tx, {
        actorUserId: user.id,
        action: "attachment.created",
        entityType: "Attachment",
        entityId: created.id,
        diff: {
          fileName: { old: null, new: filename },
          mimeType: { old: null, new: contentType },
          byteSize: { old: null, new: contentLength },
          visibility: {
            old: null,
            new: visibility ?? "public_in_org",
          },
        },
      });
      return updated;
    });

    const presigned = await presignUpload({
      key: row.storageKey,
      contentType,
      contentLength,
    });

    return NextResponse.json(
      {
        id: row.id,
        key: row.storageKey,
        presignedUrl: presigned.url,
        headers: presigned.headers,
      },
      { status: 201 },
    );
  });
}
