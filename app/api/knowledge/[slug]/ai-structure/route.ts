import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canRunAiStructure } from "@/lib/knowledge/permissions";
import { isAllowedTransition } from "@/lib/knowledge/state-machine";
import {
  aiStructure,
  AiStructureIneligibleError,
} from "@/lib/knowledge/ai-structure";
import { writeRevision } from "@/lib/knowledge/queries";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";
import {
  checkRateLimit,
  getClientIp,
  LIMITS,
  tooManyRequests,
} from "@/lib/rate-limit";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/knowledge/[slug]/ai-structure
 *
 * Runs the (V1 deterministic dry-run) AI structuring helper over the
 * article body. Stashes the structured snapshot on the article, copies
 * the original body into `rawInputSnapshot` (first time only), and
 * transitions the article to `ai_structured`. A new revision row is
 * appended so the diff with the previous version is visible.
 *
 * Rate-limited per IP (5/hour) so a runaway UI loop cannot DOS the
 * secrets scanner.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  // Rate limit per IP only (not per IP+user). A coordinated abuse attempt
  // can already cycle through user IDs cheaply; pinning the cap to the IP
  // tightens the budget against runaway scripts.
  const ip = getClientIp(req);
  if (checkRateLimit(`knowledge-ai:${ip}`, LIMITS.knowledgeAi)) {
    return tooManyRequests();
  }

  const { slug } = await params;

  const existing = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      body: true,
      kind: true,
      status: true,
      authorUserId: true,
      summary: true,
      whyItMatters: true,
      rawInputSnapshot: true,
      sourceJob: {
        select: {
          publicNumber: true,
          title: true,
          client: { select: { companyName: true } },
        },
      },
    },
  });
  if (!existing) return notFound("Article");

  if (!canRunAiStructure(auth.user, existing)) return forbidden();
  if (!isAllowedTransition(existing.status, "ai_structured")) {
    return unprocessable(
      `Article cannot be AI-structured from status '${existing.status}'`,
    );
  }

  let result;
  try {
    result = await aiStructure({
      title: existing.title,
      rawBody: existing.body,
      kind: existing.kind,
      sourceContext: existing.sourceJob
        ? {
            ...(existing.sourceJob.publicNumber
              ? { jobPublicNumber: existing.sourceJob.publicNumber }
              : {}),
            ...(existing.sourceJob.title ? { jobTitle: existing.sourceJob.title } : {}),
            ...(existing.sourceJob.client?.companyName
              ? { clientCompanyName: existing.sourceJob.client.companyName }
              : {}),
          }
        : null,
    });
  } catch (err) {
    if (err instanceof AiStructureIneligibleError) {
      // Surface a stable machine-readable code so the UI can render a
      // localized message without parsing free-form prose.
      return NextResponse.json(
        {
          error: "ai_ineligible_kind",
          message: `AI structuring is not available for article kind '${err.kind}'`,
          kind: err.kind,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  const next = await prisma.$transaction(async (tx) => {
    // Append a revision capturing the structured output so the version
    // history shows the transition. `writeRevision` also writes its own
    // ARTICLE_REVISION_CREATED audit row.
    await writeRevision(tx, {
      articleId: existing.id,
      actorUserId: auth.user.id,
      title: result.title,
      body: result.body,
      summary: result.summary,
      whyItMatters: result.whyItMatters,
    });

    await tx.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        status: "ai_structured",
        aiStructuredSnapshot: result as unknown as object,
        rawInputSnapshot: existing.rawInputSnapshot ?? existing.body,
        lastEditedByUserId: auth.user.id,
      },
    });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_AI_STRUCTURED,
      entityType: "KnowledgeArticle",
      entityId: existing.id,
      diff: {
        status: { old: existing.status, new: "ai_structured" },
        mode: { old: null, new: result.mode },
        redactionCount: { old: null, new: result.redactionCount },
        suggestedTags: { old: null, new: result.suggestedTags },
      },
    });

    return result;
  });

  return NextResponse.json(next);
}
