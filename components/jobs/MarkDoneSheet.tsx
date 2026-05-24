"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  jobId: string;
  jobTitle: string;
  currentStatus?: string;
  estimatedMinutes?: number;
  onClose: () => void;
}

export function MarkDoneSheet({ jobId, jobTitle, currentStatus: _currentStatus, estimatedMinutes, onClose }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [minutes, setMinutes] = useState(estimatedMinutes ?? 30);
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) { setError("Summary is required."); return; }
    if (minutes < 1) { setError("Time spent must be at least 1 minute."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}/work-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summary.trim(), totalTimeMinutes: minutes, billable }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Failed to submit.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-xl border bg-background p-6 shadow-xl sm:rounded-xl">
        <h2 className="mb-1 text-base font-semibold">Mark job done</h2>
        <p className="mb-4 text-sm text-muted-foreground truncate">{jobTitle}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Summary *</label>
            <Textarea
              placeholder="Describe what was done..."
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Time spent (minutes) *</label>
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
            <label htmlFor="billable" className="text-sm">Billable</label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Submitting..." : "Submit and mark done"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
