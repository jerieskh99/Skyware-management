import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import type { KnowledgeArticleType } from "@prisma/client";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";

/**
 * Direct-add internal article funnel. The kind selector defaults to
 * `how_to_guide` and only shows the kinds the caller is allowed to author
 * (admins see all; employees see the non-admin-only ones).
 */
export default async function NewArticlePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { t } = await getT();
  const admin = isAdmin(user);

  // Mirror `canCreateKindAs` in `lib/knowledge/permissions.ts`: admins author
  // any kind, employees skip the org-weight ones.
  const allowedKinds: KnowledgeArticleType[] = admin
    ? [
        "how_to_guide",
        "internal_task_lesson",
        "troubleshooting_note",
        "external_reference",
        "architecture_decision",
        "process_policy_note",
      ]
    : [
        "how_to_guide",
        "internal_task_lesson",
        "troubleshooting_note",
        "external_reference",
      ];

  return (
    <div className="space-y-4">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("knowledge.detail.back")}
      </Link>
      <PageHeader
        icon={BookOpen}
        title={t("knowledge.new.title")}
        description={t("knowledge.new.subtitle")}
      />
      <ArticleEditor mode="create" allowedKinds={allowedKinds} />
    </div>
  );
}
