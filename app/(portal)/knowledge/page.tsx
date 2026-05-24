import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArticleCard } from "@/components/knowledge/ArticleCard";
import { listArticles } from "@/lib/knowledge/queries";
import type { KnowledgeArticleStatus } from "@prisma/client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(v: string | string[] | undefined): string {
  if (typeof v !== "string") return "";
  return v;
}

const STATUS_VALUES: KnowledgeArticleStatus[] = ["draft", "published", "archived"];

function readStatus(v: string | string[] | undefined): KnowledgeArticleStatus | undefined {
  if (typeof v !== "string") return undefined;
  return STATUS_VALUES.includes(v as KnowledgeArticleStatus)
    ? (v as KnowledgeArticleStatus)
    : undefined;
}

export default async function KnowledgePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t, locale } = await getT();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  const params = await searchParams;
  const q = readString(params["q"]).trim();
  const tag = readString(params["tag"]).trim() || undefined;
  const viewerIsAdmin = isAdmin(user);
  const status = viewerIsAdmin ? readStatus(params["status"]) : "published";

  const { items } = await listArticles({
    status,
    q: q || undefined,
    tag,
    viewerIsAdmin,
    limit: 50,
  });

  const statusChips: { value: string; label: string }[] = viewerIsAdmin
    ? [
        { value: "", label: t("knowledge.filter.allActive") },
        { value: "published", label: t("knowledge.status.published") },
        { value: "draft", label: t("knowledge.status.draft") },
        { value: "archived", label: t("knowledge.status.archived") },
      ]
    : [];

  function chipHref(s: string): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    if (s) sp.set("status", s);
    const qs = sp.toString();
    return qs ? `/knowledge?${qs}` : "/knowledge";
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BookOpen}
        title={t("knowledge.title")}
        description={t("knowledge.description")}
        actions={
          viewerIsAdmin && (
            <Link
              href="/knowledge/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t("knowledge.addArticle")}
            </Link>
          )
        }
        meta={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form action="/knowledge" method="GET" className="flex-1">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("knowledge.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {tag && <input type="hidden" name="tag" value={tag} />}
              {status && <input type="hidden" name="status" value={status} />}
            </form>
            {statusChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {statusChips.map((c) => {
                  const active =
                    (status ?? "") === c.value || (!status && c.value === "");
                  return (
                    <Link
                      key={c.value || "all"}
                      href={chipHref(c.value)}
                      aria-current={active ? "true" : undefined}
                      className={
                        active
                          ? "rounded-full border border-brand bg-brand-soft px-3 py-1 text-xs font-medium text-brand"
                          : "rounded-full border border-input bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                      }
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q ? t("knowledge.noMatch") : t("knowledge.empty")}
          description={!q ? t("knowledge.emptyHint") : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
