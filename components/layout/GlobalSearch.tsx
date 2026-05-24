"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Loader2, MessageSquare } from "lucide-react";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import type { JobStatus } from "@prisma/client";

interface JobResult {
  id: string;
  publicNumber: string;
  title: string;
  status: JobStatus;
  priority: string;
  client: { companyName: string } | null;
  department: { key: string; nameEn: string };
}

interface PostResult {
  id: string;
  title: string;
  channelKey: string;
  channelNameEn: string;
  authorDisplayName: string;
  createdAt: string;
}

interface SearchResults {
  jobs: JobResult[];
  posts: PostResult[];
}

const EMPTY: SearchResults = { jobs: [], posts: [] };

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&scope=all`);
      if (!res.ok) throw new Error();
      const data = await res.json() as SearchResults;
      setResults(data);
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
    debounceRef.current = setTimeout(() => search(val.trim()), 300);
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

  const hasResults = results.jobs.length > 0 || results.posts.length > 0;
  const showDropdown = open && (query.length >= 2 || loading);
  const showSectionHeaders = results.jobs.length > 0 && results.posts.length > 0;

  return (
    <div ref={containerRef} className="relative flex-1">
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
          placeholder="Search jobs and posts..."
          className="h-9 w-full rounded-md border border-input bg-background ps-9 pe-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <kbd className="pointer-events-none absolute end-2.5 hidden rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
          /
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute start-0 end-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-background shadow-lg">
          {error && (
            <p className="px-4 py-3 text-sm text-destructive">Search failed. Try again.</p>
          )}

          {!error && !loading && !hasResults && query.length >= 2 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;.
            </p>
          )}

          {results.jobs.length > 0 && (
            <>
              {showSectionHeaders && (
                <div className="border-b px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Jobs
                </div>
              )}
              {results.jobs.map((job) => (
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

          {results.posts.length > 0 && (
            <>
              <div className={`px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${results.jobs.length > 0 ? "border-y" : "border-b"}`}>
                Posts
              </div>
              {results.posts.map((post) => (
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
        </div>
      )}
    </div>
  );
}
