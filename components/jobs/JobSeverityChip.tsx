import { cn } from "@/lib/utils";
import type { JobSeverity } from "@prisma/client";

const STYLES: Record<JobSeverity, string> = {
  minor: "bg-slate-50 text-slate-600 border-slate-200",
  moderate: "bg-blue-50 text-blue-600 border-blue-200",
  major: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-300",
};

const LABELS: Record<JobSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  critical: "Critical",
};

interface Props { severity: JobSeverity; className?: string }

export function JobSeverityChip({ severity, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[severity],
        className
      )}
    >
      {LABELS[severity]}
    </span>
  );
}
