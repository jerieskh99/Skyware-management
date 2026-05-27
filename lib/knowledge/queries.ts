import type {
  KnowledgeArticleReviewStatus,
  KnowledgeArticleStatus,
  KnowledgeArticleType,
  KnowledgeArticleVisibility,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { isAdmin, type SessionUser } from "@/lib/permissions";
import { KNOWLEDGE_AUDIT_ACTIONS } from "./audit-actions";
import { slugify } from "./slug";

const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  status: true,
  visibility: true,
  // Wave 3: include the knowledge-specific list columns so the list page,
  // reviewer queue, and any other consumer can render kind chips,
  // reliability tier badges, and freshness pills without a second fetch.
  kind: true,
  reliabilityTier: true,
  lastVerifiedAt: true,
  reviewerUserId: true,
  publishedAt: true,
  updatedAt: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
  lastEditedBy: { select: { id: true, displayName: true } },
  relatedClient: { select: { id: true, companyName: true } },
  tags: {
    select: {
      tag: { select: { id: true, key: true, labelEn: true, labelHe: true, colorHex: true } },
    },
  },
} satisfies Prisma.KnowledgeArticleSelect;

const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_LIST_SELECT,
  body: true,
} satisfies Prisma.KnowledgeArticleSelect;

export type ArticleListRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof ARTICLE_LIST_SELECT;
}>;

export type ArticleDetailRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof ARTICLE_DETAIL_SELECT;
}>;

interface ListArgs {
  status?: KnowledgeArticleStatus;
  q?: string;
  tag?: string;
  viewerIsAdmin: boolean;
  limit?: number;
  cursor?: string | null;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function clampLimit(n?: number): number {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export interface ArticleListPage {
  items: ArticleListRow[];
  nextCursor: string | null;
}

/** List articles applying visibility, status, search, and tag filters. */
export async function listArticles(args: ListArgs): Promise<ArticleListPage> {
  const limit = clampLimit(args.limit);

  const where: Prisma.KnowledgeArticleWhereInput = {};
  if (!args.viewerIsAdmin) {
    where.visibility = "internal";
    where.status = "published";
  } else if (args.status) {
    where.status = args.status;
  } else {
    where.status = { not: "archived" };
  }
  if (args.q && args.q.length >= 2) {
    where.OR = [
      { title: { contains: args.q, mode: "insensitive" } },
      { body: { contains: args.q, mode: "insensitive" } },
      { summary: { contains: args.q, mode: "insensitive" } },
    ];
  }
  if (args.tag) {
    where.tags = { some: { tag: { key: args.tag } } };
  }
  if (args.cursor) {
    where.id = { gt: args.cursor };
  }

  const rows = await prisma.knowledgeArticle.findMany({
    where,
    select: ARTICLE_LIST_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
  });
  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]?.id ?? null : null;
  return { items: rows, nextCursor };
}

export async function getArticleBySlug(
  slug: string,
  viewerIsAdmin: boolean,
): Promise<ArticleDetailRow | null> {
  const row = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: ARTICLE_DETAIL_SELECT,
  });
  if (!row) return null;
  if (!viewerIsAdmin) {
    if (row.visibility === "admin_only") return null;
    if (row.status !== "published") return null;
  }
  return row;
}

interface CreateInput {
  title: string;
  body: string;
  summary?: string | null;
  visibility?: KnowledgeArticleVisibility;
  relatedClientId?: string | null;
}

/**
 * Generate a slug that does not collide. Strategy: slugify the title; if a row
 * already owns the slug, append `-2`, `-3`, etc. until free.
 */
