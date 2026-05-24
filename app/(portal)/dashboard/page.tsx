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
  getHourlyBanksLow,
  type HourlyBankLowRow,
} from "@/lib/dashboard/queries";
import { getAgingBuckets, type AgingBuckets } from "@/lib/billing/queries";
import { getFeatureFlags } from "@/lib/feature-flags";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { JobPriorityChip } from "@/components/jobs/JobPriorityChip";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { AgingStrip } from "@/components/billing/AgingStrip";
import { getT } from "@/lib/i18n/server";
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
  Clock,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t } = await getT();

  if (isAdmin(user)) {
    const flags = await getFeatureFlags(["aging_buckets_enabled", "hourly_burn_enabled"]);
    const agingEnabled = flags["aging_buckets_enabled"] ?? false;
    const burnEnabled = flags["hourly_burn_enabled"] ?? false;

    const [kpis, lists, agingBuckets, banksLow] = await Promise.all([
      getAdminKpis(),
      getAdminDashboardLists(),
      agingEnabled ? getAgingBuckets() : Promise.resolve(null),
      burnEnabled ? getHourlyBanksLow() : Promise.resolve([] as HourlyBankLowRow[]),
    ]);
    return (
      <AdminDashboard
        user={user}
        kpis={kpis}
        lists={lists}
        agingBuckets={agingBuckets}
        banksLow={banksLow}
        burnEnabled={burnEnabled}
        t={t}
      />
    );
  }

  const [kpis, lists] = await Promise.all([
    getEmployeeKpis(user.id),
    getEmployeeDashboardLists(user.id),
  ]);
  return <EmployeeDashboard user={user} kpis={kpis} lists={lists} t={t} />;
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
type T = (key: string) => string;

