import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  createArticle,
  listArticles,
} from "@/lib/knowledge/queries";
import type { KnowledgeArticleStatus } from "@prisma/client";

const STATUS_VALUES = ["draft", "published", "archived"] as const;
const VISIBILITY_VALUES = ["internal", "admin_only"] as const;

const listQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/knowledge — list articles.
 * Any logged-in user. Non-admin: visibility=internal, status=published only.
 * Admin: may pass `?status=draft|archived` for other states; default is non-archived.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q")?.trim() || undefined,
    tag: searchParams.get("tag") || undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.issues);

  const viewerIsAdmin = isAdmin(auth.user);
  let status: KnowledgeArticleStatus | undefined = parsed.data.status;
  if (!viewerIsAdmin) status = "published";

  const page = await listArticles({
    status,
    q: parsed.data.q,
    tag: parsed.data.tag,
    viewerIsAdmin,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor ?? null,
  });

  return NextResponse.json(page);
}

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  summary: z.string().trim().max(400).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  relatedClientId: z.string().uuid().optional(),
});

/** POST /api/knowledge — admin creates a draft article. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const body = await req.json().catch(() => null);
  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const created = await prisma.$transaction((tx) =>
    createArticle(tx, {
      actorUserId: auth.user.id,
      input: {
        title: parsed.data.title,
        body: parsed.data.body,
        summary: parsed.data.summary ?? null,
        visibility: parsed.data.visibility ?? "internal",
        relatedClientId: parsed.data.relatedClientId ?? null,
      },
    }),
  );

  return NextResponse.json(created, { status: 201 });
}