async function generateUniqueSlug(
  tx: Prisma.TransactionClient,
  title: string,
): Promise<string> {
  let base = slugify(title);
  if (!base) base = `article-${Math.random().toString(36).slice(2, 10)}`;
  let candidate = base;
  let i = 1;
  while (true) {
    const existing = await tx.knowledgeArticle.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    i += 1;
    const suffix = `-${i}`;
    const maxBaseLen = 80 - suffix.length;
    const trimmed = base.length > maxBaseLen ? base.slice(0, maxBaseLen).replace(/-+$/g, "") : base;
    candidate = `${trimmed}${suffix}`;
  }
}

export async function createArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; input: CreateInput },
): Promise<ArticleDetailRow> {
  const slug = await generateUniqueSlug(tx, args.input.title);
  const row = await tx.knowledgeArticle.create({
    data: {
      slug,
      title: args.input.title,
      body: args.input.body,
      summary: args.input.summary ?? null,
      visibility: args.input.visibility ?? "internal",
      relatedClientId: args.input.relatedClientId ?? null,
      authorUserId: args.actorUserId,
      lastEditedByUserId: args.actorUserId,
    },
    select: ARTICLE_DETAIL_SELECT,
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.created",
    entityType: "KnowledgeArticle",
    entityId: row.id,
    diff: {
      title: { old: null, new: args.input.title },
      slug: { old: null, new: slug },
      visibility: { old: null, new: row.visibility },
    },
  });
  return row;
}

interface UpdatePatch {
  title?: string;
  body?: string;
  summary?: string | null;
  visibility?: KnowledgeArticleVisibility;
  relatedClientId?: string | null;
  /** Default false: keep the old slug for stable URLs even when title changes. */
  regenerateSlug?: boolean;
}

export class KnowledgeNotFoundError extends Error {
  constructor() {
    super("Knowledge article not found");
    this.name = "KnowledgeNotFoundError";
  }
}

export async function updateArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string; patch: UpdatePatch },
): Promise<ArticleDetailRow> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.id },
    select: {
      id: true,
      title: true,
      body: true,
      summary: true,
      visibility: true,
      relatedClientId: true,
      slug: true,
    },
  });
  if (!existing) throw new KnowledgeNotFoundError();

  const data: Prisma.KnowledgeArticleUpdateInput = {
    lastEditedBy: { connect: { id: args.actorUserId } },
  };
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  if (args.patch.title !== undefined && args.patch.title !== existing.title) {
    data.title = args.patch.title;
    diff.title = { old: existing.title, new: args.patch.title };
    if (args.patch.regenerateSlug) {
      const newSlug = await generateUniqueSlug(tx, args.patch.title);
      data.slug = newSlug;
      diff.slug = { old: existing.slug, new: newSlug };
    }
  }
  if (args.patch.body !== undefined && args.patch.body !== existing.body) {
    data.body = args.patch.body;
    diff.body = { old: "(omitted)", new: "(updated)" };
  }
  if (args.patch.summary !== undefined && args.patch.summary !== existing.summary) {
    data.summary = args.patch.summary;
    diff.summary = { old: existing.summary, new: args.patch.summary };
  }
  if (args.patch.visibility !== undefined && args.patch.visibility !== existing.visibility) {
    data.visibility = args.patch.visibility;
    diff.visibility = { old: existing.visibility, new: args.patch.visibility };
  }
  if (
    args.patch.relatedClientId !== undefined &&
    args.patch.relatedClientId !== existing.relatedClientId
  ) {
    if (args.patch.relatedClientId === null) {
      data.relatedClient = { disconnect: true };
    } else {
      data.relatedClient = { connect: { id: args.patch.relatedClientId } };
    }
    diff.relatedClientId = {
      old: existing.relatedClientId,
      new: args.patch.relatedClientId,
    };
  }

  const updated = await tx.knowledgeArticle.update({
    where: { id: args.id },
    data,
    select: ARTICLE_DETAIL_SELECT,
  });

  if (Object.keys(diff).length > 0) {
    await writeAudit(tx, {
      actorUserId: args.actorUserId,
      action: "knowledge.updated",
      entityType: "KnowledgeArticle",
      entityId: args.id,
      diff,
    });
  }

  return updated;
}

