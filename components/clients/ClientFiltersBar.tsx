"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Props {
  initialSearch?: string;
  initialStatus?: string;
}

export function ClientFiltersBar({ initialSearch = "", initialStatus = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushParams = useCallback(
    (overrides: Record<string, string | null>) => {
      const current: Record<string, string> = {};
      if (search) current["search"] = search;
      if (statusFilter) current["status"] = statusFilter;

      const merged = { ...current };
      for (const [k, v] of Object.entries(overrides)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }

      const qs = new URLSearchParams(merged).toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, search, statusFilter]
  );

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ search: val || null });
    }, 350);
  }

  function handleStatusChange(val: string) {
    setStatusFilter(val);
    pushParams({ status: val || null, search: search || null });
  }

  function clearAll() {
    setSearch("");
    setStatusFilter("");
    router.replace(pathname, { scroll: false });
  }

  const hasFilters = search || statusFilter;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search clients..."
          className="h-8 w-full rounded-md border border-input bg-background ps-8 pe-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleStatusChange(opt.value)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Clear all filters"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
