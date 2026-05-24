import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin, canAccessDepartment } from "@/lib/permissions";
import { listJobsForUser } from "@/lib/jobs/queries";
import type { JobPriority } from "@prisma/client";
import { JobRow } from "@/components/jobs/JobRow";
import { JobsPageHeader } from "@/components/jobs/JobsPageHeader";
import { JobFiltersBar } from "@/components/jobs/JobFiltersBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { getT } from "@/lib/i18n/server";
import { Layers } from "lucide-react";

const VALID = ["helpdesk", "it", "rnd", "global"] as const;
type Dept = (typeof VALID)[number];

interface Props {
  params: Promise<{ dept: string }>;
  searchParams: Promise<Record<string, string>>;
}

export default async function DeptPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const { dept } = await params;
  if (!VALID.includes(dept as Dept)) notFound();
  if (!canAccessDepartment(user, dept)) notFound();

  const sp = await searchParams;
  const search = sp["search"] ?? "";
  const priority = sp["priority"] as JobPriority | undefined;
  const showClosed = sp["closed"] === "1";

  const jobs = await listJobsForUser(user, {
    departmentKey: dept,
    search: search || undefined,
    priority: priority ? [priority] : undefined,
    showClosed,
  });

  const admin = isAdmin(user);
  const { t } = await getT();
  const label = t(`department.${dept}`);

  return (
    <div className="space-y-4">
      <JobsPageHeader title={`${label} ${t("jobs.departmentJobsTitleSuffix")}`} isAdmin={admin} />
      <JobFiltersBar
        initialSearch={search}
        initialPriority={priority ?? ""}
        showClosed={showClosed}
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={search || priority ? t("jobs.noJobsMatch") : t("jobs.noDepartmentYet")}
          description={
            !search && !priority && !showClosed
              ? t("jobs.departmentJobsDescription")
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} href={`/my-jobs/${job.id}?from=department-jobs`} />
          ))}
        </div>
      )}
    </div>
  );
}
