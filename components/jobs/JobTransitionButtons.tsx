"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MarkDoneSheet } from "./MarkDoneSheet";
import { Timer } from "lucide-react";
import type { JobStatus } from "@prisma/client";

interface Props {
  jobId: string;
  jobTitle: string;
  currentStatus: JobStatus;
  assignedEmployeeId: string | null;
  currentUserId: string;
  isAdmin: boolean;
}

async function doTransition(jobId: string, toStatus: string, note?: string) {
  return fetch(`/api/jobs/${jobId}/transitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus, note }),
  });
}

async function startTimer(jobId: string): Promise<void> {
  await fetch(`/api/jobs/${jobId}/time-sessions`, { method: "POST" });
}

async function fetchSessionTotal(jobId: string): Promise<number> {
  const res = await fetch(`/api/jobs/${jobId}/time-sessions`);
  if (!res.ok) return 0;
  const sessions = (await res.json()) as Array<{
    accumulatedMinutes: number;
    endedAt: string | null;
    startedAt: string;
    resumedAt: string | null;
    pausedAt: string | null;
  }>;
  return sessions.reduce((sum, s) => {
    let mins = s.accumulatedMinutes;
    if (!s.pausedAt && !s.endedAt) {
      const lastStart = s.resumedAt ?? s.startedAt;
      mins += Math.floor((Date.now() - new Date(lastStart).getTime()) / 60_000);
    }
    return sum + mins;
  }, 0);
}

export function JobTransitionButtons({
  jobId,
  jobTitle,
  currentStatus,
  assignedEmployeeId,
  currentUserId,
  isAdmin,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showDoneSheet, setShowDoneSheet] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const isAssignee = assignedEmployeeId === currentUserId;
  const canAct = isAdmin || isAssignee;

  function transition(toStatus: string) {
    setError(null);
    startTransition(async () => {
      const res = await doTransition(jobId, toStatus);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  async function handleStartTimer() {
    await startTimer(jobId);
    queryClient.invalidateQueries({ queryKey: ["active-timer"] });
    router.refresh();
  }

  async function openDoneSheet() {
    const total = await fetchSessionTotal(jobId);
    setSessionMinutes(total > 0 ? total : undefined);
    setShowDoneSheet(true);
  }

  if (!canAct) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(currentStatus === "assigned" || currentStatus === "taken") && (
          <Button size="sm" disabled={isPending} onClick={() => transition("working_on_it")}>
            Start working
          </Button>
        )}

        {currentStatus === "working_on_it" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleStartTimer}>
            <Timer className="me-1.5 h-3.5 w-3.5" />
            Start timer
          </Button>
        )}

        {currentStatus === "working_on_it" && (
          <Button size="sm" disabled={isPending} onClick={openDoneSheet}>
            Mark done
          </Button>
        )}

        {["assigned", "taken", "working_on_it"].includes(currentStatus) && (
          <>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => transition("waiting_for_client")}>
              Waiting for client
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => transition("waiting_for_admin")}>
              Waiting for admin
            </Button>
          </>
        )}

        {currentStatus === "waiting_for_client" && (
          <Button size="sm" disabled={isPending} onClick={() => transition("working_on_it")}>Resume</Button>
        )}
        {currentStatus === "waiting_for_admin" && isAdmin && (
          <Button size="sm" disabled={isPending} onClick={() => transition("working_on_it")}>Resume</Button>
        )}

        {currentStatus === "done" && isAdmin && (
          <Button size="sm" disabled={isPending} onClick={() => transition("reviewed")}>Mark reviewed</Button>
        )}

        {(currentStatus === "done" || currentStatus === "reviewed") && isAdmin && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => transition("working_on_it")}>Reopen</Button>
        )}

        {!["reviewed", "cancelled"].includes(currentStatus) && isAdmin && (
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={isPending} onClick={() => transition("cancelled")}>Cancel</Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {showDoneSheet && (
        <MarkDoneSheet
          jobId={jobId}
          jobTitle={jobTitle}
          estimatedMinutes={sessionMinutes}
          onClose={() => setShowDoneSheet(false)}
        />
      )}
    </>
  );
}