export async function publishArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string },
): Promise<ArticleDetailRow> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.id },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!existing) throw new KnowledgeNotFoundError();

  const updated = await tx.knowledgeArticle.update({
    where: { id: args.id },
    data: {
      status: "published",
      publishedAt: existing.publishedAt ?? new Date(),
      lastEditedBy: { connect: { id: args.actorUserId } },
    },
    select: ARTICLE_DETAIL_SELECT,
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.published",
    entityType: "KnowledgeArticle",
    entityId: args.id,
    diff: { status: { old: existing.status, new: "published" } },
  });
  return updated;
}

export async function archiveArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string },
): Promise<ArticleDetailRow> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.id },
    select: { id: true, status: true },
  });
  if (!existing) throw new KnowledgeNotFoundError();

  const updated = await tx.knowledgeArticle.update({
    where: { id: args.id },
    data: {
      status: "archived",
      lastEditedBy: { connect: { id: args.actorUserId } },
    },
    select: ARTICLE_DETAIL_SELECT,
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.archived",
    entityType: "KnowledgeArticle",
    entityId: args.id,
    diff: { status: { old: existing.status, new: "archived" } },
  });
  return updated;
}

export async function unpublishArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string },
): Promise<ArticleDetailRow> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.id },
    select: { id: true, status: true },
  });
  if (!existing) throw new KnowledgeNotFoundError();

  const updated = await tx.knowledgeArticle.update({
    where: { id: args.id },
    data: {
      status: "draft",
      lastEditedBy: { connect: { id: args.actorUserId } },
    },
    select: ARTICLE_DETAIL_SELECT,
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.unpublished",
    entityType: "KnowledgeArticle",
    entityId: args.id,
    diff: { status: { old: existing.status, new: "draft" } },
  });
  return updated;
}

export async function deleteArticle(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string },
): Promise<void> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.id },
    select: { id: true, title: true, slug: true },
  });
  if (!existing) throw new KnowledgeNotFoundError();
  await tx.knowledgeArticle.delete({ where: { id: args.id } });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.deleted",
    entityType: "KnowledgeArticle",
    entityId: args.id,
    diff: {
      title: { old: existing.title, new: null },
      slug: { old: existing.slug, new: null },
    },
  });
}

export async function attachTag(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; articleId: string; tagId: string },
): Promise<void> {
  await tx.knowledgeArticleTag.upsert({
    where: { articleId_tagId: { articleId: args.articleId, tagId: args.tagId } },
    update: {},
    create: { articleId: args.articleId, tagId: args.tagId },
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.tag_attached",
    entityType: "KnowledgeArticle",
    entityId: args.articleId,
    diff: { tagId: { old: null, new: args.tagId } },
  });
}

export async function detachTag(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; articleId: string; tagId: string },
): Promise<void> {
  const result = await tx.knowledgeArticleTag.deleteMany({
    where: { articleId: args.articleId, tagId: args.tagId },
  });
  if (result.count === 0) return;
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "knowledge.tag_detached",
    entityType: "KnowledgeArticle",
    entityId: args.articleId,
    diff: { tagId: { old: args.tagId, new: null } },
  });
}

// ===========================================================================
// Wave 2A additions: filtered listing, detail with relations, revision/review
// helpers, and pending-review count.
// ===========================================================================

