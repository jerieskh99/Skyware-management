import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listJobsForUser } from "@/lib/jobs/queries";
import { JobRow } from "@/components/jobs/JobRow";
import { JobsPageHeader } from "@/components/jobs/JobsPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Layers } from "lucide-react";

const DEPT_LABELS: Record<string, string> = {
  helpdesk: "Helpdesk",
  it: "IT",
  rnd: "R&D",
  global: "Global",
};

export default async function DepartmentJobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const admin = isAdmin(user);

  if (admin) {
    // Admin sees a tab strip for each department
    return (
      <div className="space-y-4">
        <JobsPageHeader title="Department Jobs" isAdmin />
        <div className="flex gap-2">
          {(["helpdesk", "it", "rnd"] as const).map((dept) => (
            <Link
              key={dept}
              href={`/department-jobs/${dept}`}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {DEPT_LABELS[dept]}
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

  const deptLabel = DEPT_LABELS[user.departmentKey] ?? user.departmentKey;

  return (
    <div className="space-y-4">
      <JobsPageHeader title={`${deptLabel} Jobs`} isAdmin={false} />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={`No jobs in ${deptLabel} yet.`}
          description="Jobs assigned to this department will appear here."
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
