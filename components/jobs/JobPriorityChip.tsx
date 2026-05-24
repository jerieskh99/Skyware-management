"use client";

import { cn } from "@/lib/utils";
import type { JobPriority } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const STYLES: Record<JobPriority, string> = {
  low: "bg-slate-50 text-slate-600 border-slate-200",
  normal: "bg-gray-50 text-gray-600 border-gray-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const DOTS: Record<JobPriority, string> = {
  low: "bg-slate-400",
  normal: "bg-gray-400",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

interface Props {
  priority: JobPriority;
  className?: string;
}

export function JobPriorityChip({ priority, className }: Props) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[priority],
        className
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOTS[priority])} />
      {t(`job.priority.${priority}`)}
    </span>
  );
}
