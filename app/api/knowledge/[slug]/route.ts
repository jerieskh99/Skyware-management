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
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  deleteArticle,
  getArticleDetail,
  KnowledgeNotFoundError,
  writeRevision,
} from "@/lib/knowledge/queries";
import { canEditDraft } from "@/lib/knowledge/permissions";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import {
  canonicalizeUrl,
  hashCanonicalUrl,
  InvalidExternalUrlError,
} from "@/lib/knowledge/url";
import { writeAudit } from "@/lib/audit";

const VISIBILITY_VALUES = ["internal", "admin_only"] as const;

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

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * GET — visibility-aware article fetch. Non-admins only see published rows
 * with `visibility = internal`, except they may see their own non-published
 * articles per the `getArticleDetail` rules.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const article = await getArticleDetail(auth.user, slug);
  if (!article) return notFound("Article");
  return NextResponse.json(article);
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(50_000).optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  whyItMatters: z.string().trim().max(2_000).nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  relatedClientId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().uuid()).max(20).optional(),
  // Wave 3: widen PATCH so authors can fix the kind / reliability tier /
  // external source / external URL while the article is still a draft.
  // Mutating these after publish is a state-machine violation per the
  // product strategy doc; the route handler enforces those rules below.
  kind: z.enum(KIND_VALUES).optional(),
  reliabilityTier: z.enum(RELIABILITY_VALUES).optional(),
  externalSource: z.string().trim().max(200).nullable().optional(),
  externalUrl: z.string().trim().max(2_000).nullable().optional(),
});

