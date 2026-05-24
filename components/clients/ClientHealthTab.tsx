import { Activity, AlertTriangle, Clock, Banknote, Calendar } from "lucide-react";
import { KpiCard } from "@/components/shared/KpiCard";
import { listSnapshots, getLatestSnapshot } from "@/lib/client-health/queries";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatTz } from "@/lib/time";

interface Props {
  clientId: string;
}

export async function ClientHealthTab({ clientId }: Props) {
  const { t } = await getT();
  const [latest, history] = await Promise.all([
    getLatestSnapshot(clientId),
    listSnapshots(clientId, { limit: 8 }),
  ]);

  if (!latest) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t("clientHealth.sectionTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("clientHealth.sectionDescription")}</p>
        </div>
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">{t("clientHealth.noSnapshot")}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
            {t("clientHealth.noSnapshotHint")}
          </p>
        </div>
      </div>
    );
  }

  const hours = Number(latest.hoursConsumed).toFixed(1);
  const avgMonths = latest.avgProjectedMonths === null
    ? null
    : Number(latest.avgProjectedMonths).toFixed(1);
  const outstanding = latest.outstandingMinorUnits;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("clientHealth.sectionTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("clientHealth.sectionDescription")}</p>
        <p className="text-xs text-muted-foreground">
          {t("clientHealth.lastComputed")}: {formatTz(latest.generatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label={t("clientHealth.kpiOpenJobs")}
          value={latest.openJobs}
          icon={Activity}
        />
        <KpiCard
          label={t("clientHealth.kpiDelayedJobs")}
          value={latest.delayedJobs}
          icon={AlertTriangle}
          tone={latest.delayedJobs > 0 ? "warn" : "default"}
        />
        <KpiCard
          label={t("clientHealth.kpiHoursConsumed")}
          value={hours}
          icon={Clock}
        />
        <KpiCard
          label={t("clientHealth.kpiOutstanding")}
          value={outstanding}
          icon={Banknote}
          tone={outstanding > 0 ? "warn" : "default"}
        />
        <KpiCard
          label={t("clientHealth.kpiAvgMonths")}
          value={avgMonths ?? "—"}
          note={avgMonths === null ? t("clientHealth.kpiAvgMonthsNa") : undefined}
          icon={Calendar}
        />
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">{t("clientHealth.trendTitle")}</h4>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("clientHealth.trendEmpty")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{t("clientHealth.colWeek")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("clientHealth.colOpen")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("clientHealth.colDelayed")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0 hover:bg-accent/20">
                  <td className="px-4 py-2 font-mono text-xs">{formatDate(row.periodStart)}</td>
                  <td className="px-4 py-2 text-end font-medium">{row.openJobs}</td>
                  <td className="px-4 py-2 text-end font-medium">{row.delayedJobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
