"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Loader2, MessageSquare, Building2, BookOpen } from "lucide-react";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

type Scope = "all" | "jobs" | "clients" | "posts" | "knowledge";

interface JobHit {
  id: string;
  publicNumber: string;
  title: string;
  status: JobStatus;
  priority: string;
  client: { id: string; companyName: string } | null;
  department: { key: string; nameEn: string };
}

interface ClientHit {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  status: string;
}

interface PostHit {
  id: string;
  title: string;
  channelKey: string;
  channelNameEn: string;
  authorDisplayName: string;
  createdAt: string;
}

interface KnowledgeHit {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  visibility: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface ApiResponse {
  q: string;
  scope: Scope;
  results: {
    jobs?: Page<JobHit>;
    clients?: Page<ClientHit>;
    posts?: Page<PostHit>;
    knowledge?: Page<KnowledgeHit>;
  };
}

const EMPTY: ApiResponse["results"] = {};

interface Props {
  /** Show scope chips and route to /search on submit. */
  ftsEnabled?: boolean;
  /** Hide clients chip for non-admins. */
  isAdmin?: boolean;
  /** Show knowledge scope chip and bucket when the knowledge feature is on. */
  knowledgeEnabled?: boolean;
}

export function GlobalSearch({
  ftsEnabled = false,
  isAdmin = false,
  knowledgeEnabled = false,
}: Props) {
  const { t } = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [results, setResults] = useState<ApiResponse["results"]>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string, s: Scope) => {
    if (q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&scope=${s}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ApiResponse;
      setResults(data.results ?? EMPTY);
    } catch {
      setError(true);
      setResults(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(val.trim(), scope), 300);
  }

  function handleScopeChange(next: Scope) {
    setScope(next);
    if (query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      search(query.trim(), next);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!ftsEnabled || q.length < 2) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}&scope=${scope}`);
  }

  // Keyboard shortcut: /
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleResultClick() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
  }

  const jobs = results.jobs?.items ?? [];
  const clients = results.clients?.items ?? [];
  const posts = results.posts?.items ?? [];
  const knowledge = results.knowledge?.items ?? [];
  const hasResults =
    jobs.length > 0 ||
    clients.length > 0 ||
    posts.length > 0 ||
    knowledge.length > 0;
  const showDropdown = open && (query.length >= 2 || loading);
  const sectionCount =
    (jobs.length > 0 ? 1 : 0) +
    (clients.length > 0 ? 1 : 0) +
    (posts.length > 0 ? 1 : 0) +
    (knowledge.length > 0 ? 1 : 0);
  const showSectionHeaders = sectionCount > 1;

  const chips: { value: Scope; label: string }[] = [
    { value: "all", label: t("search.scope.all") },
    { value: "jobs", label: t("search.scope.jobs") },
  ];
  if (isAdmin) chips.push({ value: "clients", label: t("search.scope.clients") });
  chips.push({ value: "posts", label: t("search.scope.posts") });
  if (knowledgeEnabled) {
    chips.push({ value: "knowledge", label: t("search.scope.knowledge") });
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <form onSubmit={handleSubmit} className="space-y-1.5">
        {ftsEnabled && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => handleScopeChange(c.value)}
                aria-pressed={scope === c.value}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  scope === c.value
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-input bg-background text-muted-foreground hover:bg-accent"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex items-center">
          {loading ? (
            <Loader2 className="pointer-events-none absolute start-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute start-3 h-4 w-4 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => { if (query.length >= 2) setOpen(true); }}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            className="h-9 w-full rounded-md border border-input bg-background ps-9 pe-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <kbd className="pointer-events-none absolute end-2.5 hidden rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
            /
          </kbd>
        </div>
      </form>

      {showDropdown && (
        <div className="absolute start-0 end-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-background shadow-lg">
          {error && (
            <p className="px-4 py-3 text-sm text-destructive">{t("common.error")}</p>
          )}

          {!error && !loading && !hasResults && query.length >= 2 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {t("search.noResults").replace("{q}", query)}
            </p>
          )}

          {jobs.length > 0 && (
            <>
              {showSectionHeaders && (
                <SectionLabel first>{t("search.scope.jobs")}</SectionLabel>
              )}
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/my-jobs/${job.id}`}
                  onClick={handleResultClick}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {job.publicNumber}
                      </span>
                      <JobStatusChip status={job.status} />
                    </div>
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.department.nameEn}
                      {job.client && ` · ${job.client.companyName}`}
                    </p>
                  </div>
                </Link>
              ))}
            </>
          )}

          {clients.length > 0 && (
            <>
              {showSectionHeaders && (
                <SectionLabel first={jobs.length === 0}>{t("search.scope.clients")}</SectionLabel>
              )}
              {clients.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  onClick={handleResultClick}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.companyName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.contactPerson ?? c.email ?? c.status}
                    </p>
                  </div>
                </Link>
              ))}
            </>
          )}

          {posts.length > 0 && (
            <>
              {showSectionHeaders && (
                <SectionLabel first={jobs.length === 0 && clients.length === 0}>
                  {t("search.scope.posts")}
                </SectionLabel>
              )}
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/communication/${post.channelKey}/${post.id}`}
                  onClick={handleResultClick}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {post.channelNameEn} · {post.authorDisplayName}
                    </p>
                  </div>
                </Link>
              ))}
            </>
          )}

          {knowledge.length > 0 && (
            <>
              {showSectionHeaders && (
                <SectionLabel
                  first={jobs.length === 0 && clients.length === 0 && posts.length === 0}
                >
                  {t("search.scope.knowledge")}
                </SectionLabel>
              )}
              {knowledge.map((a) => (
                <Link
                  key={a.id}
                  href={`/knowledge/${a.slug}`}
                  onClick={handleResultClick}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.title}</p>
                    {a.summary && (
                      <p className="truncate text-xs text-muted-foreground">{a.summary}</p>
                    )}
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={cn(
        "px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        first ? "border-b" : "border-y"
      )}
    >
      {children}
    </div>
  );
}
