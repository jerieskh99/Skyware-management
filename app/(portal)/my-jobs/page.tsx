import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listJobsForUser } from "@/lib/jobs/queries";
import type { JobPriority } from "@prisma/client";
import { JobRow } from "@/components/jobs/JobRow";
import { JobsPageHeader } from "@/components/jobs/JobsPageHeader";
import { JobFiltersBar } from "@/components/jobs/JobFiltersBar";
import { SavedViewBar } from "@/components/saved-views/SavedViewBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getT } from "@/lib/i18n/server";
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

  const [jobs, flags] = await Promise.all([
    listJobsForUser(user, {
      assignedToMe: !isAdmin(user),
      search: search || undefined,
      priority: priority ? [priority] : undefined,
      showClosed,
    }),
    getFeatureFlags(["saved_views_enabled", "saved_views_team_shared_enabled"]),
  ]);
  const savedViewsEnabled = flags["saved_views_enabled"] ?? false;
  const teamSharedEnabled = flags["saved_views_team_shared_enabled"] ?? false;

  const { t } = await getT();
  const admin = isAdmin(user);

  const currentFilters: Record<string, string> = {};
  if (search) currentFilters["search"] = search;
  if (priority) currentFilters["priority"] = priority;
  if (showClosed) currentFilters["closed"] = "1";

  return (
    <div className="space-y-4">
      <JobsPageHeader
        title={t("jobs.myJobsTitle")}
        description={
          admin
            ? t("jobs.myJobsDescriptionAdmin")
            : t("jobs.myJobsDescriptionEmployee")
        }
        isAdmin={admin}
      />
      {savedViewsEnabled && (
        <SavedViewBar
          scope="jobs"
          currentFilters={currentFilters}
          currentUserId={user.id}
          isAdmin={admin}
          teamSharedEnabled={teamSharedEnabled}
        />
      )}
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
              ? t("jobs.noJobsMatch")
              : showClosed
              ? t("jobs.noClosedJobs")
              : t("jobs.noActiveAssigned")
          }
          description={
            !search && !priority && !showClosed
              ? t("jobs.noActiveAssignedHint")
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
