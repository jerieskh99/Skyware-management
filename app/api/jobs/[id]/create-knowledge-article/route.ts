import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  badRequest,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  canCreateFromJob,
  canCreateKindAs,
} from "@/lib/knowledge/permissions";
import { KNOWLEDGE_AUDIT_ACTIONS } from "@/lib/knowledge/audit-actions";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/knowledge/slug";

interface Params {
  params: Promise<{ id: string }>;
}

const KIND_VALUES = [
  "internal_task_lesson",
  "external_reference",
  "how_to_guide",
  "troubleshooting_note",
  "architecture_decision",
  "process_policy_note",
] as const;

const bodySchema = z.object({
  kind: z.enum(KIND_VALUES).optional(),
});

/**
 * POST /api/jobs/[id]/create-knowledge-article
 *
 * Pre-fills a knowledge article draft from a completed (or reviewed) job
 * so the assignee can capture the lesson while it is fresh. Defaults to
 * `internal_task_lesson`; other kinds may be passed in via the body.
 *
 * Requires the job to be in `done` or `reviewed` status and the caller
 * to be the assignee or an admin (per `canCreateFromJob`).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      publicNumber: true,
      title: true,
      status: true,
      assignedEmployeeId: true,
      workReport: {
        select: { id: true, summary: true },
      },
    },
  });
  if (!job) return notFound("Job");
  if (!canCreateFromJob(auth.user, job)) return forbidden();
  if (job.status !== "done" && job.status !== "reviewed") {
    return unprocessable(
      `Job must be in 'done' or 'reviewed' to spawn an article (current: '${job.status}')`,
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return badRequest(parsed.error.issues);
  const kind = parsed.data.kind ?? "internal_task_lesson";

  if (!canCreateKindAs(auth.user, kind)) return forbidden();

  // Idempotency: if a knowledge article already exists for this job AND
  // kind, surface the existing row instead of creating a duplicate. The
  // UI's "Create knowledge article" button is a one-click action and
  // double-submissions (impatient click, network retry) used to mint two
  // sibling drafts. Same kind matters because authors may legitimately
  // spawn both a `troubleshooting_note` and a `how_to_guide` from one job.
  const existingForJob = await prisma.knowledgeArticle.findFirst({
    where: { sourceJobId: job.id, kind },
    select: { id: true, slug: true },
  });
  if (existingForJob) {
    return NextResponse.json(
      { existing: true, id: existingForJob.id, slug: existingForJob.slug },
      { status: 200 },
    );
  }

  const title =
    `Lesson from job ${job.publicNumber}: ` +
    job.title.slice(0, 80);
  const workReportSummary = job.workReport?.summary ?? "";
  const articleBody =
    "Problem\n-------\n\n\nCause\n-----\n\n\nFix\n---\n\n" +
    workReportSummary +
    "\n\nVerification\n------------\n\n";
  const summary = job.title.slice(0, 240);

  const created = await prisma.$transaction(async (tx) => {
    const slug = await generateUniqueSlugFromJob(tx, job.publicNumber);

    const row = await tx.knowledgeArticle.create({
      data: {
        slug,
        title,
        body: articleBody,
        summary,
        kind,
        status: "draft",
        visibility: "internal",
        sourceJobId: job.id,
        sourceWorkReportId: job.workReport?.id ?? null,
        reliabilityTier: "single_source",
        authorUserId: auth.user.id,
        lastEditedByUserId: auth.user.id,
        currentVersion: 1,
      },
      select: { id: true, slug: true },
    });

    await tx.knowledgeArticleRevision.create({
      data: {
        articleId: row.id,
        version: 1,
        title,
        body: articleBody,
        summary,
        whyItMatters: null,
        authorUserId: auth.user.id,
      },
    });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: KNOWLEDGE_AUDIT_ACTIONS.ARTICLE_CREATED,
      entityType: "KnowledgeArticle",
      entityId: row.id,
      diff: {
        title: { old: null, new: title },
        slug: { old: null, new: slug },
        kind: { old: null, new: kind },
        sourceJobId: { old: null, new: job.id },
        sourceWorkReportId: { old: null, new: job.workReport?.id ?? null },
      },
    });

    return row;
  });

  return NextResponse.json(created, { status: 201 });
}

/**
 * Slug = `lesson-<slugified-publicNumber>-<5-char-suffix>`. The suffix
 * is recomputed on collision so the slug is unique without a fancy
 * counter.
 */
async function generateUniqueSlugFromJob(
  tx: Prisma.TransactionClient,
  jobPublicNumber: string,
): Promise<string> {
  const baseId = slugify(jobPublicNumber) || "job";
  let attempt = 0;
  while (attempt < 5) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const candidate = `lesson-${baseId}-${suffix}`;
    const existing = await tx.knowledgeArticle.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    attempt += 1;
  }
  // Pathological collision: append millis as a tiebreaker.
  const suffix = Date.now().toString(36);
  return `lesson-${baseId}-${suffix}`;
}
