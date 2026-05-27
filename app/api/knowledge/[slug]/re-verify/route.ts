import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  badRequest,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canReVerify } from "@/lib/knowledge/permissions";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ slug: string }>;
}

const RELIABILITY_VALUES = [
  "verified",
  "validated",
  "single_source",
  "anecdotal",
] as const;

const bodySchema = z.object({
  reliabilityTier: z.enum(RELIABILITY_VALUES).optional(),
});

/**
 * POST /api/knowledge/[slug]/re-verify
 *
 * Marks the article as "I just checked this and it is still applicable".
 * Sets `lastVerifiedAt = now()` and `lastVerifiedByUserId = caller`. Can
 * optionally bump the `reliabilityTier`. The article must be `published`
 * and the caller must pass `canReVerify` (admin always; employees for
 * external_reference / troubleshooting_note / how_to_guide).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;

  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: {
      id: true,
      kind: true,
      status: true,
      reliabilityTier: true,
      lastVerifiedAt: true,
    },
  });
  if (!existing) return notFound("Article");

  if (existing.status !== "published") {
    return unprocessable(
      `Article must be 'published' to re-verify (current: '${existing.status}')`,
    );
  }
  if (!canReVerify(auth.user, existing)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest(parsed.error.issues);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = {
      lastVerifiedAt: now,
      lastVerifiedByUserId: auth.user.id,
    };
    if (parsed.data.reliabilityTier) {
      data["reliabilityTier"] = parsed.data.reliabilityTier;
    }
    const u = await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
        status: true,
        reliabilityTier: true,
        lastVerifiedAt: true,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_RE_VERIFIED,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: {
        lastVerifiedAt: { old: existing.lastVerifiedAt, new: now },
        ...(parsed.data.reliabilityTier
          ? {
              reliabilityTier: {
                old: existing.reliabilityTier,
                new: parsed.data.reliabilityTier,
              },
            }
          : {}),
      },
    });
    return u;
  });

  return NextResponse.json(updated);
}
