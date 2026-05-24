"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, Pause, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/client";

interface ActiveSession {
  id: string;
  jobId: string;
  startedAt: string;
  pausedAt: string | null;
  resumedAt: string | null;
  endedAt: string | null;
  accumulatedMinutes: number;
  job: { id: string; publicNumber: string; title: string; status: string };
}

function liveMinutes(s: ActiveSession): number {
  if (s.pausedAt || s.endedAt) return s.accumulatedMinutes;
  const lastStart = s.resumedAt ?? s.startedAt;
  const elapsed = Math.floor((Date.now() - new Date(lastStart).getTime()) / 60_000);
  return s.accumulatedMinutes + elapsed;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function timerAction(sessionId: string, action: "pause" | "resume" | "stop") {
  const res = await fetch(`/api/timer/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Timer action failed");
  return res.json() as Promise<ActiveSession>;
}

interface Props {
  jobId: string;
}

export function JobActiveTimerPanel({ jobId }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const [displayMinutes, setDisplayMinutes] = useState(0);

  const { data: session } = useQuery<ActiveSession | null>({
    queryKey: ["active-timer"],
    queryFn: async () => {
      const res = await fetch("/api/timer");
      if (!res.ok) return null;
      return res.json() as Promise<ActiveSession | null>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({ action }: { action: "pause" | "resume" | "stop" }) =>
      timerAction(session!.id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-timer"] }),
  });

  useEffect(() => {
    if (!session || session.pausedAt || session.endedAt) return;
    setDisplayMinutes(liveMinutes(session));
    const id = setInterval(() => setDisplayMinutes(liveMinutes(session)), 30_000);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (session) setDisplayMinutes(liveMinutes(session));
  }, [session]);

  if (!session || session.jobId !== jobId) return null;

  const isRunning = !session.pausedAt && !session.endedAt;
  const isPaused = !!session.pausedAt && !session.endedAt;

  return (
    <section
      className="rounded-lg border bg-muted/30 p-4"
      aria-label={t("jobs.detail.activeTimer")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer
            className={`h-4 w-4 ${isRunning ? "text-green-600 animate-pulse" : "text-amber-500"}`}
          />
          <span className="text-sm font-semibold">{t("jobs.detail.activeTimer")}</span>
          <InfoTooltip label={t("jobs.detail.timerElapsed")}>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground"
              aria-hidden="true"
            >
              ?
            </span>
          </InfoTooltip>
        </div>
        <div className="text-sm tabular-nums font-medium">
          {formatTime(displayMinutes)}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {isRunning && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate({ action: "pause" })}
            disabled={mutation.isPending}
          >
            <Pause className="me-1.5 h-3.5 w-3.5" />
            {t("jobs.detail.timerPause")}
          </Button>
        )}
        {isPaused && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate({ action: "resume" })}
            disabled={mutation.isPending}
          >
            <Play className="me-1.5 h-3.5 w-3.5" />
            {t("jobs.detail.timerResume")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => mutation.mutate({ action: "stop" })}
          disabled={mutation.isPending}
        >
          <Square className="me-1.5 h-3.5 w-3.5" />
          {t("jobs.detail.timerStop")}
        </Button>
      </div>
    </section>
  );
}
