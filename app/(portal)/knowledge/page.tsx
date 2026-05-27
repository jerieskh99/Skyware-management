import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Plus, AlertTriangle } from "lucide-react";
import type {
  KnowledgeArticleStatus,
  KnowledgeArticleType,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArticleKindChip } from "@/components/knowledge/ArticleKindChip";
import { ArticleStatusChip } from "@/components/knowledge/ArticleStatusChip";
import { ReliabilityTierBadge } from "@/components/knowledge/ReliabilityTierBadge";
import { VerifiedFreshnessPill } from "@/components/knowledge/VerifiedFreshnessPill";
import { listArticlesFiltered } from "@/lib/knowledge/queries";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KIND_VALUES: KnowledgeArticleType[] = [
  "internal_task_lesson",
  "external_reference",
  "how_to_guide",
  "troubleshooting_note",
  "architecture_decision",
  "process_policy_note",
];

const STATUS_VALUES: KnowledgeArticleStatus[] = [
  "draft",
  "ai_structured",
  "pending_review",
  "approved",
  "published",
  "archived",
];

function readString(v: string | string[] | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readKind(v: string | string[] | undefined): KnowledgeArticleType | undefined {
  const s = readString(v);
  if (!s) return undefined;
  return KIND_VALUES.includes(s as KnowledgeArticleType)
    ? (s as KnowledgeArticleType)
    : undefined;
}

function readStatus(v: string | string[] | undefined): KnowledgeArticleStatus | undefined {
  const s = readString(v);
  if (!s) return undefined;
  return STATUS_VALUES.includes(s as KnowledgeArticleStatus)
    ? (s as KnowledgeArticleStatus)
    : undefined;
}

function readBool(v: string | string[] | undefined): boolean {
  return readString(v) === "1";
}

export default async function KnowledgePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t, locale } = await getT();

  const enabled = await getFeatureFlag("knowledge_articles_enabled");

  const params = await searchParams;
  const kind = readKind(params["kind"]);
  const status = readStatus(params["status"]);
  const tag = readString(params["tag"]);
  const q = readString(params["q"]);
  const author = readString(params["author"]);
  const myContributions = readBool(params["myContributions"]);
  const needsReview = readBool(params["needsReview"]);

  const filters: Parameters<typeof listArticlesFiltered>[1] = {};
  if (kind) filters.kind = kind;
  if (status) filters.status = status;
  if (tag) filters.tagKeys = [tag];
  if (q) filters.q = q;
  if (author === "me") filters.authorUserId = user.id;
  if (myContributions) filters.myContributions = true;
  if (needsReview) filters.needsReview = true;

  const viewerIsAdmin = isAdmin(user);

  const { items } = enabled
    ? await listArticlesFiltered(user, filters, { limit: 50 })
    : { items: [] };

  // ─── Filter chip helpers ────────────────────────────────────────────────
  const baseParams = new URLSearchParams();
  if (kind) baseParams.set("kind", kind);
  if (status) baseParams.set("status", status);
  if (tag) baseParams.set("tag", tag);
  if (q) baseParams.set("q", q);
  if (author) baseParams.set("author", author);
  if (myContributions) baseParams.set("myContributions", "1");
  if (needsReview) baseParams.set("needsReview", "1");

  function hrefWith(patch: Record<string, string | undefined>): string {
    const params = new URLSearchParams(baseParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/knowledge?${qs}` : "/knowledge";
  }

  const kindChips: { value: KnowledgeArticleType | undefined; label: string }[] = [
    { value: undefined, label: t("knowledge.list.filters.all") },
    ...KIND_VALUES.map((k) => ({
      value: k,
      label: t(`knowledge.kinds.${k}`),
    })),
  ];

  const statusChips: { value: KnowledgeArticleStatus | undefined; label: string }[] = viewerIsAdmin
    ? [
        { value: undefined, label: t("knowledge.list.filters.all") },
        ...STATUS_VALUES.map((s) => ({
          value: s,
          label: t(`knowledge.statuses.${s}`),
        })),
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BookOpen}
        title={t("knowledge.list.title")}
        description={t("knowledge.list.subtitle")}
        actions={
          enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/knowledge/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t("knowledge.list.addInternal")}
              </Link>
              <Link
                href="/knowledge/new/external"
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
                {t("knowledge.list.addExternal")}
              </Link>
            </div>
          ) : undefined
        }
      />

      {!enabled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-amber-800">{t("knowledge.list.complianceBanner")}</p>
        </div>
      )}

      {enabled && (
        <FilterStrip
          q={q}
          activeKind={kind}
          activeStatus={status}
          myContributions={myContributions}
          needsReview={needsReview}
          kindChips={kindChips}
          statusChips={statusChips}
          hrefWith={hrefWith}
        />
      )}

      {!enabled ? (
        <EmptyState icon={BookOpen} title={t("knowledge.list.empty")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q ? t("knowledge.list.noMatch") : t("knowledge.list.empty")}
        />
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("knowledge.list.cols.title")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("knowledge.list.cols.kind")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">
                    {t("knowledge.list.cols.status")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    {t("knowledge.list.cols.reliability")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    {t("knowledge.list.cols.lastVerified")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">
                    {t("knowledge.list.cols.author")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("knowledge.list.cols.updatedAt")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((a) => (
                  <ArticleRow key={a.id} a={a} locale={locale} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Article row ───────────────────────────────────────────────────────────
function ArticleRow({
  a,
  locale,
}: {
  a: Awaited<ReturnType<typeof listArticlesFiltered>>["items"][number];
  locale: "en" | "he";
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="max-w-[280px] px-4 py-3">
        <Link
          href={`/knowledge/${a.slug}`}
          className="font-medium hover:underline"
        >
          <span className="block truncate">{a.title}</span>
        </Link>
        {a.summary && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {a.summary}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <ArticleKindChip kind={a.kind} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <ArticleStatusChip status={a.status} />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <ReliabilityTierBadge tier={a.reliabilityTier} />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <VerifiedFreshnessPill lastVerifiedAt={a.lastVerifiedAt} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
        {a.author?.displayName ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(a.updatedAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
      </td>
    </tr>
  );
}

// ─── Filter strip ──────────────────────────────────────────────────────────
interface FilterStripProps {
  q: string | undefined;
  activeKind: KnowledgeArticleType | undefined;
  activeStatus: KnowledgeArticleStatus | undefined;
  myContributions: boolean;
  needsReview: boolean;
  kindChips: { value: KnowledgeArticleType | undefined; label: string }[];
  statusChips: { value: KnowledgeArticleStatus | undefined; label: string }[];
  hrefWith: (patch: Record<string, string | undefined>) => string;
}

async function FilterStrip({
  q,
  activeKind,
  activeStatus,
  myContributions,
  needsReview,
  kindChips,
  statusChips,
  hrefWith,
}: FilterStripProps) {
  const { t } = await getT();
  return (
    <div className="space-y-2">
      <form action="/knowledge" method="GET" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("knowledge.list.filters.q")}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {activeKind && <input type="hidden" name="kind" value={activeKind} />}
        {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
        {myContributions && <input type="hidden" name="myContributions" value="1" />}
        {needsReview && <input type="hidden" name="needsReview" value="1" />}
      </form>

      <ChipRow
        label={t("knowledge.list.filters.kind")}
        items={kindChips.map((c) => ({
          key: String(c.value ?? "all"),
          label: c.label,
          href: hrefWith({ kind: c.value }),
          active: (activeKind ?? null) === (c.value ?? null),
        }))}
      />

      {statusChips.length > 0 && (
        <ChipRow
          label={t("knowledge.list.filters.status")}
          items={statusChips.map((c) => ({
            key: String(c.value ?? "all"),
            label: c.label,
            href: hrefWith({ status: c.value }),
            active: (activeStatus ?? null) === (c.value ?? null),
          }))}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="me-1 text-muted-foreground">{t("knowledge.list.filters.savedViews")}:</span>
        <Link
          href={hrefWith({ myContributions: myContributions ? undefined : "1" })}
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            myContributions
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {t("knowledge.list.filters.mine")}
        </Link>
        <Link
          href={hrefWith({ needsReview: needsReview ? undefined : "1" })}
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            needsReview
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {t("knowledge.list.filters.needsReview")}
        </Link>
      </div>
    </div>
  );
}

function ChipRow({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="me-1 text-muted-foreground">{label}:</span>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            i.active
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
