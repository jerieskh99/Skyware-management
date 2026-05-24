import Link from "next/link";
import { JobStatusChip } from "./JobStatusChip";
import { JobPriorityChip } from "./JobPriorityChip";
import { JobSeverityChip } from "./JobSeverityChip";
import { JobSlaBar } from "./JobSlaBar";
import { JobTagChips } from "./JobTagChips";
import { timeAgo } from "@/lib/time";
import type { JobStatus, JobPriority, JobSeverity } from "@prisma/client";

interface Props {
  job: {
    id: string;
    publicNumber: string;
    title: string;
    status: JobStatus;
    priority: JobPriority;
    severity: JobSeverity;
    slaTargetMinutes: number;
    assignedTimestamp: Date | string | null;
    startedTimestamp: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    client: { companyName: string } | null;
    department: { key: string; nameEn: string };
    assignedEmployee: { username: string; displayName: string } | null;
    tags: { tag: { key: string; labelEn: string; colorHex: string | null } }[];
  };
  href?: string;
}

export function JobRow({ job, href }: Props) {
  const link = href ?? `/my-jobs/${job.id}`;

  return (
    <Link
      href={link}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              {job.publicNumber}
            </span>
            <JobStatusChip status={job.status} />
            <JobPriorityChip priority={job.priority} />
            <JobSeverityChip severity={job.severity} />
          </div>
          <p className="text-sm font-medium leading-snug">{job.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {job.client && <span>{job.client.companyName}</span>}
            <span>{job.department.nameEn}</span>
            {job.assignedEmployee && (
              <span>→ {job.assignedEmployee.displayName}</span>
            )}
            <span>{timeAgo(new Date(job.updatedAt))}</span>
          </div>
          <JobTagChips tags={job.tags.map((t) => t.tag)} />
        </div>
      </div>
      <div className="mt-2">
        <JobSlaBar
          assignedTimestamp={job.assignedTimestamp ? new Date(job.assignedTimestamp) : null}
          startedTimestamp={job.startedTimestamp ? new Date(job.startedTimestamp) : null}
          slaTargetMinutes={job.slaTargetMinutes}
          status={job.status}
          compact
        />
      </div>
    </Link>
  );
}
