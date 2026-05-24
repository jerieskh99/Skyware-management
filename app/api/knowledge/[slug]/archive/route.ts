import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  archiveArticle,
  KnowledgeNotFoundError,
} from "@/lib/knowledge/queries";

interface Params {
  params: Promise<{ slug: string }>;
}

/** POST — admin sets status=archived. The row is hidden from list and search. */
export async function POST(_req: Request, { params }: Params) {
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
    const updated = await prisma.$transaction((tx) =>
      archiveArticle(tx, { actorUserId: auth.user.id, id: existing.id }),
    );
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof KnowledgeNotFoundError) return notFound("Article");
    throw e;
  }
}
