import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Search as SearchIcon, Briefcase, Building2, MessageSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { cn } from "@/lib/utils";
import {
  MIN_QUERY_LENGTH,
  searchClients,
  searchJobs,
  searchPosts,
  type SearchScope,
  type SearchPage,
  type JobHit,
  type ClientHit,
  type PostHit,
} from "@/lib/search/queries";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_SCOPES = new Set<SearchScope>(["all", "jobs", "clients", "posts"]);

function readScope(v: string | string[] | undefined): SearchScope {
  if (typeof v !== "string") return "all";
  return VALID_SCOPES.has(v as SearchScope) ? (v as SearchScope) : "all";
}

function readString(v: string | string[] | undefined): string {
  if (typeof v !== "string") return "";
  return v;
}

export default async function SearchPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t } = await getT();

  const ftsEnabled = await getFeatureFlag("fts_search_enabled");
  if (!ftsEnabled) notFound();

  const params = await searchParams;
  const q = readString(params["q"]).trim();
  let scope = readScope(params["scope"]);
  const jobsCursor = readString(params["jobsCursor"]) || undefined;
  const clientsCursor = readString(params["clientsCursor"]) || undefined;
  const postsCursor = readString(params["postsCursor"]) || undefined;

  // Coerce admin-only scope to "all" for non-admins.
  if (scope === "clients" && !isAdmin(user)) scope = "all";

  const tooShort = q.length < MIN_QUERY_LENGTH;

  const doJobs = scope === "all" || scope === "jobs";
  const doClients = (scope === "all" || scope === "clients") && isAdmin(user);
  const doPosts = scope === "all" || scope === "posts";

  let jobs: SearchPage<JobHit> = { items: [], nextCursor: null };
  let clients: SearchPage<ClientHit> = { items: [], nextCursor: null };
  let posts: SearchPage<PostHit> = { items: [], nextCursor: null };

  if (!tooShort) {
    const limit = scope === "all" ? 5 : 20;
    const tasks: Promise<unknown>[] = [];
    if (doJobs) tasks.push(searchJobs(user, q, { limit, cursor: jobsCursor }).then((r) => (jobs = r)));
    if (doClients) tasks.push(searchClients(user, q, { limit, cursor: clientsCursor }).then((r) => (clients = r)));
    if (doPosts) tasks.push(searchPosts(user, q, { limit, cursor: postsCursor }).then((r) => (posts = r)));
    await Promise.all(tasks);
  }

  const chips: { value: SearchScope; label: string; show: boolean }[] = [
    { value: "all", label: t("search.scope.all"), show: true },
    { value: "jobs", label: t("search.scope.jobs"), show: true },
    { value: "clients", label: t("search.scope.clients"), show: isAdmin(user) },
    { value: "posts", label: t("search.scope.posts"), show: true },
  ];

  function chipHref(s: SearchScope): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("scope", s);
    return `/search?${sp.toString()}`;
  }

  function loadMoreHref(cursorKey: string, cursor: string): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("scope", scope);
    sp.set(cursorKey, cursor);
    return `/search?${sp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={SearchIcon}
        title={t("search.results")}
        description={q ? `"${q}"` : undefined}
        meta={
          <div className="flex flex-wrap items-center gap-1.5">
            {chips
              .filter((c) => c.show)
              .map((c) => (
                <Link
                  key={c.value}
                  href={chipHref(c.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    scope === c.value
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-input bg-background text-muted-foreground hover:bg-accent"
                  )}
                >
                  {c.label}
                </Link>
              ))}
          </div>
        }
      />

      {tooShort ? (
        <EmptyState icon={SearchIcon} title={t("search.tooShort")} />
      ) : (
        <>
          {doJobs && (
            <SectionCard icon={Briefcase} title={t("search.scope.jobs")} count={jobs.items.length} bodyClassName="p-0">
              {jobs.items.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title={t("search.noResults").replace("{q}", q)}
                  className="border-none py-8"
                />
              ) : (
                <ul className="divide-y">
                  {jobs.items.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/my-jobs/${j.id}`}
                        className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {j.publicNumber}
                            </span>
                            <JobStatusChip status={j.status} />
                          </div>
                          <p className="truncate font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {j.department.nameEn}
                            {j.client && ` · ${j.client.companyName}`}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {jobs.nextCursor && (
                <div className="border-t px-4 py-2 text-end">
                  <Link
                    href={loadMoreHref("jobsCursor", jobs.nextCursor)}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t("search.loadMore")}
                  </Link>
                </div>
              )}
            </SectionCard>
          )}

          {doClients && (
            <SectionCard
              icon={Building2}
              title={t("search.scope.clients")}
              count={clients.items.length}
              bodyClassName="p-0"
            >
              {clients.items.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title={t("search.noResults").replace("{q}", q)}
                  className="border-none py-8"
                />
              ) : (
                <ul className="divide-y">
                  {clients.items.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/clients/${c.id}`}
                        className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
                      >
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{c.companyName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.contactPerson ?? c.email ?? c.status}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {clients.nextCursor && (
                <div className="border-t px-4 py-2 text-end">
                  <Link
                    href={loadMoreHref("clientsCursor", clients.nextCursor)}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t("search.loadMore")}
                  </Link>
                </div>
              )}
            </SectionCard>
          )}

          {!doClients && scope === "clients" && !isAdmin(user) && (
            <EmptyState icon={Building2} title={t("search.adminOnlyScope")} />
          )}

          {doPosts && (
            <SectionCard
              icon={MessageSquare}
              title={t("search.scope.posts")}
              count={posts.items.length}
              bodyClassName="p-0"
            >
              {posts.items.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title={t("search.noResults").replace("{q}", q)}
                  className="border-none py-8"
                />
              ) : (
                <ul className="divide-y">
                  {posts.items.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/communication/${p.channelKey}/${p.id}`}
                        className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
                      >
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.channelNameEn} · {p.authorDisplayName}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {posts.nextCursor && (
                <div className="border-t px-4 py-2 text-end">
                  <Link
                    href={loadMoreHref("postsCursor", posts.nextCursor)}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t("search.loadMore")}
                  </Link>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
