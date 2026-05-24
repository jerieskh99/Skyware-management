import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listJobsForUser } from "@/lib/jobs/queries";
import { JobRow } from "@/components/jobs/JobRow";
import { JobsPageHeader } from "@/components/jobs/JobsPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { getT } from "@/lib/i18n/server";
import { Layers } from "lucide-react";

const DEPT_KEYS = ["helpdesk", "it", "rnd", "global"] as const;

export default async function DepartmentJobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const admin = isAdmin(user);
  const { t } = await getT();

  const deptLabel = (key: string) => {
    const known = (DEPT_KEYS as readonly string[]).includes(key) ? t(`department.${key}`) : key;
    return known;
  };

  if (admin) {
    // Admin sees a tab strip for each department
    return (
      <div className="space-y-4">
        <JobsPageHeader title={t("jobs.departmentJobsTitle")} isAdmin />
        <div className="flex gap-2">
          {(["helpdesk", "it", "rnd"] as const).map((dept) => (
            <Link
              key={dept}
              href={`/department-jobs/${dept}`}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {t(`department.${dept}`)}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Employees see their own department
  const jobs = await listJobsForUser(user, {
    departmentKey: user.departmentKey,
  });

  const label = deptLabel(user.departmentKey);

  return (
    <div className="space-y-4">
      <JobsPageHeader title={`${label} ${t("jobs.departmentJobsTitleSuffix")}`} isAdmin={false} />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("jobs.noDepartmentYet")}
          description={t("jobs.departmentJobsDescription")}
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} href={`/my-jobs/${job.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
