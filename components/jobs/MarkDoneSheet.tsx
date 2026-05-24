"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";

interface Props {
  jobId: string;
  jobTitle: string;
  currentStatus?: string;
  estimatedMinutes?: number;
  onClose: () => void;
}

export function MarkDoneSheet({ jobId, jobTitle, currentStatus: _currentStatus, estimatedMinutes, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [summary, setSummary] = useState("");
  const [minutes, setMinutes] = useState(estimatedMinutes ?? 30);
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) { setError(t("jobs.summaryRequired")); return; }
    if (minutes < 1) { setError(t("jobs.timeMinAtLeastOne")); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}/work-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summary.trim(), totalTimeMinutes: minutes, billable }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? t("jobs.submitFailed"));
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("jobs.markDone")}</DialogTitle>
          <DialogDescription className="truncate">{jobTitle}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("jobs.summary")} *</label>
            <Textarea
              placeholder={t("jobs.summaryPlaceholder")}
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("jobs.timeSpent")} *</label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 0)}
              disabled={isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              {Math.floor(minutes / 60)}h {minutes % 60}m
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="billable"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="billable" className="text-sm">{t("jobs.billable")}</label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? t("jobs.submitting") : t("jobs.markDoneSubmit")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
