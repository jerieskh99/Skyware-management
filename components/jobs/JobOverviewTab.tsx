import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/ui/tooltip";
import { JobSlaBar } from "./JobSlaBar";
import { JobTransitionButtons } from "./JobTransitionButtons";
import { JobReassignControl } from "./JobReassignControl";
import { JobActiveTimerPanel } from "./JobActiveTimerPanel";
import { CreateKnowledgeFromJobButton } from "./CreateKnowledgeFromJobButton";
import { formatTz, timeAgo } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import type { JobDetail } from "@/lib/jobs/queries";

interface Props {
  job: JobDetail;
  admin: boolean;
  currentUserId: string;
}

export async function JobOverviewTab({ job, admin, currentUserId }: Props) {
  const { t } = await getT();
  const knowledgeEnabled = await getFeatureFlag("knowledge_articles_enabled");
  const showCreateKnowledge =
    knowledgeEnabled &&
    job.status === "reviewed" &&
    (admin || job.assignedEmployeeId === currentUserId);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            SLA
          </h2>
          <InfoTooltip label={t("jobs.detail.tooltipSla")}>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground"
              aria-hidden="true"
            >
              ?
            </span>
          </InfoTooltip>
        </div>
        <JobSlaBar
          assignedTimestamp={job.assignedTimestamp}
          startedTimestamp={job.startedTimestamp}
          slaTargetMinutes={job.slaTargetMinutes}
          status={job.status}
        />

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
              {Math.round((job.workReport.totalTimeMinutes / 60) * 10) / 10}h by{" "}
              {job.workReport.submittedBy.displayName}{" "}
              <span title={formatTz(new Date(job.workReport.submittedAt))}>
                {timeAgo(new Date(job.workReport.submittedAt))}
              </span>
            </p>
          </section>
        )}

        <JobActiveTimerPanel jobId={job.id} />
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
            currentUserId={currentUserId}
            isAdmin={admin}
          />
          {admin && (
            <JobReassignControl
              jobId={job.id}
              currentAssigneeId={job.assignedEmployeeId}
            />
          )}
          {showCreateKnowledge && <CreateKnowledgeFromJobButton jobId={job.id} />}
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
            <dd>
              {job.timeSpentMinutes
                ? `${Math.round((job.timeSpentMinutes / 60) * 10) / 10}h`
                : "0h"}
            </dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd title={formatTz(new Date(job.createdAt))}>
              {timeAgo(new Date(job.createdAt))}
            </dd>
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
  );
}
