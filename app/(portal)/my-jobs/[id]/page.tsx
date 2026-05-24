import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getJobForUser } from "@/lib/jobs/queries";
import { getFeatureFlag } from "@/lib/feature-flags";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { JobPriorityChip } from "@/components/jobs/JobPriorityChip";
import { JobSeverityChip } from "@/components/jobs/JobSeverityChip";
import { JobSlaBar } from "@/components/jobs/JobSlaBar";
import { JobTimeline } from "@/components/jobs/JobTimeline";
import { JobTagChips } from "@/components/jobs/JobTagChips";
import { JobTransitionButtons } from "@/components/jobs/JobTransitionButtons";
import { JobDetailTabs, type JobDetailTabKey } from "@/components/jobs/JobDetailTabs";
import { JobOverviewTab } from "@/components/jobs/JobOverviewTab";
import { JobTimelineTab } from "@/components/jobs/JobTimelineTab";
import { JobRelatedTab } from "@/components/jobs/JobRelatedTab";
import { JobFilesTab } from "@/components/jobs/JobFilesTab";
import { Separator } from "@/components/ui/separator";
import { formatTz, timeAgo } from "@/lib/time";
import { ArrowLeft } from "lucide-react";

const FROM_LABELS: Record<string, string> = {
  "my-jobs": "My Jobs",
  "department-jobs": "Department Jobs",
  "global-jobs": "Global Jobs",
  hub: "Task Hub",
};
const FROM_HREFS: Record<string, string> = {
  "my-jobs": "/my-jobs",
  "department-jobs": "/department-jobs",
  "global-jobs": "/global-jobs",
  hub: "/hub",
};

const VALID_TABS: JobDetailTabKey[] = ["overview", "timeline", "related", "files"];

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}

export default async function JobDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const { id } = await params;
  const sp = await searchParams;
  const from = sp["from"] ?? "my-jobs";
  const backLabel = FROM_LABELS[from] ?? "My Jobs";
  const backHref = FROM_HREFS[from] ?? "/my-jobs";

  const [job, tabsEnabled] = await Promise.all([
    getJobForUser(user, id),
    getFeatureFlag("job_detail_tabs_enabled"),
  ]);
  if (!job) notFound();

  const admin = isAdmin(user);
  const requestedTab = sp["tab"];
  const activeTab: JobDetailTabKey = VALID_TABS.includes(
    requestedTab as JobDetailTabKey
  )
    ? (requestedTab as JobDetailTabKey)
    : "overview";

  const header = (
    <>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {backLabel}
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {job.publicNumber}
          </span>
          <JobStatusChip status={job.status} />
          <JobPriorityChip priority={job.priority} />
          <JobSeverityChip severity={job.severity} />
        </div>
        <h1 className="text-xl font-semibold">{job.title}</h1>
        {!tabsEnabled && (
          <JobSlaBar
            assignedTimestamp={job.assignedTimestamp}
            startedTimestamp={job.startedTimestamp}
            slaTargetMinutes={job.slaTargetMinutes}
            status={job.status}
          />
        )}
        <JobTagChips tags={job.tags.map((t) => t.tag)} />
      </div>
    </>
  );

  if (tabsEnabled) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        {header}
        <JobDetailTabs jobId={job.id} active={activeTab} from={from} />
        {activeTab === "overview" && (
          <JobOverviewTab job={job} admin={admin} currentUserId={user.id} />
        )}
        {activeTab === "timeline" && <JobTimelineTab job={job} />}
        {activeTab === "related" && <JobRelatedTab job={job} />}
        {activeTab === "files" && (
          <JobFilesTab
            jobId={job.id}
            currentUserId={user.id}
            isAdmin={admin}
            canUpload={admin || job.assignedEmployeeId === user.id}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {job.description && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Description
              </h2>
              <p className="text-sm whitespace-pre-wrap">{job.description}</p>
            </section>
          )}

          {job.workReport && (
            <section className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Work Summary
              </h2>
              <p className="text-sm whitespace-pre-wrap">{job.workReport.summary}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(job.workReport.totalTimeMinutes / 60 * 10) / 10}h by{" "}
                {job.workReport.submittedBy.displayName}
                {" "}
                <span title={formatTz(new Date(job.workReport.submittedAt))}>
                  {timeAgo(new Date(job.workReport.submittedAt))}
                </span>
              </p>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Timeline
            </h2>
            <JobTimeline events={job.statusEvents} />
          </section>
        </div>

        <div className="space-y-5">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Actions
            </h2>
            <JobTransitionButtons
              jobId={job.id}
              jobTitle={job.title}
              currentStatus={job.status}
              assignedEmployeeId={job.assignedEmployeeId}
              currentUserId={user.id}
              isAdmin={admin}
            />
          </section>

          <Separator />

          <section className="space-y-2.5 text-sm">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
              {job.client && (
                <>
                  <dt className="text-muted-foreground">Client</dt>
                  <dd className="font-medium">{job.client.companyName}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Department</dt>
              <dd>{job.department.nameEn}</dd>
              <dt className="text-muted-foreground">Created by</dt>
              <dd>{job.createdBy.displayName}</dd>
              <dt className="text-muted-foreground">Assigned to</dt>
              <dd>{job.assignedEmployee?.displayName ?? "Unassigned"}</dd>
              <dt className="text-muted-foreground">Time spent</dt>
              <dd>{job.timeSpentMinutes ? `${Math.round(job.timeSpentMinutes / 60 * 10) / 10}h` : "0h"}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd title={formatTz(new Date(job.createdAt))}>{timeAgo(new Date(job.createdAt))}</dd>
            </dl>
          </section>

          {admin && job.adminNote && (
            <>
              <Separator />
              <section className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Admin note
                </p>
                <p className="text-sm">{job.adminNote}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