/**
 * PATCH — author (or admin) edits a draft / ai_structured article.
 *
 * When any of `title`, `body`, `summary`, or `whyItMatters` change, we
 * append a new revision via `writeRevision` so history is preserved.
 * The single audit row covers both `ARTICLE_UPDATED` and the implicit
 * `ARTICLE_REVISION_CREATED` (the latter written by `writeRevision`
 * itself).
 *
 * Side-effect fields (visibility, relatedClientId, kind, reliabilityTier,
 * externalSource, externalUrl, tags) are applied without creating a new
 * revision. State-machine guards:
 *   - `kind` and `externalUrl` may only change on draft / ai_structured.
 *   - `reliabilityTier` is admin-only.
 *   - Changing `externalUrl` re-runs canonicalize + duplicate check.
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      body: true,
      summary: true,
      whyItMatters: true,
      visibility: true,
      relatedClientId: true,
      status: true,
      authorUserId: true,
      kind: true,
      reliabilityTier: true,
      externalSource: true,
      externalUrl: true,
      externalUrlHash: true,
    },
  });
  if (!existing) return notFound("Article");

  if (!canEditDraft(auth.user, existing)) {
    if (existing.status !== "draft" && existing.status !== "ai_structured") {
      return unprocessable(
        `Article cannot be edited while in status '${existing.status}'`,
      );
    }
    return forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const patch = parsed.data;

  // ── State-machine guards on widened fields ────────────────────────────
  // Changing `kind` on a published article is a state-machine violation;
  // the same applies to mutating the `externalUrl` of a published external
  // reference (the canonical URL is identity for dedup). Authors must
  // create a new article instead. Since canEditDraft already gates to
  // draft / ai_structured, these branches are belt-and-suspenders.
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    if (existing.status !== "draft" && existing.status !== "ai_structured") {
      return unprocessable(
        "Article kind can only be changed while the article is a draft.",
      );
    }
  }
  if (
    patch.externalUrl !== undefined &&
    (patch.externalUrl ?? null) !== (existing.externalUrl ?? null)
  ) {
    if (existing.status !== "draft" && existing.status !== "ai_structured") {
      return unprocessable(
        "External URL can only be changed while the article is a draft.",
      );
    }
  }
  // Reliability tier is admin-only: it represents an editorial judgement
  // about trustworthiness, not an author claim. Non-admin requests to
  // change it silently fall through with a 403.
  if (
    patch.reliabilityTier !== undefined &&
    patch.reliabilityTier !== existing.reliabilityTier &&
    !isAdmin(auth.user)
  ) {
    return forbidden();
  }

  // ── External URL canonicalize + duplicate check (if changed) ────────
  let nextExternalUrl: string | null | undefined = undefined;
  let nextExternalUrlHash: string | null | undefined = undefined;
  if (patch.externalUrl !== undefined) {
    if (patch.externalUrl === null || patch.externalUrl === "") {
      nextExternalUrl = null;
      nextExternalUrlHash = null;
    } else {
      try {
        nextExternalUrl = canonicalizeUrl(patch.externalUrl);
        nextExternalUrlHash = hashCanonicalUrl(patch.externalUrl);
      } catch (err) {
        if (err instanceof InvalidExternalUrlError) {
          return badRequest([{ code: "external_bad_url", message: err.message }]);
        }
        throw err;
      }
      if (nextExternalUrlHash && nextExternalUrlHash !== existing.externalUrlHash) {
        const dup = await prisma.knowledgeArticle.findFirst({
          where: {
            externalUrlHash: nextExternalUrlHash,
            status: { not: "archived" },
            id: { not: existing.id },
          },
          select: { slug: true, id: true, title: true },
        });
        if (dup) {
          // Canonical 409 shape: `{ error, existing: { id, slug } }`. Matches
          // the POST handler so the frontend can use one parser for both.
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
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const contentChanged =
        (patch.title !== undefined && patch.title !== existing.title) ||
        (patch.body !== undefined && patch.body !== existing.body) ||
        (patch.summary !== undefined && (patch.summary ?? null) !== existing.summary) ||
        (patch.whyItMatters !== undefined &&
          (patch.whyItMatters ?? null) !== existing.whyItMatters);

      if (contentChanged) {
        await writeRevision(tx, {
          articleId: existing.id,
          actorUserId: auth.user.id,
          title: patch.title ?? existing.title,
          body: patch.body ?? existing.body,
          summary:
            patch.summary === undefined ? existing.summary : (patch.summary ?? null),
          whyItMatters:
            patch.whyItMatters === undefined
              ? existing.whyItMatters
              : (patch.whyItMatters ?? null),
        });
      }

      // Apply non-content fields (visibility, related client, kind,
      // reliability, external source/URL, tags) directly without spinning
      // a new revision.
      const sideEffects: Record<string, { old: unknown; new: unknown }> = {};
      const sideEffectsData: Record<string, unknown> = {};
      if (
        patch.visibility !== undefined &&
        patch.visibility !== existing.visibility
      ) {
        sideEffectsData["visibility"] = patch.visibility;
        sideEffects["visibility"] = { old: existing.visibility, new: patch.visibility };
      }
      if (
        patch.relatedClientId !== undefined &&
        (patch.relatedClientId ?? null) !== existing.relatedClientId
      ) {
        sideEffectsData["relatedClientId"] = patch.relatedClientId ?? null;
        sideEffects["relatedClientId"] = {
          old: existing.relatedClientId,
          new: patch.relatedClientId ?? null,
        };
      }
      if (patch.kind !== undefined && patch.kind !== existing.kind) {
        sideEffectsData["kind"] = patch.kind;
        sideEffects["kind"] = { old: existing.kind, new: patch.kind };
      }
      if (
        patch.reliabilityTier !== undefined &&
        patch.reliabilityTier !== existing.reliabilityTier
      ) {
        sideEffectsData["reliabilityTier"] = patch.reliabilityTier;
        sideEffects["reliabilityTier"] = {
          old: existing.reliabilityTier,
          new: patch.reliabilityTier,
        };
      }
      if (
        patch.externalSource !== undefined &&
        (patch.externalSource ?? null) !== existing.externalSource
      ) {
        sideEffectsData["externalSource"] = patch.externalSource ?? null;
        sideEffects["externalSource"] = {
          old: existing.externalSource,
          new: patch.externalSource ?? null,
        };
      }
      if (nextExternalUrl !== undefined) {
        sideEffectsData["externalUrl"] = nextExternalUrl;
        sideEffectsData["externalUrlHash"] = nextExternalUrlHash;
        sideEffects["externalUrl"] = {
          old: existing.externalUrl,
          new: nextExternalUrl,
        };
      }
      if (Object.keys(sideEffectsData).length > 0) {
        await tx.knowledgeArticle.update({
          where: { id: existing.id },
          data: { ...sideEffectsData, lastEditedByUserId: auth.user.id },
        });
      }

      if (patch.tags) {
        await tx.knowledgeArticleTag.deleteMany({ where: { articleId: existing.id } });
        if (patch.tags.length > 0) {
          await tx.knowledgeArticleTag.createMany({
            data: patch.tags.map((tagId: string) => ({
              articleId: existing.id,
              tagId,
            })),
            skipDuplicates: true,
          });
        }
        sideEffects["tags"] = { old: null, new: patch.tags };
      }

      if (contentChanged || Object.keys(sideEffects).length > 0) {
        const diff: Record<string, { old: unknown; new: unknown }> = {
          ...sideEffects,
        };
        if (contentChanged) {
          diff["content"] = { old: "(omitted)", new: "(updated)" };
        }
        await writeAudit(tx, {
          actorUserId: auth.user.id,
          action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_UPDATED,
          entityType: "KnowledgeArticle",
          entityId: existing.id,
          diff,
        });
      }

      return getArticleDetail(auth.user, slug);
    });

    if (!updated) return notFound("Article");
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof KnowledgeNotFoundError) return notFound("Article");
    throw e;
  }
}

/**
 * DELETE — hard delete only allowed when:
 *   - status is `draft`, AND
 *   - caller is admin OR is the article author.
 *
 * Anything published / approved / pending goes through archive instead.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true, status: true, authorUserId: true },
  });
  if (!existing) return notFound("Article");

  if (existing.status !== "draft") {
    return unprocessable(
      `Article can only be deleted while in status 'draft' (current: '${existing.status}')`,
    );
  }

  const caller = auth.user;
  if (!isAdmin(caller) && existing.authorUserId !== caller.id) {
    return forbidden();
  }

  try {
    await prisma.$transaction((tx) =>
      deleteArticle(tx, { actorUserId: caller.id, id: existing.id }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof KnowledgeNotFoundError) return notFound("Article");
    throw e;
  }
}
