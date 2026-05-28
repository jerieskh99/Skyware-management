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
import { canReview } from "@/lib/knowledge/permissions";
import { isAllowedTransition } from "@/lib/knowledge/state-machine";
import {
  decideReview,
  KnowledgeReviewNotFoundError,
  KnowledgeReviewWrongActorError,
} from "@/lib/knowledge/queries";
import { notifyReviewDecided } from "@/lib/knowledge/notification-triggers";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ slug: string }>;
}

const DECISION_VALUES = ["approved", "changes_requested", "rejected"] as const;
const reviewBodySchema = z.object({
  decision: z.enum(DECISION_VALUES),
  comment: z.string().trim().max(4_000).optional(),
});

/** Cycle counter past which we require an explicit admin arbitration. */
const MAX_REVIEW_CYCLES = 2;

/**
 * POST /api/knowledge/[slug]/review
 *
 * Reviewer decision on a `pending_review` article:
 *   - `approved`: article moves to `approved`, `lastReviewedAt` stamped.
 *   - `changes_requested`: article moves back to `draft`, cycle counter bumps.
 *     If the article has already cycled `MAX_REVIEW_CYCLES` times and the
 *     caller is not an admin, return 422 asking for admin arbitration.
 *   - `rejected`: article moves to `archived` (the rejection is recorded on
 *     the review row's `status`). Authors can clone the archived article
 *     into a new draft if they want to try again; see the workflow doc
 *     §1 "pending_review -> archived (reject)".
 *
 * Same-actor guard: the caller MUST NOT be the article's author.
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
      slug: true,
      title: true,
      status: true,
      authorUserId: true,
    },
  });
  if (!existing) return notFound("Article");

  if (existing.authorUserId === auth.user.id) {
    return unprocessable("Article author cannot review their own article");
  }
  if (!canReview(auth.user, existing)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = reviewBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const { decision, comment } = parsed.data;

  // Cycle counter on `changes_requested`: if the next cycle would exceed
  // MAX_REVIEW_CYCLES, require admin arbitration. V1 reviewers are admins,
  // so in practice this never blocks; the check is a forward-compatible
  // guard for Phase 2 senior-employee reviewers.
  if (decision === "changes_requested") {
    const latest = await prisma.knowledgeArticleReview.findFirst({
      where: { articleId: existing.id },
      orderBy: { cycleNumber: "desc" },
      select: { cycleNumber: true },
    });
    const nextCycle = (latest?.cycleNumber ?? 1) + 1;
    if (nextCycle > MAX_REVIEW_CYCLES && !auth.user.isAdmin) {
      return NextResponse.json(
        {
          error: "max_cycles_exceeded",
          message:
            "This article has already cycled the maximum number of times. An admin must intervene.",
          maxCycles: MAX_REVIEW_CYCLES,
        },
        { status: 422 },
      );
    }
  }

  // Target status by decision. Three decisions, three sinks:
  //   approved          -> approved
  //   changes_requested -> draft
  //   rejected          -> archived (per workflow doc §1)
  const nextStatus =
    decision === "approved"
      ? "approved"
      : decision === "rejected"
        ? "archived"
        : "draft";
  if (!isAllowedTransition(existing.status, nextStatus)) {
    return unprocessable(
      `Cannot transition article from '${existing.status}' to '${nextStatus}'`,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Admin take-over: if the open review's reviewer is not the caller,
      // reassign the open row to the caller before deciding so the helper's
      // same-actor invariant holds. This lets any admin pull from the queue
      // even if a different admin was the initial assignee at submit time.
      // We write an audit row whenever this reassignment happens so a takeover
      // is not silent.
      const open = await tx.knowledgeArticleReview.findFirst({
        where: { articleId: existing.id, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, reviewerUserId: true },
      });
      if (open && open.reviewerUserId !== auth.user.id) {
        const previousReviewerId = open.reviewerUserId;
        await tx.knowledgeArticleReview.update({
          where: { id: open.id },
          data: { reviewerUserId: auth.user.id },
        });
        await writeAudit(tx, {
          actorUserId: auth.user.id,
          action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_REVIEW_ASSIGNED,
          entityType: "KnowledgeArticle",
          entityId: existing.id,
          diff: {
            reviewerUserId: {
              old: previousReviewerId,
              new: auth.user.id,
            },
          },
        });
      }

      await decideReview(tx, {
        articleId: existing.id,
        reviewerUserId: auth.user.id,
        decision,
        ...(comment ? { comment } : {}),
      });

      const updateData: Record<string, unknown> = {
        status: nextStatus,
        lastEditedByUserId: auth.user.id,
      };
      if (decision === "approved") {
        updateData["lastReviewedAt"] = new Date();
        updateData["reviewerUserId"] = auth.user.id;
      }
      await tx.knowledgeArticle.update({
        where: { id: existing.id },
        data: updateData,
      });

      await notifyReviewDecided(tx, {
        articleId: existing.id,
        articleSlug: existing.slug,
        articleTitle: existing.title,
        authorUserId: existing.authorUserId,
        decision,
        ...(comment ? { commentPreview: comment.slice(0, 280) } : {}),
      });

      await writeAudit(tx, {
        actorUserId: auth.user.id,
        action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_REVIEW_DECIDED,
        entityType: "KnowledgeArticle",
        entityId: existing.id,
        diff: {
          status: { old: existing.status, new: nextStatus },
          decision: { old: null, new: decision },
        },
      });
    });
  } catch (err) {
    if (err instanceof KnowledgeReviewNotFoundError) {
      return unprocessable("No open review found for this article");
    }
    if (err instanceof KnowledgeReviewWrongActorError) {
      // Admin overrides: if the caller is admin but not the assigned reviewer,
      // we let them proceed by replaying decideReview with the original
      // reviewerUserId. For V1 simplicity, surface a 422 instead.
      return unprocessable(
        "You are not the assigned reviewer for the open review on this article",
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, status: nextStatus, decision });
}
