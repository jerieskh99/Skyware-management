import { redirect, notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";

export default async function NewArticlePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) notFound();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { t } = await getT();

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BookOpen}
        title={t("knowledge.editor.createTitle")}
        description={t("knowledge.editor.createDescription")}
      />
      <ArticleEditor mode="create" />
    </div>
  );
}