function AdminDashboard({
  user,
  kpis,
  lists,
  agingBuckets,
  banksLow,
  burnEnabled,
  t,
}: {
  user: SessionUser;
  kpis: AdminKpis;
  lists: AdminLists;
  agingBuckets: AgingBuckets | null;
  banksLow: HourlyBankLowRow[];
  burnEnabled: boolean;
  t: T;
}) {
  const greet = greeting(t);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greet}, ${user.username}.`}
        description={t("dashboard.adminDescription")}
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("dashboard.kpiActive")}
          value={kpis.activeCount}
          icon={Briefcase}
          tone="brand"
          href="/my-jobs"
        />
        <KpiCard
          label={t("dashboard.kpiDelayed")}
          value={kpis.delayedCount}
          icon={Hourglass}
          tone={kpis.delayedCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label={t("dashboard.kpiNeedsReview")}
          value={kpis.reviewsCount}
          icon={ClipboardCheck}
          tone={kpis.reviewsCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label={t("dashboard.kpiUnpaid")}
          value={kpis.unpaidCount}
          icon={CreditCard}
          tone={kpis.overdueCount > 0 ? "danger" : "default"}
          note={kpis.overdueCount > 0 ? `${kpis.overdueCount} ${t("dashboard.noteOverdue")}` : undefined}
          href="/billing"
        />
      </div>

      {/* Receivables aging strip (feature-flagged) */}
      {agingBuckets && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("dashboard.agingTitle")}</h2>
          <AgingStrip
            buckets={agingBuckets}
            hrefFor={(b) => `/billing?aging=${b}`}
            labels={{
              title: t("billing.aging.title"),
              b0_30: t("billing.aging.b0_30"),
              b31_60: t("billing.aging.b31_60"),
              b61_90: t("billing.aging.b61_90"),
              b91_plus: t("billing.aging.b91_plus"),
              count: t("billing.aging.count"),
              amount: t("billing.aging.amount"),
              empty: t("billing.aging.empty"),
            }}
          />
        </section>
      )}

      {/* Hourly banks low strip (feature-flagged) */}
      {burnEnabled && (
        <BanksLowSection rows={banksLow} t={t} />
      )}

      {/* Quick actions */}
      <QuickActions
        actions={[
          { href: "/hub", label: t("dashboard.actionTaskHub"), icon: Inbox, hint: t("dashboard.quickHubHint") },
          { href: "/my-jobs", label: t("dashboard.actionReviewJobs"), icon: ClipboardCheck, hint: t("dashboard.quickReviewHint") },
          { href: "/billing", label: t("dashboard.actionOpenBilling"), icon: CreditCard, hint: t("dashboard.quickBillingHint") },
          { href: "/clients", label: t("dashboard.actionClients"), icon: Building2 },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.sectionNeedsReview")}
          icon={ClipboardCheck}
          count={lists.reviewsPending.length}
          seeAllHref="/my-jobs"
          seeAllLabel={t("common.viewAll")}
        >
          {lists.reviewsPending.length === 0 ? (
            <EmptySectionInline>{t("dashboard.emptyReviews")}</EmptySectionInline>
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
          title={t("dashboard.sectionWaitingForYou")}
          icon={Inbox}
          count={lists.waitingForAdmin.length}
          seeAllHref="/my-jobs?status=waiting_for_admin"
          seeAllLabel={t("common.viewAll")}
        >
          {lists.waitingForAdmin.length === 0 ? (
            <EmptySectionInline>{t("dashboard.emptyWaitingAdmin")}</EmptySectionInline>
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
            title={t("dashboard.sectionPastSla")}
            icon={AlertTriangle}
            count={lists.delayed.length}
            seeAllHref="/my-jobs"
            seeAllLabel={t("common.viewAll")}
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
  t,
}: {
  user: SessionUser;
  kpis: EmployeeKpis;
  lists: EmployeeLists;
  t: T;
}) {
  const greet = greeting(t);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greet}, ${user.username}.`}
        description={t("dashboard.employeeDescription")}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={t("dashboard.kpiActive")}
          value={kpis.activeCount}
          icon={Briefcase}
          tone="brand"
          href="/my-jobs"
        />
        <KpiCard
          label={t("dashboard.kpiDelayed")}
          value={kpis.delayedCount}
          icon={Hourglass}
          tone={kpis.delayedCount > 0 ? "warn" : "default"}
          href="/my-jobs"
        />
        <KpiCard
          label={t("dashboard.kpiHoursThisWeek")}
          value={`${kpis.hoursThisWeek}h`}
          icon={Timer}
        />
      </div>

      <QuickActions
        actions={[
          { href: "/my-jobs", label: t("dashboard.actionMyJobs"), icon: Briefcase },
          { href: "/hub", label: t("dashboard.actionTaskHub"), icon: Inbox, hint: t("dashboard.quickHubEmployeeHint") },
          { href: "/communication", label: t("dashboard.actionChannels"), icon: MessageSquare },
          { href: "/department-jobs", label: t("dashboard.actionDepartment"), icon: CalendarClock },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.sectionWorkingOnIt")}
          icon={Timer}
          count={lists.working.length}
          seeAllHref="/my-jobs"
          seeAllLabel={t("common.viewAll")}
        >
          {lists.working.length === 0 ? (
            <EmptySectionInline>{t("dashboard.emptyWorking")}</EmptySectionInline>
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
          title={t("dashboard.sectionAssignedNotStarted")}
          icon={Inbox}
          count={lists.assigned.length}
          seeAllHref="/my-jobs"
          seeAllLabel={t("common.viewAll")}
        >
          {lists.assigned.length === 0 ? (
            <EmptySectionInline>{t("dashboard.emptyAssigned")}</EmptySectionInline>
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

function greeting(t: T): string {
  const h = new Date().getHours();
  if (h < 5) return t("dashboard.greetingLate");
  if (h < 12) return t("dashboard.greetingMorning");
  if (h < 18) return t("dashboard.greetingAfternoon");
  return t("dashboard.greetingEvening");
}

function EmptySectionInline({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-6 text-center text-xs text-muted-foreground">{children}</p>
  );
}

function fmtMinutesShort(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtMonths(months: number | null, t: T): string {
  if (months === null) return t("billing.burn.monthsRemainingNa");
  if (months < 0.1) return "< 0.1";
  return months.toFixed(1);
}

function BanksLowSection({ rows, t }: { rows: HourlyBankLowRow[]; t: T }) {
  return (
    <SectionCard
      title={t("dashboard.banksLowTitle")}
      icon={Clock}
      count={rows.length}
      seeAllHref="/billing"
      seeAllLabel={t("common.viewAll")}
      className={rows.length > 0 ? "border-warn/30 bg-warn-soft/30" : undefined}
    >
      {rows.length === 0 ? (
        <EmptySectionInline>{t("dashboard.banksLowEmpty")}</EmptySectionInline>
      ) : (
        <div className="divide-y">
          {rows.map((r) => (
            <Link
              key={r.bankId}
              href={`/clients/${r.clientId}?tab=billing`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("billing.burn.remaining")}: {fmtMinutesShort(r.remainingMinutes)}
                  {" · "}
                  {t("billing.burn.avgMonthly")}: {fmtMinutesShort(Math.round(r.avgMonthlyMinutes))}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-semibold">
                  {fmtMonths(r.projectedMonthsRemaining, t)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("billing.burn.monthsRemaining")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
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
