"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const PRIORITY_KEYS = ["urgent", "high", "normal", "low"] as const;

interface Props {
  initialSearch?: string;
  initialPriority?: string;
  showClosed?: boolean;
}

export function JobFiltersBar({ initialSearch = "", initialPriority = "", showClosed = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const [search, setSearch] = useState(initialSearch);
  const [priority, setPriority] = useState(initialPriority);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushParams = useCallback(
    (overrides: Record<string, string | null>) => {
      // Build params from current state + overrides
      const current: Record<string, string> = {};
      if (search) current["search"] = search;
      if (priority) current["priority"] = priority;
      if (showClosed) current["closed"] = "1";

      const merged = { ...current };
      for (const [k, v] of Object.entries(overrides)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }

      const qs = new URLSearchParams(merged).toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, search, priority, showClosed]
  );

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ search: val || null });
    }, 350);
  }

  function handlePriorityToggle(val: string) {
    const next = priority === val ? "" : val;
    setPriority(next);
    pushParams({ priority: next || null, search: search || null });
  }

  function handleClosedToggle() {
    pushParams({ closed: showClosed ? null : "1", search: search || null });
  }

  function clearAll() {
    setSearch("");
    setPriority("");
    router.replace(pathname, { scroll: false });
  }

  const hasFilters = search || priority || showClosed;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
      {/* Search */}
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("jobs.search")}
          className="h-8 w-full rounded-md border border-input bg-background ps-8 pe-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Priority chips */}
      <div className="flex flex-wrap gap-1">
        {PRIORITY_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handlePriorityToggle(key)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              priority === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {t(`job.priority.${key}`)}
          </button>
        ))}
      </div>

      {/* Show Closed toggle */}
      <button
        onClick={handleClosedToggle}
        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
          showClosed
            ? "border-secondary bg-secondary text-secondary-foreground"
            : "border-border bg-background text-muted-foreground hover:bg-accent"
        }`}
      >
        {t("jobs.showClosed")}
      </button>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={t("common.clear")}
        >
          <X className="h-3.5 w-3.5" />
          {t("common.clear")}
        </button>
      )}
    </div>
  );
}
