"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Timer, Pause, Square, Play } from "lucide-react";

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

function liveMinutes(session: ActiveSession): number {
  if (session.pausedAt || session.endedAt) {
    return session.accumulatedMinutes;
  }
  const lastStart = session.resumedAt ?? session.startedAt;
  const elapsed = Math.floor((Date.now() - new Date(lastStart).getTime()) / 60_000);
  return session.accumulatedMinutes + elapsed;
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

export function TimerBar() {
  const queryClient = useQueryClient();
  const [displayMinutes, setDisplayMinutes] = useState(0);

  const { data: session, isLoading } = useQuery<ActiveSession | null>({
    queryKey: ["active-timer"],
    queryFn: async () => {
      const res = await fetch("/api/timer");
      if (!res.ok) return null;
      return res.json() as Promise<ActiveSession | null>;
    },
    refetchInterval: 60_000, // re-sync with server every minute
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({ action }: { action: "pause" | "resume" | "stop" }) =>
      timerAction(session!.id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-timer"] });
    },
  });

  // Tick every 30s to update displayed time when running
  useEffect(() => {
    if (!session || session.pausedAt || session.endedAt) return;
    setDisplayMinutes(liveMinutes(session));
    const id = setInterval(() => setDisplayMinutes(liveMinutes(session)), 30_000);
    return () => clearInterval(id);
  }, [session]);

  // Sync once when session data arrives
  useEffect(() => {
    if (session) setDisplayMinutes(liveMinutes(session));
  }, [session]);

  if (isLoading || !session) return null;

  const isRunning = !session.pausedAt && !session.endedAt;
  const isPaused = !!session.pausedAt && !session.endedAt;
  // Warn after 8 hours of continuous running to prompt a check-in.
  const isLongRunning = isRunning && displayMinutes >= 480;

  return (
    <div
      className="fixed bottom-0 start-0 end-0 z-40 flex items-center gap-3 border-t bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur-sm sm:start-56"
      role="status"
      aria-label="Active timer"
    >
      <Timer
        className={`h-4 w-4 shrink-0 ${isRunning ? (isLongRunning ? "text-amber-500 animate-pulse" : "text-green-600 animate-pulse") : "text-amber-500"}`}
      />

      <Link
        href={`/my-jobs/${session.job.id}`}
        className="min-w-0 flex-1 text-sm hover:underline"
      >
        <span className={`font-medium ${isLongRunning ? "text-amber-600" : ""}`}>
          {formatTime(displayMinutes)}
        </span>
        {isLongRunning && (
          <span className="ms-1.5 text-xs text-amber-600">· timer running long</span>
        )}
        <span className="ms-2 truncate text-muted-foreground">
          {session.job.publicNumber} · {session.job.title}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {isRunning && (
          <button
            onClick={() => mutation.mutate({ action: "pause" })}
            disabled={mutation.isPending}
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
            aria-label="Pause timer"
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
        )}
        {isPaused && (
          <button
            onClick={() => mutation.mutate({ action: "resume" })}
            disabled={mutation.isPending}
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
            aria-label="Resume timer"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => mutation.mutate({ action: "stop" })}
          disabled={mutation.isPending}
          className="rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          aria-label="Stop timer"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
