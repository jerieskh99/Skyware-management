import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  deleteArticle,
  getArticleBySlug,
  KnowledgeNotFoundError,
  updateArticle,
} from "@/lib/knowledge/queries";

const VISIBILITY_VALUES = ["internal", "admin_only"] as const;

interface Params {
  params: Promise<{ slug: string }>;
}

/** GET — visibility-aware article fetch. Non-admins never see admin_only or non-published rows. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const article = await getArticleBySlug(slug, isAdmin(auth.user));
  if (!article) return notFound("Article");
  return NextResponse.json(article);
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(50_000).optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  relatedClientId: z.string().uuid().nullable().optional(),
  regenerateSlug: z.boolean().optional(),
});

/** PATCH — admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) return notFound("Article");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  try {
    const updated = await prisma.$transaction((tx) =>
      updateArticle(tx, {
        actorUserId: auth.user.id,
        id: existing.id,
        patch: parsed.data,
      }),
    );
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof KnowledgeNotFoundError) return notFound("Article");
    throw e;
  }
}

/** DELETE — admin only, hard delete + audit. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) return notFound("Article");

  try {
    await prisma.$transaction((tx) =>
      deleteArticle(tx, { actorUserId: auth.user.id, id: existing.id }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof KnowledgeNotFoundError) return notFound("Article");
    throw e;
  }
}
