import type {
  KnowledgeArticleStatus,
  KnowledgeArticleVisibility,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { slugify } from "./slug";

const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  status: true,
  visibility: true,
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
