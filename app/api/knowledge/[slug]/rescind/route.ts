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
import { getFeatureFlag } from "@/lib/feature-flags";
import { canRescind } from "@/lib/knowledge/permissions";
import { isAllowedTransition } from "@/lib/knowledge/state-machine";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";

interface Params {
  params: Promise<{ slug: string }>;
}

const bodySchema = z.object({
  reason: z.string().trim().max(2_000).optional(),
});

/**
 * POST /api/knowledge/[slug]/rescind
 *
 * Strong takedown of a published article. V1 maps rescind to the same
 * `archived` end-state as the regular archive route; the audit row carries
 * the `ARTICLE_RESCINDED` action and the rescission note so the distinction
 * is preserved without a separate column. UI may render rescinded articles
 * as 410 Gone (this is a Wave 2C concern).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canRescind(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { slug } = await params;

  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!existing) return notFound("Article");

  if (existing.status !== "published") {
    return unprocessable(
      `Article can only be rescinded from status 'published' (current: '${existing.status}')`,
    );
  }
  if (!isAllowedTransition(existing.status, "archived")) {
    return unprocessable(
      `Article cannot transition from '${existing.status}' to 'archived'`,
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        status: "archived",
        lastEditedByUserId: auth.user.id,
      },
      select: { id: true, slug: true, title: true, status: true },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_RESCINDED,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: {
        status: { old: existing.status, new: "archived" },
        reason: { old: null, new: parsed.data.reason ?? null },
      },
    });
    return u;
  });

  return NextResponse.json(updated);
}