const ARTICLE_DETAIL_WITH_RELATIONS_SELECT = {
  ...ARTICLE_DETAIL_SELECT,
  kind: true,
  externalSource: true,
  externalUrl: true,
  externalUrlHash: true,
  whyItMatters: true,
  reliabilityTier: true,
  confidenceScore: true,
  lastVerifiedAt: true,
  lastReviewedAt: true,
  currentVersion: true,
  reviewerUserId: true,
  rawInputSnapshot: true,
  aiStructuredSnapshot: true,
  sourceJob: { select: { id: true, publicNumber: true, title: true } },
  sourceWorkReport: { select: { id: true, jobId: true } },
  reviewer: { select: { id: true, displayName: true } },
  lastVerifiedBy: { select: { id: true, displayName: true } },
  revisions: {
    select: {
      id: true,
      version: true,
      title: true,
      summary: true,
      whyItMatters: true,
      authorUserId: true,
      author: { select: { id: true, displayName: true } },
      createdAt: true,
    },
    orderBy: [{ version: "desc" as const }],
    take: 25,
  },
  reviews: {
    select: {
      id: true,
      status: true,
      comment: true,
      cycleNumber: true,
      decidedAt: true,
      createdAt: true,
      reviewerUserId: true,
      reviewer: { select: { id: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" as const }],
    take: 25,
  },
  references: {
    select: {
      id: true,
      kind: true,
      referencedArticle: {
        select: { id: true, slug: true, title: true, status: true },
      },
    },
  },
} satisfies Prisma.KnowledgeArticleSelect;

export type ArticleDetailWithRelationsRow = Prisma.KnowledgeArticleGetPayload<{
  select: typeof ARTICLE_DETAIL_WITH_RELATIONS_SELECT;
}>;

/** Filter shape for the extended `listArticlesFiltered` query. */
export interface ListFilters {
  status?: KnowledgeArticleStatus | KnowledgeArticleStatus[];
  kind?: KnowledgeArticleType | KnowledgeArticleType[];
  tagKeys?: string[];
  authorUserId?: string;
  reviewerUserId?: string;
  /** True = reviewerUserId IS NULL (reviewer queue "Unassigned" tab). */
  reviewerUnassigned?: boolean;
  relatedClientId?: string;
  /** True = the caller's own drafts/pending. */
  myContributions?: boolean;
  /** True = `pending_review` rows where the caller is NOT the author. */
  needsReview?: boolean;
  /** Free-text fragment (LIKE in v1; FTS already exists on title/body). */
  q?: string;
  /**
   * When true the result is ordered by `updatedAt DESC` only (no
   * `id ASC` secondary sort) which is what the reviewer queue's
   * "Closed" tab wants for "most recently touched first" presentation.
   * Defaults to the existing (updatedAt DESC, id ASC) stable order.
   */
  orderByUpdatedAtOnly?: boolean;
}

export interface ListPaging {
  cursor?: string;
  limit?: number;
}

export interface ListArticlesFilteredResult {
  items: ArticleListRow[];
  nextCursor?: string;
}

/** Resolve a single-or-array filter into a Prisma `equals|in` clause. */
function arrayClause<T>(value: T | T[] | undefined): T | { in: T[] } | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return { in: value };
  }
  return value;
}

/**
 * Visibility-aware article listing with filters. Filters compose. Visibility
 * always respects the existing rule: non-admins never see `admin_only`
 * articles and only see `published` for normal browsing; the
 * `myContributions` filter is the one exception that lets non-admins see
 * their own drafts.
 *
 * NOTE: kept as a NEW function rather than replacing the existing
 * `listArticles` so Wave 2B routes can opt in incrementally and the
 * existing `/api/knowledge` GET handler stays untouched.
 */
export async function listArticlesFiltered(
  caller: SessionUser,
  filters: ListFilters,
  paging: ListPaging,
): Promise<ListArticlesFilteredResult> {
  const limit = clampLimit(paging.limit);
  const admin = isAdmin(caller);

  const where: Prisma.KnowledgeArticleWhereInput = {};

  // Visibility / status defaults.
  if (admin) {
    if (filters.status !== undefined) {
      where.status = arrayClause(filters.status);
    }
  } else {
    where.visibility = "internal";
    if (filters.myContributions) {
      // Author sees their own across all non-archived statuses.
      where.authorUserId = caller.id;
      if (filters.status !== undefined) {
        where.status = arrayClause(filters.status);
      } else {
        where.status = { not: "archived" };
      }
    } else if (filters.needsReview) {
      // Reviewer queue: pending_review NOT-own.
      where.status = "pending_review";
      where.authorUserId = { not: caller.id };
    } else if (filters.status !== undefined) {
      // Explicit status filter still honored, but for non-admin we coerce
      // to the published-only stream UNLESS they asked for their own
      // pending_review (handled above).
      where.status = "published";
    } else {
      where.status = "published";
    }
  }

  // Kind, tag, author, reviewer, related-client filters.
  if (filters.kind !== undefined) {
    where.kind = arrayClause(filters.kind);
  }
  if (filters.tagKeys && filters.tagKeys.length > 0) {
    where.tags = { some: { tag: { key: { in: filters.tagKeys } } } };
  }
  if (filters.authorUserId) {
    where.authorUserId = filters.authorUserId;
  }
  if (filters.reviewerUnassigned) {
    where.reviewerUserId = null;
  } else if (filters.reviewerUserId) {
    where.reviewerUserId = filters.reviewerUserId;
  }
  if (filters.relatedClientId) {
    where.relatedClientId = filters.relatedClientId;
  }
  if (filters.q && filters.q.length >= 2) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { summary: { contains: filters.q, mode: "insensitive" } },
      { body: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (paging.cursor) {
    where.id = { gt: paging.cursor };
  }

  const orderBy: Prisma.KnowledgeArticleOrderByWithRelationInput[] = filters.orderByUpdatedAtOnly
    ? [{ updatedAt: "desc" }]
    : [{ updatedAt: "desc" }, { id: "asc" }];

  const rows = await prisma.knowledgeArticle.findMany({
    where,
    select: ARTICLE_LIST_SELECT,
    orderBy,
    take: limit,
  });

  const next = rows.length === limit ? rows[rows.length - 1]?.id : undefined;
  const result: ListArticlesFilteredResult = { items: rows };
  if (next) result.nextCursor = next;
  return result;
}

/**
 * Detail fetch with the relations every Wave 2B route needs. Returns
 * `null` for both "not found" and "not visible to this caller" so the
 * route handler folds both cases into a 404.
 */
export async function getArticleDetail(
  caller: SessionUser,
  slug: string,
): Promise<ArticleDetailWithRelationsRow | null> {
  const row = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: ARTICLE_DETAIL_WITH_RELATIONS_SELECT,
  });
  if (!row) return null;
  if (!isAdmin(caller)) {
    if (row.visibility === "admin_only") return null;
    if (row.status === "archived") return null;
    if (row.status !== "published") {
      // Authors and reviewers may see non-published rows tied to them.
      if (row.author?.id !== caller.id && row.reviewer?.id !== caller.id) {
        return null;
      }
    }
  }
  return row;
}

