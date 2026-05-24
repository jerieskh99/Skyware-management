import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listJobsForUser } from "@/lib/jobs/queries";
import type { JobPriority } from "@prisma/client";
import { JobRow } from "@/components/jobs/JobRow";
import { JobsPageHeader } from "@/components/jobs/JobsPageHeader";
import { JobFiltersBar } from "@/components/jobs/JobFiltersBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { Briefcase } from "lucide-react";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function MyJobsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const params = await searchParams;
  const search = params["search"] ?? "";
  const priority = params["priority"] as JobPriority | undefined;
  const showClosed = params["closed"] === "1";

  const jobs = await listJobsForUser(user, {
    assignedToMe: !isAdmin(user),
    search: search || undefined,
    priority: priority ? [priority] : undefined,
    showClosed,
  });

  return (
    <div className="space-y-4">
      <JobsPageHeader
        title="My Jobs"
        description={
          isAdmin(user)
            ? "All jobs you can see across the team."
            : "Jobs currently assigned to you."
        }
        isAdmin={isAdmin(user)}
      />
      <JobFiltersBar
        initialSearch={search}
        initialPriority={priority ?? ""}
        showClosed={showClosed}
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={
            search || priority
              ? "No jobs match your filters."
              : showClosed
              ? "No closed jobs."
              : "No active jobs assigned to you."
          }
          description={
            !search && !priority && !showClosed
              ? "Check the Task Hub for available tasks."
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} href={`/my-jobs/${job.id}?from=my-jobs`} />
          ))}
        </div>
      )}
    </div>
  );
}
