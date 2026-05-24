import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { attachTag, detachTag } from "@/lib/knowledge/queries";

interface Params {
  params: Promise<{ slug: string }>;
}

const bodySchema = z.object({
  tagId: z.string().uuid(),
});

/** POST — admin attaches a tag to the article. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!article) return notFound("Article");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const tag = await prisma.tag.findUnique({
    where: { id: parsed.data.tagId },
    select: { id: true },
  });
  if (!tag) return notFound("Tag");

  await prisma.$transaction((tx) =>
    attachTag(tx, {
      actorUserId: auth.user.id,
      articleId: article.id,
      tagId: parsed.data.tagId,
    }),
  );
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({
  tagId: z.string().uuid(),
});

/** DELETE — admin removes a tag from the article. */
export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!article) return notFound("Article");

  const { searchParams } = new URL(req.url);
  let tagId = searchParams.get("tagId");
  if (!tagId) {
    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues);
    tagId = parsed.data.tagId;
  } else {
    const parsed = deleteSchema.safeParse({ tagId });
    if (!parsed.success) return badRequest(parsed.error.issues);
  }

  await prisma.$transaction((tx) =>
    detachTag(tx, { actorUserId: auth.user.id, articleId: article.id, tagId: tagId! }),
  );
  return NextResponse.json({ ok: true });
}
