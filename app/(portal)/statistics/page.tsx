import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import {
  getOverviewKpis,
  getEmployeeStats,
  getDepartmentStats,
  getClientStats,
} from "@/lib/statistics/queries";
import { getT } from "@/lib/i18n/server";
import {
  BarChart2,
  Mail,
  Users,
  Building2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Briefcase,
} from "lucide-react";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function StatisticsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const range = ["7", "30", "90"].includes(sp["range"] ?? "") ? sp["range"] : "30";
  const rangeDays = Number(range);

  const [overview, employees, departments, clients] = await Promise.all([
    getOverviewKpis(rangeDays),
    getEmployeeStats(rangeDays),
    getDepartmentStats(rangeDays),
    getClientStats(rangeDays),
  ]);

  const { t } = await getT();

  const RANGE_OPTIONS = [
    { value: "7", label: t("statistics.range7") },
    { value: "30", label: t("statistics.range30") },
    { value: "90", label: t("statistics.range90") },
  ];

  const rangeLabel =
    RANGE_OPTIONS.find((o) => o.value === range)?.label ?? t("statistics.range30");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("statistics.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("statistics.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/statistics?range=${opt.value}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                range === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </Link>
          ))}
          <Link
            href="/statistics/email-to-job"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            <Mail className="h-3.5 w-3.5" />
            {t("statistics.emailToJob")}
          </Link>
        </div>
      </div>

      {/* Overview KPI cards */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("statistics.overview")} — {rangeLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={Briefcase}
            label={t("statistics.kpiActive")}
            value={overview.activeJobs}
            colorClass="text-blue-600"
          />
          <KpiCard
            icon={CheckCircle2}
            label={t("statistics.kpiCompleted")}
            value={overview.completedCount}
            colorClass="text-green-600"
          />
          <KpiCard
            icon={AlertTriangle}
            label={t("statistics.kpiDelayed")}
            value={overview.delayedCount}
            colorClass={overview.delayedCount > 0 ? "text-amber-600" : "text-muted-foreground"}
          />
          <KpiCard
            icon={RefreshCw}
            label={t("statistics.kpiReopenEvents")}
            value={overview.reopenedEventsCount}
            colorClass={overview.reopenedEventsCount > 0 ? "text-orange-600" : "text-muted-foreground"}
            note={t("statistics.kpiReopenNote")}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={CheckCircle2}
            label={t("statistics.kpiReviewed")}
            value={overview.reviewedCount}
            colorClass="text-emerald-600"
          />
          <KpiCard
            icon={Clock}
            label={t("statistics.kpiHoursReported")}
            value={overview.totalHoursReported}
            suffix="h"
            colorClass="text-indigo-600"
          />
          <KpiCard
            icon={Clock}
            label={t("statistics.kpiAvgCompletion")}
            value={overview.avgCompletionHours ?? "-"}
            suffix={overview.avgCompletionHours !== null ? "h" : ""}
            colorClass="text-slate-600"
            note={
              overview.completionSampleSize > 0
                ? `${t("statistics.kpiCompletionNote")}. median ${overview.medianCompletionHours ?? "-"}h. p90 ${overview.p90CompletionHours ?? "-"}h. n=${overview.completionSampleSize}`
                : t("statistics.kpiCompletionNote")
            }
          />
          <KpiCard
            icon={Briefcase}
            label={t("statistics.kpiCancelled")}
            value={overview.cancelledCount}
            colorClass="text-red-500"
          />
        </div>
      </section>

      {/* Employee breakdown */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("statistics.employeeActivity")} — {rangeLabel}
          </h2>
        </div>
        {employees.length === 0 ? (
          <EmptyState message={t("statistics.noEmployees")} />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Th>{t("statistics.colEmployee")}</Th>
                  <Th>{t("statistics.colDepartment")}</Th>
                  <Th align="right">{t("statistics.colActive")}</Th>
                  <Th align="right">{t("statistics.colCompleted")}</Th>
                  <Th align="right">{t("statistics.colHours")}</Th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-accent/20">
                    <Td>{emp.displayName}</Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {emp.department}
                      </span>
                    </Td>
                    <Td align="right">
                      <NumBadge value={emp.activeCount} warn={emp.activeCount > 5} />
                    </Td>
                    <Td align="right">{emp.completedCount}</Td>
                    <Td align="right">{emp.hoursReported}h</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Department breakdown */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("statistics.departmentActivity")}
          </h2>
        </div>
        {departments.length === 0 ? (
          <EmptyState message={t("statistics.noDepartments")} />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Th>{t("statistics.colDept")}</Th>
                  <Th align="right">{t("statistics.colActiveShort")}</Th>
                  <Th align="right">{t("statistics.colCompleted")}</Th>
                  <Th align="right">{t("statistics.colDelayed")}</Th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr
                    key={dept.key}
                    className="border-b last:border-0 hover:bg-accent/20"
                  >
                    <Td>{dept.nameEn}</Td>
                    <Td align="right">{dept.activeCount}</Td>
                    <Td align="right">{dept.completedCount}</Td>
                    <Td align="right">
                      <NumBadge value={dept.delayedCount} warn={dept.delayedCount > 0} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Client workload */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("statistics.clientWorkload")} — {rangeLabel}
          </h2>
        </div>
        {clients.length === 0 ? (
          <EmptyState message={t("statistics.noClients")} />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Th>{t("statistics.colClient")}</Th>
                  <Th align="right">{t("statistics.colTotal")}</Th>
                  <Th align="right">{t("statistics.colActiveShort")}</Th>
                  <Th align="right">{t("statistics.colCompleted")}</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-accent/20"
                  >
                    <Td>
                      <Link
                        href={`/clients/${c.id}`}
                        className="hover:underline"
                      >
                        {c.companyName}
                      </Link>
                    </Td>
                    <Td align="right">{c.totalJobs}</Td>
                    <Td align="right">{c.activeCount}</Td>
                    <Td align="right">{c.completedCount}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer note */}
      <p className="text-[11px] text-muted-foreground">
        {t("statistics.footerNote")}
      </p>
    </div>
  );
}

// ─── Shared sub-components (server RSC helpers) ──────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  colorClass,
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  suffix?: string;
  colorClass: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        {label}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value}
        {suffix && <span className="text-sm font-medium">{suffix}</span>}
      </p>
      {note && <p className="mt-0.5 text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td className={`px-4 py-3 ${align === "right" ? "text-right tabular-nums" : ""}`}>
      {children}
    </td>
  );
}

function NumBadge({ value, warn }: { value: number; warn: boolean }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        warn
          ? "bg-amber-100 text-amber-700"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
