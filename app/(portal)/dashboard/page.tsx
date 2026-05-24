import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import {
  getAdminKpis,
  getAdminDashboardLists,
  getEmployeeKpis,
  getEmployeeDashboardLists,
} from "@/lib/dashboard/queries";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { JobPriorityChip } from "@/components/jobs/JobPriorityChip";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { SectionCard } from "@/components/shared/SectionCard";
import {
  Briefcase,
  AlertTriangle,
  ClipboardCheck,
  CreditCard,
  Inbox,
  MessageSquare,
  Building2,
  Timer,
  CalendarClock,
  Hourglass,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  if (isAdmin(user)) {
    const [kpis, lists] = await Promise.all([
      getAdminKpis(),
      getAdminDashboardLists(),
    ]);
    return <AdminDashboard user={user} kpis={kpis} lists={lists} />;
  }

  const [kpis, lists] = await Promise.all([
    getEmployeeKpis(user.id),
    getEmployeeDashboardLists(user.id),
  ]);
  return <EmployeeDashboard user={user} kpis={kpis} lists={lists} />;
}

// ── Quick actions strip ─────────────────────────────────────────────────────

interface QuickAction {
  href: string;
  label: string;
  icon: React.ElementType;
  hint?: string;
}

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map(({ href, label, icon: Icon, hint }) => (
        <Link
          key={href + label}
          href={href}
          className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-brand-soft group-hover:text-brand">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{label}</p>
            {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Admin ──────────────────────────────────────────────────────────────────

type AdminKpis = Awaited<ReturnType<typeof getAdminKpis>>;
type AdminLists = Awaited<ReturnType<typeof getAdminDashboardLists>>;

function AdminDashboard({
  user,
  kpis,
  lists,
}: {
  user: SessionUser;
  kpis: AdminKpis;
  lists: AdminLists;
}) {
  const greet = greeting();

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greet}, ${user.username}.`}
        description="Here's what needs your attention across the team today."
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active jobs"
          value={kpis.activeCount}
          icon={Briefcase}
          tone="brand"
          href="/my-jobs"
        />
        <KpiCard
          label="Delayed"
          value={kpis.delayedCount}
          icon={Hourglass}
          tone={kpis.delayedCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label="Needs review"
          value={kpis.reviewsCount}
          icon={ClipboardCheck}
          tone={kpis.reviewsCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label="Unpaid"
          value={kpis.unpaidCount}
          icon={CreditCard}
          tone={kpis.overdueCount > 0 ? "danger" : "default"}
          note={kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : undefined}
          href="/billing"
        />
      </div>

      {/* Quick actions */}
      <QuickActions
        actions={[
          { href: "/hub", label: "Task Hub", icon: Inbox, hint: "Available tasks to take" },
          { href: "/my-jobs", label: "Review jobs", icon: ClipboardCheck, hint: "Mark as reviewed" },
          { href: "/billing", label: "Open billing", icon: CreditCard, hint: "Aging payments" },
          { href: "/clients", label: "Clients", icon: Building2 },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Needs review"
          icon={ClipboardCheck}
          count={lists.reviewsPending.length}
          seeAllHref="/my-jobs"
        >
          {lists.reviewsPending.length === 0 ? (
            <EmptySectionInline>No jobs waiting for review.</EmptySectionInline>
          ) : (
            <div className="space-y-1">
              {lists.reviewsPending.map((j) => (
                <JobMiniRow
                  key={j.id}
                  id={j.id}
                  publicNumber={j.publicNumber}
                  title={j.title}
                  priority={j.priority}
                  meta={j.client?.companyName}
                  assignee={j.assignedEmployee?.displayName}
                  status="done"
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Waiting for you"
          icon={Inbox}
          count={lists.waitingForAdmin.length}
          seeAllHref="/my-jobs?status=waiting_for_admin"
        >
          {lists.waitingForAdmin.length === 0 ? (
            <EmptySectionInline>No jobs waiting for admin.</EmptySectionInline>
          ) : (
            <div className="space-y-1">
              {lists.waitingForAdmin.map((j) => (
                <JobMiniRow
                  key={j.id}
                  id={j.id}
                  publicNumber={j.publicNumber}
                  title={j.title}
                  priority={j.priority}
                  meta={j.client?.companyName}
                  assignee={j.assignedEmployee?.displayName}
                  status="waiting_for_admin"
                />
              ))}
            </div>
          )}
        </SectionCard>

        {lists.delayed.length > 0 && (
          <SectionCard
            title="Past SLA"
            icon={AlertTriangle}
            count={lists.delayed.length}
            seeAllHref="/my-jobs"
            className="border-warn/30 bg-warn-soft/30 lg:col-span-2"
          >
            <div className="space-y-1">
              {lists.delayed.map((j) => (
                <JobMiniRow
                  key={j.id}
                  id={j.id}
                  publicNumber={j.publicNumber}
                  title={j.title}
                  priority={j.priority}
                  meta={j.client?.companyName}
                  assignee={j.assignedEmployee?.displayName}
                />
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ── Employee ────────────────────────────────────────────────────────────────

type EmployeeKpis = Awaited<ReturnType<typeof getEmployeeKpis>>;
type EmployeeLists = Awaited<ReturnType<typeof getEmployeeDashboardLists>>;

function EmployeeDashboard({
  user,
  kpis,
  lists,
}: {
  user: SessionUser;
  kpis: EmployeeKpis;
  lists: EmployeeLists;
}) {
  const greet = greeting();

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greet}, ${user.username}.`}
        description="Your jobs for today and the week."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Active jobs"
          value={kpis.activeCount}
          icon={Briefcase}
          tone="brand"
          href="/my-jobs"
        />
        <KpiCard
          label="Delayed"
          value={kpis.delayedCount}
          icon={Hourglass}
          tone={kpis.delayedCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label="Hours this week"
          value={`${kpis.hoursThisWeek}h`}
          icon={Timer}
        />
      </div>

      <QuickActions
        actions={[
          { href: "/my-jobs", label: "My jobs", icon: Briefcase },
          { href: "/hub", label: "Task Hub", icon: Inbox, hint: "Take a task" },
          { href: "/communication", label: "Channels", icon: MessageSquare },
          { href: "/department-jobs", label: "Department", icon: CalendarClock },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Working on it"
          icon={Timer}
          count={lists.working.length}
          seeAllHref="/my-jobs"
        >
          {lists.working.length === 0 ? (
            <EmptySectionInline>No active jobs.</EmptySectionInline>
          ) : (
            <div className="space-y-1">
              {lists.working.map((j) => (
                <JobMiniRow
                  key={j.id}
                  id={j.id}
                  publicNumber={j.publicNumber}
                  title={j.title}
                  priority={j.priority}
                  meta={j.client?.companyName}
                  status="working_on_it"
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Assigned, not started"
          icon={Inbox}
          count={lists.assigned.length}
          seeAllHref="/my-jobs"
        >
          {lists.assigned.length === 0 ? (
            <EmptySectionInline>Nothing waiting to start.</EmptySectionInline>
          ) : (
            <div className="space-y-1">
              {lists.assigned.map((j) => (
                <JobMiniRow
                  key={j.id}
                  id={j.id}
                  publicNumber={j.publicNumber}
                  title={j.title}
                  priority={j.priority}
                  meta={j.client?.companyName}
                  status="assigned"
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function EmptySectionInline({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-6 text-center text-xs text-muted-foreground">{children}</p>
  );
}

type JobStatus = import("@prisma/client").JobStatus;
type JobPriority = import("@prisma/client").JobPriority;

function JobMiniRow({
  id,
  publicNumber,
  title,
  priority,
  meta,
  assignee,
  status,
}: {
  id: string;
  publicNumber: string;
  title: string;
  priority: JobPriority;
  meta?: string | null;
  assignee?: string | null;
  status?: JobStatus;
}) {
  return (
    <Link
      href={`/my-jobs/${id}`}
      className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground">{publicNumber}</span>
          <JobPriorityChip priority={priority} />
          {status && <JobStatusChip status={status} />}
        </div>
        <p className="mt-0.5 truncate font-medium leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground">
          {[meta, assignee].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
