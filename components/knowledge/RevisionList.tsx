"use client";

import { useT } from "@/lib/i18n/client";

interface Revision {
  id: string;
  version: number;
  title: string;
  summary: string | null;
  whyItMatters: string | null;
  author: { id: string; displayName: string } | null;
  createdAt: Date | string;
}

interface Props {
  revisions: Revision[];
  /** Optional click handler. If unset, list is read-only. */
  onSelect?: (revisionId: string) => void;
  selectedId?: string | null;
}

export function RevisionList({ revisions, onSelect, selectedId = null }: Props) {
  const { t, locale } = useT();
  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("knowledge.revisions.empty")}
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {revisions.map((r) => {
        const dt = typeof r.createdAt === "string" ? new Date(r.createdAt) : r.createdAt;
        const isSelected = selectedId === r.id;
        const className = `flex w-full items-start gap-3 rounded-lg border p-3 text-start text-sm transition-colors ${
          isSelected ? "border-brand bg-brand-soft/30" : "hover:bg-muted/30"
        }`;
        const inner = (
          <>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium">
              v{r.version}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t("knowledge.revisions.versionLabel").replace("{n}", String(r.version))}
              </p>
              <p className="truncate text-xs text-muted-foreground">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {r.author?.displayName ?? "—"}
                {" · "}
                {dt.toLocaleString(locale === "he" ? "he-IL" : "en-US")}
              </p>
            </div>
          </>
        );
        return (
          <li key={r.id}>
            {onSelect ? (
              <button type="button" className={className} onClick={() => onSelect(r.id)}>
                {inner}
              </button>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
