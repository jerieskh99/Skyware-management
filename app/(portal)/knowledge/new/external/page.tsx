import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExternalReferenceForm } from "@/components/knowledge/ExternalReferenceForm";

/**
 * External-reference fast-path: URL + minimal metadata. POSTs
 * `/api/knowledge` with `kind: "external_reference"`. The form lives in
 * `ExternalReferenceForm` (a thin wrapper around `ArticleEditor`); the
 * page itself is just the shell.
 */
export default async function NewExternalArticlePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Cast for symmetry with the other guards; not used directly.
  void (session.user as SessionUser);

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const { t } = await getT();
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
        title={t("knowledge.newExternal.title")}
        description={t("knowledge.newExternal.subtitle")}
      />
      <ExternalReferenceForm />
    </div>
  );
}
