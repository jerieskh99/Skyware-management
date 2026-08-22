import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { FEATURE_FLAGS_TAG } from "@/lib/feature-flags";

interface Params { params: Promise<{ key: string }> }

const schema = z.object({ enabled: z.boolean() });

/** PATCH — toggle a feature flag. Admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { key } = await params;
  const flag = await prisma.featureFlag.findUnique({ where: { key }, select: { id: true, enabled: true } });
  if (!flag) return notFound("Feature flag");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    const f = await tx.featureFlag.update({
      where: { key },
      data: { enabled: parsed.data.enabled, updatedByUserId: auth.user.id },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "feature_flag.toggled",
      entityType: "FeatureFlag",
      entityId: f.id,
      diff: { enabled: { old: flag.enabled, new: parsed.data.enabled } },
    });
    return f;
  });

  // Purge the cross-request feature-flag cache so the toggle takes effect on
  // the next navigation instead of waiting out the TTL backstop.
  revalidateTag(FEATURE_FLAGS_TAG);

  return NextResponse.json({ key: updated.key, enabled: updated.enabled });
}
