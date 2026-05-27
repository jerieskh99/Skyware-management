import type { KnowledgeArticleReviewStatus, Prisma } from "@prisma/client";
import { getFeatureFlag } from "@/lib/feature-flags";

/**
 * Notification trigger helpers for the Knowledge module.
 *
 * Mirrors the pattern of `lib/notifications/triggers.ts` (job_assigned,
 * mention, sla_breached). Each helper writes a `Notification` row inside
 * the caller-supplied Prisma transaction so the notification commits in
 * lockstep with the mutation that triggered it.
 *
 * The Wave 1 schema migration added four `NotificationKind` enum values:
 *   - `knowledge_review_requested`
 *   - `knowledge_review_decided`
 *   - `knowledge_freshness_due`
 *   - `knowledge_link_broken`
 *
 * Each kind has its own payload shape; the union is documented in the
 * `Notification` model docstring.
 */

const FLAG_KEY = "notifications_enabled";

interface ReviewRequestedArgs {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  /** All reviewers the request should fan out to. */
  reviewerUserIds: string[];
  /** The author. Used to suppress self-notification if they appear in the reviewer list. */
  authorUserId: string;
}

/** Fired when an article transitions `draft -> pending_review`. */
export async function notifyReviewRequested(
  tx: Prisma.TransactionClient,
  args: ReviewRequestedArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  const uniqueReviewers = Array.from(
    new Set(args.reviewerUserIds.filter((id) => id && id !== args.authorUserId)),
  );
  if (uniqueReviewers.length === 0) return;

  await tx.notification.createMany({
    data: uniqueReviewers.map((userId) => ({
      userId,
      kind: "knowledge_review_requested" as const,
      payload: {
        articleId: args.articleId,
        articleSlug: args.articleSlug,
        articleTitle: args.articleTitle,
        authorUserId: args.authorUserId,
      } satisfies Prisma.InputJsonValue,
      link: `/knowledge/${args.articleSlug}`,
    })),
  });
}

interface ReviewDecidedArgs {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  /** The author who originally submitted; receives the decision notification. */
  authorUserId: string;
  decision: KnowledgeArticleReviewStatus;
  /** Optional reviewer comment to preview in the notification body. */
  commentPreview?: string;
}

/** Fired when a review row is closed with a decision. */
export async function notifyReviewDecided(
  tx: Prisma.TransactionClient,
  args: ReviewDecidedArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;

  const payload: Record<string, unknown> = {
    articleId: args.articleId,
    articleSlug: args.articleSlug,
    articleTitle: args.articleTitle,
    decision: args.decision,
  };
  if (args.commentPreview) payload["commentPreview"] = args.commentPreview;

  await tx.notification.create({
    data: {
      userId: args.authorUserId,
      kind: "knowledge_review_decided",
      payload: payload as Prisma.InputJsonValue,
      link: `/knowledge/${args.articleSlug}`,
    },
  });
}

interface FreshnessDueArgs {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  /** Recipient: either the author or the original reviewer per the freshness sweep policy. */
  reviewerUserId: string;
  /** Number of days the article has been past its freshness threshold. */
  staleDays: number;
}

/** Fired by the daily freshness cron when an article crosses its threshold. */
export async function notifyFreshnessDue(
  tx: Prisma.TransactionClient,
  args: FreshnessDueArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;

  await tx.notification.create({
    data: {
      userId: args.reviewerUserId,
      kind: "knowledge_freshness_due",
      payload: {
        articleId: args.articleId,
        articleSlug: args.articleSlug,
        articleTitle: args.articleTitle,
        staleDays: args.staleDays,
      } satisfies Prisma.InputJsonValue,
      link: `/knowledge/${args.articleSlug}`,
    },
  });
}

interface LinkBrokenArgs {
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  reviewerUserId: string;
  externalUrl: string;
  httpStatus: number | null;
}

/** Fired by the weekly link-health cron when a URL flips ok -> failed. */
export async function notifyLinkBroken(
  tx: Prisma.TransactionClient,
  args: LinkBrokenArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;

  await tx.notification.create({
    data: {
      userId: args.reviewerUserId,
      kind: "knowledge_link_broken",
      payload: {
        articleId: args.articleId,
        articleSlug: args.articleSlug,
        articleTitle: args.articleTitle,
        externalUrl: args.externalUrl,
        httpStatus: args.httpStatus,
      } satisfies Prisma.InputJsonValue,
      link: `/knowledge/${args.articleSlug}`,
    },
  });
}
