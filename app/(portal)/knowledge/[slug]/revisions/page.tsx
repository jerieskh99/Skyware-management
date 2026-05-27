import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { RevisionList } from "@/components/knowledge/RevisionList";
import { getArticleDetail } from "@/lib/knowledge/queries";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Linear list of historical revisions newest-first. V1: list-only.
 * The detail page links here; clicking a row in the list opens that
 * revision body inline (no diff yet - V2).
 */
export default async function RevisionsPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { slug } = await params;
  const article = await getArticleDetail(user, slug);
  if (!article) notFound();

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
        icon={History}
        title={t("knowledge.revisions.title")}
        description={article.title}
      />
      <RevisionList revisions={article.revisions} />
    </div>
  );
}
