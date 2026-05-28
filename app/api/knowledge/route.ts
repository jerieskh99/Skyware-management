import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { listArticlesFiltered } from "@/lib/knowledge/queries";
import { canCreateArticle, canCreateKindAs } from "@/lib/knowledge/permissions";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import {
  canonicalizeUrl,
  hashCanonicalUrl,
  InvalidExternalUrlError,
} from "@/lib/knowledge/url";
import { slugify } from "@/lib/knowledge/slug";
import { writeAudit } from "@/lib/audit";

const STATUS_VALUES = [
  "draft",
  "ai_structured",
  "pending_review",
  "approved",
  "published",
  "archived",
] as const;

const KIND_VALUES = [
  "internal_task_lesson",
  "external_reference",
  "how_to_guide",
  "troubleshooting_note",
  "architecture_decision",
  "process_policy_note",
] as const;

const RELIABILITY_VALUES = [
  "verified",
  "validated",
  "single_source",
  "anecdotal",
] as const;

/**
 * Default reliability tier per article kind, per the product strategy doc.
 * Architecture decisions carry more org weight and ship at `validated`; the
 * rest start at `single_source` and earn `validated` / `verified` only via
 * the review workflow. Client-supplied tiers on the create body take
 * precedence over this default.
 */
const DEFAULT_RELIABILITY_BY_KIND: Record<
  (typeof KIND_VALUES)[number],
  (typeof RELIABILITY_VALUES)[number]
> = {
  internal_task_lesson: "single_source",
  external_reference: "single_source",
  how_to_guide: "single_source",
  troubleshooting_note: "single_source",
  architecture_decision: "validated",
  process_policy_note: "single_source",
};

const VISIBILITY_VALUES = ["internal", "admin_only"] as const;

const listQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  kind: z.enum(KIND_VALUES).optional(),
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(80).optional(),
  myContributions: z.coerce.boolean().optional(),
  needsReview: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/knowledge — list articles.
 *
 * Extends the V0 endpoint with:
 *   - `kind` filter (single value),
 *   - `myContributions` (caller's own drafts/pending_review),
 *   - `needsReview` (pending_review queue, excludes caller's own articles),
 *   - `q` free-text fragment search.
 *
 * Visibility defaults still apply: non-admins only see `published`+`internal`
 * unless they pass `myContributions` (their own drafts) or `needsReview`
 * (Phase 2 reviewers; V1 admins only via `canReview`).
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    kind: searchParams.get("kind") ?? undefined,
    q: searchParams.get("q")?.trim() || undefined,
    tag: searchParams.get("tag") || undefined,
    myContributions: searchParams.get("myContributions") ?? undefined,
    needsReview: searchParams.get("needsReview") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.issues);

  const page = await listArticlesFiltered(
    auth.user,
    {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
      ...(parsed.data.tag ? { tagKeys: [parsed.data.tag] } : {}),
      ...(parsed.data.q ? { q: parsed.data.q } : {}),
      ...(parsed.data.myContributions ? { myContributions: true } : {}),
      ...(parsed.data.needsReview ? { needsReview: true } : {}),
    },
    {
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    },
  );

  return NextResponse.json(page);
}

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  kind: z.enum(KIND_VALUES),
  summary: z.string().trim().max(400).optional(),
  whyItMatters: z.string().trim().max(2_000).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  relatedClientId: z.string().uuid().optional(),
  sourceJobId: z.string().uuid().optional(),
  sourceWorkReportId: z.string().uuid().optional(),
  externalSource: z.string().trim().max(200).optional(),
  externalUrl: z.string().trim().max(2_000).optional(),
  reliabilityTier: z.enum(RELIABILITY_VALUES).optional(),
});

/**
 * POST /api/knowledge — create a draft article.
 *
 * Any signed-in user may create a draft (per `canCreateArticle`). Some
 * kinds are admin-only (process_policy_note, architecture_decision); the
 * `canCreateKindAs` predicate enforces that.
 *
 * For external references we canonicalize + hash the URL and reject
 * duplicates with a 409 that carries the existing article's slug so the
 * UI can offer "open existing" instead of forcing the user to retype.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canCreateArticle(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const body = await req.json().catch(() => null);
  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  if (!canCreateKindAs(auth.user, parsed.data.kind)) return forbidden();

  // External URL canonicalize + duplicate check.
  let externalUrlCanonical: string | null = null;
  let externalUrlHash: string | null = null;
  if (parsed.data.externalUrl) {
    try {
      externalUrlCanonical = canonicalizeUrl(parsed.data.externalUrl);
      externalUrlHash = hashCanonicalUrl(parsed.data.externalUrl);
    } catch (err) {
      if (err instanceof InvalidExternalUrlError) {
        return badRequest([{ code: "external_bad_url", message: err.message }]);
      }
      throw err;
    }
    const dup = await prisma.knowledgeArticle.findFirst({
      where: { externalUrlHash, status: { not: "archived" } },
      select: { slug: true, id: true, title: true },
    });
    if (dup) {
      // Canonical 409 shape: `{ error, existing: { id, slug } }`. The
      // frontend reads `data.existing.slug` to surface a deep link to the
      // already-saved article. See `components/knowledge/ArticleEditor.tsx`.
      return NextResponse.json(
        {
          error: "duplicate_external_url",
          message: "An article already references this URL.",
          existing: { id: dup.id, slug: dup.slug },
        },
        { status: 409 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    // Generate a unique slug. Lightweight inline since `lib/knowledge/queries.ts`
    // keeps its helper private; same algorithm.
    const slug = await generateUniqueSlug(tx, parsed.data.title);

    const row = await tx.knowledgeArticle.create({
      data: {
        slug,
        title: parsed.data.title,
        body: parsed.data.body,
        kind: parsed.data.kind,
        summary: parsed.data.summary ?? null,
        whyItMatters: parsed.data.whyItMatters ?? null,
        visibility: parsed.data.visibility ?? "internal",
        relatedClientId: parsed.data.relatedClientId ?? null,
        sourceJobId: parsed.data.sourceJobId ?? null,
        sourceWorkReportId: parsed.data.sourceWorkReportId ?? null,
        externalSource: parsed.data.externalSource ?? null,
        externalUrl: externalUrlCanonical,
        externalUrlHash,
        reliabilityTier:
          parsed.data.reliabilityTier ??
          DEFAULT_RELIABILITY_BY_KIND[parsed.data.kind],
        authorUserId: auth.user.id,
        lastEditedByUserId: auth.user.id,
        status: "draft",
        currentVersion: 1,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
        status: true,
      },
    });

    // Write the v1 revision so history starts on row 1. We do NOT call
    // `writeRevision` (which would bump to v2) because the article is
    // already at v1; instead we write the row directly.
    await tx.knowledgeArticleRevision.create({
      data: {
        articleId: row.id,
        version: 1,
        title: parsed.data.title,
        body: parsed.data.body,
        summary: parsed.data.summary ?? null,
        whyItMatters: parsed.data.whyItMatters ?? null,
        authorUserId: auth.user.id,
      },
    });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_CREATED,
      entityType: "KnowledgeArticle",
      entityId: row.id,
      diff: {
        title: { old: null, new: parsed.data.title },
        slug: { old: null, new: slug },
        kind: { old: null, new: parsed.data.kind },
        sourceJobId: { old: null, new: parsed.data.sourceJobId ?? null },
        externalUrl: { old: null, new: externalUrlCanonical },
      },
    });

    return row;
  });

  return NextResponse.json(created, { status: 201 });
}

/** Local copy of the slug-uniqueness loop that `lib/knowledge/queries.ts` keeps private. */
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

