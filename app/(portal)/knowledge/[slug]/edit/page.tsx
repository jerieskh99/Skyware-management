import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";
import { getArticleDetail } from "@/lib/knowledge/queries";
import { canEditDraft } from "@/lib/knowledge/permissions";

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function EditArticlePage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { slug } = await params;
  const article = await getArticleDetail(user, slug);
  if (!article) notFound();

  // Admins can edit anything; authors can edit draft / ai_structured.
  const canEdit =
    isAdmin(user) ||
    canEditDraft(user, {
      authorUserId: article.author?.id ?? "",
      status: article.status,
    });
  if (!canEdit) notFound();

  const { t } = await getT();

  return (
    <div className="space-y-4">
      <Link
        href={`/knowledge/${article.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("knowledge.detail.back")}
      </Link>
      <PageHeader
        icon={BookOpen}
        title={t("knowledge.edit.title")}
        description={article.title}
      />
      <ArticleEditor
        mode="edit"
        initial={{
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          whyItMatters: article.whyItMatters,
          body: article.body,
          visibility: article.visibility,
          kind: article.kind,
          reliabilityTier: article.reliabilityTier,
          externalSource: article.externalSource,
          externalUrl: article.externalUrl,
        }}
      />
    </div>
  );
}
