"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { CRON_JOBS } from "@/lib/cron/registry";
import { Play, Loader2 } from "lucide-react";

export function CronTriggerSection() {
  const { t } = useT();
  const toast = useToast();
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<Record<string, unknown> | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  async function run(key: string) {
    setRunningKey(key);
    setLastSummary(null);
    try {
      const res = await fetch(`/api/cron/${key}?manual=1`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        summary?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.push({
          tone: "error",
          title: t("admin.cron.runFailed"),
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setLastKey(key);
      setLastSummary(data.summary ?? {});
      toast.push({
        tone: "success",
        title: t("admin.cron.runSucceeded"),
        description: summaryToString(data.summary),
      });
    } catch (err) {
      toast.push({
        tone: "error",
        title: t("admin.cron.runFailed"),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("admin.cron.intro")}</p>

      <div className="divide-y rounded-lg border">
        {CRON_JOBS.map((job) => {
          const labelKey = `admin.cron.jobs.${job.key}.label`;
          const descKey = `admin.cron.jobs.${job.key}.description`;
          const i18nLabel = t(labelKey);
          const i18nDesc = t(descKey);
          const label = i18nLabel === labelKey ? job.label : i18nLabel;
          const description = i18nDesc === descKey ? job.description : i18nDesc;
          const busy = runningKey === job.key;
          return (
            <div key={job.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
                <p className="font-mono text-[10px] text-muted-foreground/80">{job.key}</p>
              </div>
              <button
                type="button"
                onClick={() => run(job.key)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {busy ? t("admin.cron.running") : t("admin.cron.runNow")}
              </button>
            </div>
          );
        })}
      </div>

      {lastSummary && (
        <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs">
          <p className="mb-1 font-medium text-muted-foreground">
            {t("admin.cron.lastResult")} {lastKey ? `(${lastKey})` : null}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
            {JSON.stringify(lastSummary, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function summaryToString(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "";
  return Object.entries(summary)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}
