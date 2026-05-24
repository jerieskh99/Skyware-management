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
import { getT } from "@/lib/i18n/server";
import { Globe } from "lucide-react";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function GlobalJobsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const params = await searchParams;
  const search = params["search"] ?? "";
  const priority = params["priority"] as JobPriority | undefined;
  const showClosed = params["closed"] === "1";

  const jobs = await listJobsForUser(user, {
    departmentKey: "global",
    search: search || undefined,
    priority: priority ? [priority] : undefined,
    showClosed,
  });

  const { t } = await getT();

  return (
    <div className="space-y-4">
      <JobsPageHeader title={t("jobs.globalJobsTitle")} isAdmin={isAdmin(user)} />
      <JobFiltersBar
        initialSearch={search}
        initialPriority={priority ?? ""}
        showClosed={showClosed}
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={search || priority ? t("jobs.noJobsMatch") : t("jobs.noGlobalYet")}
          description={
            !search && !priority && !showClosed
              ? t("jobs.globalJobsDescription")
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} href={`/my-jobs/${job.id}?from=global-jobs`} />
          ))}
        </div>
      )}
    </div>
  );
}
