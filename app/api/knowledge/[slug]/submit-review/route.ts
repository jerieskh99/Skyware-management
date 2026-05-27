import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canSubmitForReview } from "@/lib/knowledge/permissions";
import { isAllowedTransition } from "@/lib/knowledge/state-machine";
import { validateForSubmit } from "@/lib/knowledge/validators";
import { openReview } from "@/lib/knowledge/queries";
import { notifyReviewRequested } from "@/lib/knowledge/notification-triggers";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/knowledge/[slug]/submit-review
 *
 * Author (or admin) submits the article for review. The article must be
 * in `draft` or `ai_structured`; the state machine enforces the edge.
 *
 * We run `validateForSubmit` server-side: any issues are returned as
 * 422 with the issue list so the UI can render inline errors. On success
 * we open a new review cycle (no specific reviewer assigned in V1 — the
 * fan-out is to all admins) and notify them.
 */
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;

  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      body: true,
      kind: true,
      status: true,
      authorUserId: true,
      externalUrl: true,
      externalSource: true,
      tags: { select: { tagId: true } },
    },
  });
  if (!existing) return notFound("Article");

  if (!canSubmitForReview(auth.user, existing)) return forbidden();
  if (!isAllowedTransition(existing.status, "pending_review")) {
    return unprocessable(
      `Article cannot be submitted for review from status '${existing.status}'`,
    );
  }

  const issues = validateForSubmit({
    title: existing.title,
    summary: existing.summary,
    body: existing.body,
    kind: existing.kind,
    tagsCount: existing.tags.length,
    externalUrl: existing.externalUrl,
    externalSource: existing.externalSource,
  });
  if (issues.length > 0) {
    return NextResponse.json(
      { error: "validation_failed", issues },
      { status: 422 },
    );
  }

  // Fan out to every admin so the queue is visible cross-user. In V1 the
  // reviewer column points at the most recent admin; Phase 2 may scope per
  // department.
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { isAdmin: true } },
    select: { id: true },
  });
  const adminIds = admins
    .map((u: { id: string }) => u.id)
    .filter((id: string) => id !== existing.authorUserId);

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        status: "pending_review",
        lastEditedByUserId: auth.user.id,
      },
    });

    // Open the review row. Reviewer is "anyone in admin pool" so we pick
    // the first admin for the assignee column. The notification fans out
    // to all admins so multiple can pull from the queue.
    const primaryReviewer = adminIds[0] ?? null;
    if (primaryReviewer) {
      await openReview(tx, {
        articleId: existing.id,
        reviewerUserId: primaryReviewer,
      });
    }

    await notifyReviewRequested(tx, {
      articleId: existing.id,
      articleSlug: existing.slug,
      articleTitle: existing.title,
      reviewerUserIds: adminIds,
      authorUserId: existing.authorUserId,
    });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_SUBMITTED_FOR_REVIEW,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: {
        status: { old: existing.status, new: "pending_review" },
        reviewerCount: { old: null, new: adminIds.length },
      },
    });
  });

  return NextResponse.json({ ok: true, status: "pending_review" });
}
