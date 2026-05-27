import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { isAllowedTransition } from "@/lib/knowledge/state-machine";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/knowledge/[slug]/un-approve
 *
 * Admin-only override. Pulls an `approved` article back into
 * `pending_review` so it can be re-decided. Mirrors the un-archive
 * route in shape.
 */
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;

  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!existing) return notFound("Article");

  if (!isAllowedTransition(existing.status, "pending_review")) {
    return unprocessable(
      `Article cannot transition from '${existing.status}' to 'pending_review' via un-approve`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data: { status: "pending_review", lastEditedByUserId: auth.user.id },
      select: { id: true, slug: true, title: true, status: true },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_UN_APPROVED,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: { status: { old: existing.status, new: "pending_review" } },
    });
    return u;
  });

  return NextResponse.json(updated);
}