/**
 * Atomically:
 *   1. Insert into `knowledge_article_revisions` (version = currentVersion + 1).
 *   2. Update `knowledge_articles` (title, body, summary, whyItMatters,
 *      currentVersion = new version).
 *   3. Write an audit row keyed `knowledge.article.revision_created`.
 *
 * Used by both the regular edit-draft path AND the AI-structuring path
 * that overwrites a draft.
 */
export async function writeRevision(
  tx: Prisma.TransactionClient,
  args: {
    articleId: string;
    actorUserId: string;
    title: string;
    body: string;
    summary: string | null;
    whyItMatters: string | null;
  },
): Promise<{ version: number }> {
  const existing = await tx.knowledgeArticle.findUnique({
    where: { id: args.articleId },
    select: { id: true, currentVersion: true },
  });
  if (!existing) throw new KnowledgeNotFoundError();

  const nextVersion = (existing.currentVersion ?? 1) + 1;

  await tx.knowledgeArticleRevision.create({
    data: {
      articleId: args.articleId,
      version: nextVersion,
      title: args.title,
      body: args.body,
      summary: args.summary,
      whyItMatters: args.whyItMatters,
      authorUserId: args.actorUserId,
    },
  });

  await tx.knowledgeArticle.update({
    where: { id: args.articleId },
    data: {
      title: args.title,
      body: args.body,
      summary: args.summary,
      whyItMatters: args.whyItMatters,
      currentVersion: nextVersion,
      lastEditedBy: { connect: { id: args.actorUserId } },
    },
  });

  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_REVISION_CREATED,
    entityType: "KnowledgeArticle",
    entityId: args.articleId,
    diff: {
      version: { old: existing.currentVersion ?? 1, new: nextVersion },
      title: { old: "(omitted)", new: "(updated)" },
      body: { old: "(omitted)", new: "(updated)" },
    },
  });

  return { version: nextVersion };
}

