"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { JobStatusChip } from "./JobStatusChip";
import { JobPriorityChip } from "./JobPriorityChip";
import { JobSeverityChip } from "./JobSeverityChip";
import { JobTagChips } from "./JobTagChips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/time";
import type { JobPriority, JobSeverity } from "@prisma/client";

interface HubJob {
  id: string;
  publicNumber: string;
  title: string;
  description: string | null;
  priority: JobPriority;
  severity: JobSeverity;
  slaTargetMinutes: number;
  createdAt: string;
  client: { companyName: string } | null;
  department: { key: string; nameEn: string };
  createdBy: { username: string; displayName: string };
  tags: { tag: { key: string; labelEn: string; colorHex: string | null } }[];
}

interface Props {
  scope: string;
  scopeLabel: string;
}

export function HubView({ scope, scopeLabel }: Props) {
  const queryClient = useQueryClient();
  const [takenId, setTakenId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const { data: jobs, isLoading, error } = useQuery<HubJob[]>({
    queryKey: ["hub", scope],
    queryFn: async () => {
      const res = await fetch(`/api/hub/${scope}`);
      if (!res.ok) throw new Error("Failed to load hub");
      return res.json() as Promise<HubJob[]>;
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const takeMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/hub/${scope}/take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.status === 409) {
        throw new Error("already_taken");
      }
      if (!res.ok) throw new Error("take_failed");
      return res.json();
    },
    onMutate: (jobId) => setTakenId(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub", scope] });
      setTakenId(null);
      setErrorId(null);
    },
    onError: (err: Error, jobId) => {
      setTakenId(null);
      setErrorId(jobId);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["hub", scope] });
        setErrorId(null);
      }, 2000);
    },
  });

  const handleTake = useCallback(
    (jobId: string) => takeMutation.mutate(jobId),
    [takeMutation]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load hub. Refresh the page.
      </p>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium">No tasks available in {scopeLabel}.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Check back later or ask an admin to assign work.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const isBeingTaken = takenId === job.id;
        const justFailed = errorId === job.id;

        return (
          <div
            key={job.id}
            className="rounded-lg border bg-card p-4 transition-colors"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {job.publicNumber}
                  </span>
                  <JobStatusChip status="available" />
                  <JobPriorityChip priority={job.priority} />
                  <JobSeverityChip severity={job.severity} />
                </div>
                <p className="text-sm font-medium">{job.title}</p>
                {job.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {job.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {job.client && <span>{job.client.companyName}</span>}
                  <span>Posted {timeAgo(new Date(job.createdAt))}</span>
                </div>
                <JobTagChips tags={job.tags.map((t) => t.tag)} />
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button
                  size="sm"
                  disabled={isBeingTaken || takeMutation.isPending}
                  onClick={() => handleTake(job.id)}
                >
                  {isBeingTaken ? "Taking..." : "Take task"}
                </Button>
                {justFailed && (
                  <p className="text-xs text-destructive">Already taken</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
