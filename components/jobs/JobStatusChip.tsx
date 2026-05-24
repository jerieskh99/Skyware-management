import { cn } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

const STATUS_STYLES: Record<JobStatus, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  available: "bg-teal-50 text-teal-700 border-teal-200",
  taken: "bg-cyan-50 text-cyan-700 border-cyan-200",
  working_on_it: "bg-yellow-50 text-yellow-700 border-yellow-200",
  waiting_for_client: "bg-orange-50 text-orange-700 border-orange-200",
  waiting_for_admin: "bg-purple-50 text-purple-700 border-purple-200",
  done: "bg-green-50 text-green-700 border-green-200",
  reviewed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  assigned: "Assigned",
  available: "Available",
  taken: "Taken",
  working_on_it: "Working on it",
  waiting_for_client: "Waiting for client",
  waiting_for_admin: "Waiting for admin",
  done: "Done",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
};

interface Props {
  status: JobStatus;
  className?: string;
}

export function JobStatusChip({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
