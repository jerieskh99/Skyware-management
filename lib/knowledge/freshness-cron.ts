import type { KnowledgeArticleType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { KNOWLEDGE_AUDIT_ACTIONS } from "./audit-actions";
import { notifyFreshnessDue, notifyLinkBroken } from "./notification-triggers";
import { checkUrlHealth } from "./link-check";

/**
 * Daily / weekly background jobs that operate on the published knowledge
 * base. Kept in lib/ (rather than inside the route file) so that:
 *
 *   1. The cron route is a thin pass-through and identical in shape to the
 *      other cron entrypoints (sla-breach, recurring-jobs, client-health),
 *   2. The body is reusable from manual admin triggers, future schedulers,
 *      or one-shot scripts,
 *   3. Tests can mock `prisma`, the notification helpers, and the link
 *      probe directly without spinning up the route.
 */

/**
 * Stale thresholds keyed by article kind, in days. See the implementation
 * plan §3.2 for the rationale per type.
 */
const STALE_DAYS_BY_KIND: Record<KnowledgeArticleType, number> = {
  external_reference: 180,
  troubleshooting_note: 365,
  how_to_guide: 365,
  internal_task_lesson: 540,
  architecture_decision: 730,
  process_policy_note: 730,
};

/** Window before we fire a second freshness reminder for the same article. */
const DEDUP_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface FreshnessCronSummary extends Record<string, unknown> {
  scanned: number;
  notified: number;
  skipped: number;
}

/**
 * Scan all `published` articles. For each row whose last verification /
 * review / publish event is older than the per-kind threshold AND has no
 * `knowledge_freshness_due` notification within the last 14 days, fan out a
 * notification to the article's reviewer (or to all admins as a fallback).
 *
 * Idempotent: re-running within the dedup window writes no notifications.
 */
export async function runKnowledgeFreshnessCron(): Promise<FreshnessCronSummary> {
  const rows = await prisma.knowledgeArticle.findMany({
    where: { status: "published" },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      publishedAt: true,
      lastReviewedAt: true,
      lastVerifiedAt: true,
      reviewerUserId: true,
    },
  });

  const summary: FreshnessCronSummary = { scanned: rows.length, notified: 0, skipped: 0 };
  if (rows.length === 0) return summary;

  // Resolve a fallback list of admin recipients once. We notify the
  // article's `reviewerUserId` when present; otherwise we fan-out to all
  // admins so the article does not silently rot.
  const adminFallback = await prisma.user.findMany({
    where: { isActive: true, role: { isAdmin: true } },
    select: { id: true },
  });
  const adminIds = adminFallback.map((u: { id: string }) => u.id);

  const now = Date.now();
  const dedupCutoff = new Date(now - DEDUP_WINDOW_DAYS * MS_PER_DAY);

  for (const article of rows) {
    const lastTouch = mostRecent(
      article.lastVerifiedAt,
      article.lastReviewedAt,
      article.publishedAt,
    );
    if (!lastTouch) {
      summary.skipped += 1;
      continue;
    }
    const ageDays = Math.floor((now - lastTouch.getTime()) / MS_PER_DAY);
    const floor = STALE_DAYS_BY_KIND[article.kind];
    if (ageDays < floor) {
      summary.skipped += 1;
      continue;
    }

    // Dedup: was a freshness notification recently fired for this article?
    const recentNotif = await prisma.notification.findFirst({
      where: {
        kind: "knowledge_freshness_due",
        createdAt: { gte: dedupCutoff },
        payload: { path: ["articleId"], equals: article.id },
      } as Prisma.NotificationWhereInput,
      select: { id: true },
    });
    if (recentNotif) {
      summary.skipped += 1;
      continue;
    }

    const recipients = article.reviewerUserId ? [article.reviewerUserId] : adminIds;
    if (recipients.length === 0) {
      summary.skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const userId of recipients) {
        await notifyFreshnessDue(tx, {
          articleId: article.id,
          articleSlug: article.slug,
          articleTitle: article.title,
          reviewerUserId: userId,
          staleDays: ageDays,
        });
      }
      await writeAudit(tx, {
        actorUserId: null,
        action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_FRESHNESS_FLAGGED,
        entityType: "KnowledgeArticle",
        entityId: article.id,
        diff: {
          staleDays: { old: null, new: ageDays },
          threshold: { old: null, new: floor },
          recipients: { old: null, new: recipients.length },
        },
      });
    });

    summary.notified += 1;
  }

  return summary;
}

