import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getSelfStats } from "@/lib/statistics/queries";
import { getFeatureFlag } from "@/lib/feature-flags";
import { getT } from "@/lib/i18n/server";
import { InfoTooltip } from "@/components/ui/tooltip";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  Activity,
  HelpCircle,
} from "lucide-react";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function MyStatisticsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const flagOn = await getFeatureFlag("statistics_me_enabled");
  if (!flagOn && !isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const range = ["7", "30", "90"].includes(sp["range"] ?? "") ? sp["range"] : "30";
  const rangeDays = Number(range);

  const stats = await getSelfStats(user.id, rangeDays);
  const { t } = await getT();

  const RANGE_OPTIONS = [
    { value: "7", label: t("statistics.range7") },
    { value: "30", label: t("statistics.range30") },
    { value: "90", label: t("statistics.range90") },
  ];

  const rangeLabel =
    RANGE_OPTIONS.find((o) => o.value === range)?.label ?? t("statistics.range30");

  const sampleNote =
    stats.completionSampleSize > 0
      ? t("statisticsMe.sampleSize").replace("{n}", String(stats.completionSampleSize))
      : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("statisticsMe.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("statisticsMe.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={`/statistics/me?range=${opt.value}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                range === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {rangeLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={Briefcase}
            label={t("statisticsMe.kpiActive")}
            tooltip={t("statisticsMe.kpiActiveTip")}
            value={stats.activeCount}
            colorClass="text-blue-600"
          />
          <KpiCard
            icon={CheckCircle2}
            label={t("statisticsMe.kpiCompleted")}
            tooltip={t("statisticsMe.kpiCompletedTip")}
            value={stats.completedInWindow}
            colorClass="text-green-600"
          />
          <KpiCard
            icon={Clock}
            label={t("statisticsMe.kpiHours")}
            tooltip={t("statisticsMe.kpiHoursTip")}
            value={stats.hoursReportedInWindow}
            suffix="h"
            colorClass="text-indigo-600"
          />
          <KpiCard
            icon={RefreshCw}
            label={t("statisticsMe.kpiReopens")}
            tooltip={t("statisticsMe.kpiReopensTip")}
            value={stats.reopenEventsInWindow}
            colorClass={
              stats.reopenEventsInWindow > 0 ? "text-orange-600" : "text-muted-foreground"
            }
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={Activity}
            label={t("statisticsMe.kpiAvg")}
            tooltip={t("statisticsMe.kpiAvgTip")}
            value={stats.avgCompletionHours ?? "-"}
            suffix={stats.avgCompletionHours !== null ? "h" : ""}
            colorClass="text-slate-600"
            note={sampleNote}
          />
          <KpiCard
            icon={Activity}
            label={t("statisticsMe.kpiMedian")}
            tooltip={t("statisticsMe.kpiMedianTip")}
            value={stats.medianCompletionHours ?? "-"}
            suffix={stats.medianCompletionHours !== null ? "h" : ""}
            colorClass="text-slate-600"
            note={sampleNote}
          />
          <KpiCard
            icon={Activity}
            label={t("statisticsMe.kpiP90")}
            tooltip={t("statisticsMe.kpiP90Tip")}
            value={stats.p90CompletionHours ?? "-"}
            suffix={stats.p90CompletionHours !== null ? "h" : ""}
            colorClass="text-slate-600"
            note={sampleNote}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("statisticsMe.sectionCurrentlyWorking")}
        </h2>
        {stats.currentlyWorking.length === 0 ? (
          <EmptyState message={t("statisticsMe.noActive")} />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Th tooltip={t("statisticsMe.colJobTip")}>{t("statisticsMe.colJob")}</Th>
                  <Th>{t("statisticsMe.colClient")}</Th>
                  <Th tooltip={t("statisticsMe.colStatusTip")}>{t("statisticsMe.colStatus")}</Th>
                  <Th tooltip={t("statisticsMe.colPriorityTip")}>{t("statisticsMe.colPriority")}</Th>
                  <Th tooltip={t("statisticsMe.colAssignedAtTip")} align="right">
                    {t("statisticsMe.colAssignedAt")}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {stats.currentlyWorking.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-accent/20">
                    <Td>
                      <Link href={`/my-jobs/${j.id}`} className="hover:underline">
                        <span className="font-medium">{j.publicNumber}</span>
                        <span className="ms-2 text-muted-foreground">{j.title}</span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {j.client?.companyName ?? "-"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs">{t(`job.status.${j.status}`)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs">{t(`job.priority.${j.priority}`)}</span>
                    </Td>
                    <Td align="right">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(j.assignedTimestamp)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {t("statisticsMe.sectionDelayed")}
        </h2>
        {stats.delayedMine.length === 0 ? (
          <EmptyState message={t("statisticsMe.noDelayed")} />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Th tooltip={t("statisticsMe.colJobTip")}>{t("statisticsMe.colJob")}</Th>
                  <Th>{t("statisticsMe.colClient")}</Th>
                  <Th tooltip={t("statisticsMe.colPriorityTip")}>{t("statisticsMe.colPriority")}</Th>
                  <Th tooltip={t("statisticsMe.colBreachTip")} align="right">
                    {t("statisticsMe.colBreach")}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {stats.delayedMine.map((j) => {
                  const breach = breachMinutes(j.assignedTimestamp, j.slaTargetMinutes);
                  return (
                    <tr key={j.id} className="border-b last:border-0 hover:bg-accent/20">
                      <Td>
                        <Link href={`/my-jobs/${j.id}`} className="hover:underline">
                          <span className="font-medium">{j.publicNumber}</span>
                          <span className="ms-2 text-muted-foreground">{j.title}</span>
                        </Link>
                      </Td>
                      <Td>
                        <span className="text-xs text-muted-foreground">
                          {j.client?.companyName ?? "-"}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs">{t(`job.priority.${j.priority}`)}</span>
                      </Td>
                      <Td align="right">
                        <span className="text-xs font-medium text-amber-700 tabular-nums">
                          +{breach}m
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">{t("statisticsMe.footerNote")}</p>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function breachMinutes(assignedAt: Date | null, slaMin: number): number {
  if (!assignedAt) return 0;
  const elapsed = (Date.now() - assignedAt.getTime()) / 60_000;
  return Math.max(0, Math.round(elapsed - slaMin));
}

function formatDate(d: Date | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  tooltip,
  value,
  suffix = "",
  colorClass,
  note,
}: {
  icon: React.ElementType;
  label: string;
  tooltip: string;
  value: number | string;
  suffix?: string;
  colorClass: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        <span>{label}</span>
        <InfoTooltip label={tooltip}>
          <HelpCircle
            className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground"
            aria-hidden
          />
        </InfoTooltip>
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
  tooltip,
  align = "left",
}: {
  children: React.ReactNode;
  tooltip?: string;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      {tooltip ? (
        <span className="inline-flex items-center gap-1">
          {children}
          <InfoTooltip label={tooltip}>
            <HelpCircle
              className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground"
              aria-hidden
            />
          </InfoTooltip>
        </span>
      ) : (
        children
      )}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