/**
 * Open a new review cycle. Cycle number = (max existing cycleNumber on
 * this article) + 1, defaulting to 1 for the first review.
 */
export async function openReview(
  tx: Prisma.TransactionClient,
  args: { articleId: string; reviewerUserId: string },
): Promise<{ id: string; cycleNumber: number }> {
  const latest = await tx.knowledgeArticleReview.findFirst({
    where: { articleId: args.articleId },
    orderBy: { cycleNumber: "desc" },
    select: { cycleNumber: true },
  });
  const cycleNumber = (latest?.cycleNumber ?? 0) + 1;

  const created = await tx.knowledgeArticleReview.create({
    data: {
      articleId: args.articleId,
      reviewerUserId: args.reviewerUserId,
      status: "pending",
      cycleNumber,
    },
    select: { id: true, cycleNumber: true },
  });

  // Mirror the head pointer on the article so the queue UI can show it.
  await tx.knowledgeArticle.update({
    where: { id: args.articleId },
    data: { reviewerUserId: args.reviewerUserId },
  });

  return created;
}

export class KnowledgeReviewNotFoundError extends Error {
  constructor() {
    super("No open review found for this article");
    this.name = "KnowledgeReviewNotFoundError";
  }
}

export class KnowledgeReviewWrongActorError extends Error {
  constructor() {
    super("Caller is not the assigned reviewer for the open review");
    this.name = "KnowledgeReviewWrongActorError";
  }
}

/**
 * Close the latest pending review of an article with a decision. Throws
 * `KnowledgeReviewNotFoundError` when there is no open review and
 * `KnowledgeReviewWrongActorError` when the caller is not the assigned
 * reviewer (admins can pass any user id to override; the route handler
 * decides whether to allow that).
 */
export async function decideReview(
  tx: Prisma.TransactionClient,
  args: {
    articleId: string;
    reviewerUserId: string;
    decision: KnowledgeArticleReviewStatus;
    comment?: string;
  },
): Promise<void> {
  if (args.decision === "pending") {
    throw new Error("decideReview cannot set status back to pending");
  }
  const open = await tx.knowledgeArticleReview.findFirst({
    where: { articleId: args.articleId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, reviewerUserId: true },
  });
  if (!open) throw new KnowledgeReviewNotFoundError();
  if (open.reviewerUserId !== args.reviewerUserId) {
    throw new KnowledgeReviewWrongActorError();
  }
  await tx.knowledgeArticleReview.update({
    where: { id: open.id },
    data: {
      status: args.decision,
      comment: args.comment ?? null,
      decidedAt: new Date(),
    },
  });
}

/** Pending review count for the nav badge. Reviewers see "queue size minus my own". */
export async function pendingReviewCount(caller: SessionUser): Promise<number> {
  if (isAdmin(caller)) {
    return prisma.knowledgeArticle.count({
      where: {
        status: "pending_review",
        authorUserId: { not: caller.id },
      },
    });
  }
  // Non-admins do not have a review queue in V1 per the permissions matrix.
  return 0;
}