interface LinkHealthCronSummary extends Record<string, unknown> {
  scanned: number;
  broken: number;
  deduped: number;
}

/** Window before we re-fire a link_broken notification for the same article. */
const LINK_BROKEN_DEDUP_WINDOW_DAYS = 7;

/**
 * Scan all `published` + `external_reference` articles that carry a non-null
 * `externalUrl` AND `externalUrlHash`, HEAD-fetch each URL, and emit a
 * `knowledge_link_broken` notification when the response is non-2xx or the
 * fetch failed entirely.
 *
 * The function records ONE audit row per article (regardless of outcome)
 * so the admin can see "we did look at this on date X" without grepping
 * notification rows. Notifications are deduped against the past
 * `LINK_BROKEN_DEDUP_WINDOW_DAYS` so a permanently broken URL does not
 * spam the queue every weekly run. Articles skipped via dedup increment
 * `summary.deduped` so the operator can see how many would-be notifications
 * were suppressed.
 *
 * Rows whose `externalUrl` is NULL are filtered at the SQL level so they
 * never enter the scan loop — the dataset invariant says external_reference
 * articles MUST have a URL once published, and a NULL there is a data bug
 * worth surfacing (rather than silently masking by decrementing `scanned`).
 */
export async function runKnowledgeLinkHealthCron(): Promise<LinkHealthCronSummary> {
  const rows = await prisma.knowledgeArticle.findMany({
    where: {
      status: "published",
      kind: "external_reference",
      externalUrl: { not: null },
      externalUrlHash: { not: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      externalUrl: true,
      reviewerUserId: true,
    },
  });

  const summary: LinkHealthCronSummary = {
    scanned: rows.length,
    broken: 0,
    deduped: 0,
  };
  if (rows.length === 0) return summary;

  let adminIds: string[] | null = null;
  async function loadAdminIds(): Promise<string[]> {
    if (adminIds) return adminIds;
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { isAdmin: true } },
      select: { id: true },
    });
    adminIds = admins.map((u: { id: string }) => u.id);
    return adminIds;
  }

  const dedupCutoff = new Date(
    Date.now() - LINK_BROKEN_DEDUP_WINDOW_DAYS * MS_PER_DAY,
  );

  for (const article of rows) {
    const result = await checkUrlHealth(article.externalUrl ?? "");

    // Dedup BEFORE the per-article transaction so we do not pay for a
    // pointless tx when a recent broken-link notification already exists.
    // Mirrors the dedup pattern in `runKnowledgeFreshnessCron`.
    let skipNotify = false;
    if (!result.ok) {
      const recent = await prisma.notification.findFirst({
        where: {
          kind: "knowledge_link_broken",
          createdAt: { gte: dedupCutoff },
          payload: { path: ["articleId"], equals: article.id },
        } as Prisma.NotificationWhereInput,
        select: { id: true },
      });
      if (recent) {
        skipNotify = true;
        summary.deduped += 1;
      }
    }

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: null,
        action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_LINK_HEALTH_CHECKED,
        entityType: "KnowledgeArticle",
        entityId: article.id,
        diff: {
          httpStatus: { old: null, new: result.status },
          ok: { old: null, new: result.ok },
          durationMs: { old: null, new: result.durationMs },
        },
      });
      if (!result.ok && !skipNotify) {
        const recipients = article.reviewerUserId
          ? [article.reviewerUserId]
          : await loadAdminIds();
        for (const userId of recipients) {
          await notifyLinkBroken(tx, {
            articleId: article.id,
            articleSlug: article.slug,
            articleTitle: article.title,
            reviewerUserId: userId,
            externalUrl: article.externalUrl ?? "",
            httpStatus: result.status,
          });
        }
      }
    });

    if (!result.ok) summary.broken += 1;
  }

  return summary;
}

/** Helper: return the most recent non-null Date from the arguments. */
function mostRecent(...dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max;
}
