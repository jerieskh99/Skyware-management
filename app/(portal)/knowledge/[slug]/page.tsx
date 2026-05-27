import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { ArticleKindChip } from "@/components/knowledge/ArticleKindChip";
import { ArticleStatusChip } from "@/components/knowledge/ArticleStatusChip";
import { ArticleSidebarMeta } from "@/components/knowledge/ArticleSidebarMeta";
import { RelatedArticleList } from "@/components/knowledge/RelatedArticleList";
import { ArticleTagPicker } from "@/components/knowledge/ArticleTagPicker";
import { MarkdownBody } from "@/components/knowledge/MarkdownBody";
import { ArticleDetailActions } from "@/components/knowledge/ArticleDetailActions";
import { getArticleDetail } from "@/lib/knowledge/queries";
import { renderMarkdown } from "@/lib/knowledge/markdown";
import { prisma } from "@/lib/prisma";

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function ArticleDetailPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t, locale } = await getT();

  const [enabled, aiEnabled] = await Promise.all([
    getFeatureFlag("knowledge_articles_enabled"),
    getFeatureFlag("knowledge_ai_structuring_enabled"),
  ]);
  if (!enabled) notFound();

  const { slug } = await params;
  const article = await getArticleDetail(user, slug);
  if (!article) notFound();

  const { html } = renderMarkdown(article.body);
  const admin = isAdmin(user);

  // Decide where the source-job back-arrow should land. The job detail
  // page lives at `/my-jobs/[id]` for everyone (it gates access via
  // `getJobForUser` which calls `canReadJob`). We adjust the `from` query
  // param so the breadcrumb on the job page goes back to the right
  // listing: `from=my-jobs` for the assignee, `from=global-jobs` for
  // everyone else. This is the smallest possible change that respects
  // V1's job module surface.
  let sourceJobHref: string | null = null;
  if (article.sourceJob) {
    const j = await prisma.job.findUnique({
      where: { id: article.sourceJob.id },
      select: { assignedEmployeeId: true },
    });
    const fromList =
      j && j.assignedEmployeeId === user.id ? "my-jobs" : "global-jobs";
    sourceJobHref = `/my-jobs/${article.sourceJob.id}?from=${fromList}`;
  }

  return (
    <div className="space-y-5">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("knowledge.detail.back")}
      </Link>

      <PageHeader
        icon={BookOpen}
        title={article.title}
        description={article.summary ?? undefined}
        actions={
          <ArticleDetailActions
            slug={article.slug}
            title={article.title}
            status={article.status}
            kind={article.kind}
            authorUserId={article.author?.id ?? ""}
            currentUserId={user.id}
            isAdmin={admin}
            aiStructuringEnabled={aiEnabled}
          />
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ArticleKindChip kind={article.kind} />
            <ArticleStatusChip status={article.status} />
            {article.author && (
              <span>
                {t("knowledge.authoredBy").replace("{name}", article.author.displayName)}
              </span>
            )}
            <span aria-hidden>·</span>
            <time dateTime={new Date(article.updatedAt).toISOString()}>
              {new Date(article.updatedAt).toLocaleDateString(
                locale === "he" ? "he-IL" : "en-US",
              )}
            </time>
            {article.sourceJob && sourceJobHref && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={sourceJobHref}
                  className="text-brand hover:underline"
                >
                  {t("knowledge.detail.fromJob").replace(
                    "{publicNumber}",
                    article.sourceJob.publicNumber,
                  )}
                </Link>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <article className="space-y-4 lg:col-span-2">
          {article.whyItMatters && (
            <section className="rounded-xl border bg-brand-soft/30 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-brand">
                {t("knowledge.detail.whyItMattersHeading")}
              </h2>
              <p className="mt-1 text-sm" dir="auto">
                {article.whyItMatters}
              </p>
            </section>
          )}

          <section className="rounded-xl border bg-card p-6" dir="auto">
            <MarkdownBody html={html} />
          </section>

          {(admin || article.author?.id === user.id) && (
            <section className="rounded-xl border bg-card p-4">
              <ArticleTagPicker
                slug={article.slug}
                attached={article.tags}
                locale={locale}
              />
            </section>
          )}
        </article>

        <div className="space-y-4">
          <ArticleSidebarMeta
            author={article.author}
            reviewer={article.reviewer}
            lastVerifiedBy={article.lastVerifiedBy}
            lastVerifiedAt={article.lastVerifiedAt}
            reliabilityTier={article.reliabilityTier}
            sourceJob={article.sourceJob}
            sourceJobHref={sourceJobHref}
            externalSource={article.externalSource}
            externalUrl={article.externalUrl}
            updatedAt={article.updatedAt}
            createdAt={article.createdAt}
          />
          <RelatedArticleList references={article.references} />
          <div className="rounded-xl border bg-card p-4 text-sm">
            <Link
              href={`/knowledge/${article.slug}/revisions`}
              className="text-sm font-medium text-brand hover:underline"
            >
              {t("knowledge.revisions.viewAll")}
              <span className="ms-2 text-xs text-muted-foreground">
                v{article.currentVersion}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
