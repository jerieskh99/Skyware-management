"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type JobDetailTabKey = "overview" | "timeline" | "related" | "files";

const TABS: { key: JobDetailTabKey; i18nKey: string }[] = [
  { key: "overview", i18nKey: "jobs.detail.tab.overview" },
  { key: "timeline", i18nKey: "jobs.detail.tab.timeline" },
  { key: "related", i18nKey: "jobs.detail.tab.related" },
  { key: "files", i18nKey: "jobs.detail.tab.files" },
];

interface Props {
  jobId: string;
  active: JobDetailTabKey;
  from: string;
}

export function JobDetailTabs({ jobId, active, from }: Props) {
  const { t } = useT();
  return (
    <div
      className="border-b"
      role="tablist"
      aria-label="Job detail sections"
      data-testid="job-detail-tabs"
    >
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const selected = tab.key === active;
          const href = `/my-jobs/${jobId}?tab=${tab.key}&from=${encodeURIComponent(from)}`;
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={selected}
              prefetch={false}
              className={cn(
                "relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t(tab.i18nKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
