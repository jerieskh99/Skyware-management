import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { AiStructureReviewer } from "@/components/knowledge/AiStructureReviewer";
import { getArticleDetail } from "@/lib/knowledge/queries";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Side-by-side AI structuring preview. Reachable from the detail page
 * "Run AI structure" action. We render the latest snapshots as captured
 * by Wave 2A; the client `AiStructureReviewer` handles Accept (PATCH the
 * article body) and Reject (navigate back).
 */
export default async function AiStructurePage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  // The AI structuring step is gated by a separate flag so an admin can
  // enable the module surface while keeping the AI call path off. When the
  // flag is off, the page does not exist at all (matches `/api/knowledge/
  // [slug]/ai-structure` returning 404 in the same conditions).
  const aiEnabled = await getFeatureFlag("knowledge_ai_structuring_enabled");
  if (!aiEnabled) notFound();

  const { slug } = await params;
  const article = await getArticleDetail(user, slug);
  if (!article) notFound();

  // Gate: only the author or an admin should reach this page.
  const isAuthor = article.author?.id === user.id;
  if (!isAuthor && !isAdmin(user)) notFound();

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
        icon={Sparkles}
        title={t("knowledge.ai.title")}
        description={article.title}
      />
      <AiStructureReviewer
        slug={article.slug}
        rawInput={article.rawInputSnapshot ?? null}
        structured={article.aiStructuredSnapshot}
      />
    </div>
  );
}
