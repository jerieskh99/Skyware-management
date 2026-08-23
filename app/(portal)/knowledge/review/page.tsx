import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReviewQueueRow } from "@/components/knowledge/ReviewQueueRow";
import { listArticlesFiltered } from "@/lib/knowledge/queries";

type Tab = "unassigned" | "mine" | "all" | "closed";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(v: string | string[] | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  return v;
}

export default async function ReviewQueuePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) notFound();

  // V1 permission: only admins reach this page.
  if (!isAdmin(user)) notFound();

  const params = await searchParams;
  const tabParam = readString(params["tab"]);
  const VALID_TABS: Tab[] = ["unassigned", "mine", "all", "closed"];
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "unassigned";

  // Build the filter set per tab. Wave 3 wires this directly via the
  // server-side filters now that `ARTICLE_LIST_SELECT` includes
  // `reviewerUserId` and `listArticlesFiltered` accepts a
  // `reviewerUnassigned` boolean.
  //   - unassigned: pending_review AND reviewerUserId IS NULL
  //   - mine:       pending_review AND reviewerUserId = caller
  //   - all:        pending_review (no further reviewer filter)
  //   - closed:     approved / published / archived, most recently updated
  //                 first, capped at 50.
  const filters: Parameters<typeof listArticlesFiltered>[1] =
    tab === "closed"
      ? {
          status: ["approved", "published", "archived"],
          orderByUpdatedAtOnly: true,
        }
      : { status: "pending_review" };

  if (tab === "mine") {
    filters.reviewerUserId = user.id;
  }
  if (tab === "unassigned") {
    filters.reviewerUnassigned = true;
  }

  const { items } = await listArticlesFiltered(user, filters, { limit: 50 });

  const { t, locale } = await getT();

  function tabHref(t: Tab): string {
    return t === "unassigned" ? "/knowledge/review" : `/knowledge/review?tab=${t}`;
  }

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: "unassigned", labelKey: "knowledge.review.tabs.unassigned" },
    { key: "mine", labelKey: "knowledge.review.tabs.mine" },
    { key: "all", labelKey: "knowledge.review.tabs.all" },
    { key: "closed", labelKey: "knowledge.review.tabs.closed" },
  ];

  void locale;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        title={t("knowledge.review.title")}
        description={t("knowledge.review.subtitle")}
      />

      <div className="flex items-center gap-1.5 overflow-x-auto border-b text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tt) => {
          const active = tab === tt.key;
          return (
            <Link
              key={tt.key}
              href={tabHref(tt.key)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 font-medium transition-colors ${
                active
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tt.labelKey)}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("knowledge.review.empty")} />
      ) : (
        <ul className="rounded-lg border bg-card">
          {items.map((row) => (
            <ReviewQueueRow
              key={row.id}
              row={{
                slug: row.slug,
                title: row.title,
                kind: row.kind,
                author: row.author,
                updatedAt: row.updatedAt,
                createdAt: row.createdAt,
              }}
              canDecide={tab !== "closed" && row.author?.id !== user.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
