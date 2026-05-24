import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { BookOpen, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { ArticleTagPicker } from "@/components/knowledge/ArticleTagPicker";
import { getArticleBySlug } from "@/lib/knowledge/queries";

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function ArticleDetailPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t, locale } = await getT();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { slug } = await params;
  const article = await getArticleBySlug(slug, isAdmin(user));
  if (!article) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        title={article.title}
        description={article.summary ?? undefined}
        actions={
          isAdmin(user) && (
            <Link
              href={`/knowledge/${article.slug}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Link>
          )
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] uppercase">
              {t(`knowledge.status.${article.status}`)}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase">
              {t(`knowledge.visibility.${article.visibility}`)}
            </Badge>
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
            {article.relatedClient && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/clients/${article.relatedClient.id}`}
                  className="text-brand hover:underline"
                >
                  {article.relatedClient.companyName}
                </Link>
              </>
            )}
          </div>
        }
      />

      <article className="rounded-xl border bg-card p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
          {article.body}
        </pre>
      </article>

      {isAdmin(user) && (
        <section className="rounded-xl border bg-card p-4">
          <ArticleTagPicker slug={article.slug} attached={article.tags} locale={locale} />
        </section>
      )}
    </div>
  );
}
