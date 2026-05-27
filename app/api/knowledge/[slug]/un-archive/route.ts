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
 * POST /api/knowledge/[slug]/un-archive
 *
 * Admin-only. Sends an archived article back to `draft` so it can be
 * resurrected and re-edited. The state machine guards the transition.
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

  if (!isAllowedTransition(existing.status, "draft")) {
    return unprocessable(
      `Article cannot transition from '${existing.status}' to 'draft' via un-archive`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data: { status: "draft", lastEditedByUserId: auth.user.id },
      select: { id: true, slug: true, title: true, status: true },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_UN_ARCHIVED,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: { status: { old: existing.status, new: "draft" } },
    });
    return u;
  });

  return NextResponse.json(updated);
}
