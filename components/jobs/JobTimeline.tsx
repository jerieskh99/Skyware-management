import { formatTz, timeAgo } from "@/lib/time";
import { JobStatusChip } from "./JobStatusChip";
import type { JobStatus } from "@prisma/client";

interface TimelineEvent {
  id: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedAt: Date | string;
  note: string | null;
  reopened: boolean;
  timeSpentDeltaMinutes: number;
  changedBy: { username: string; displayName: string };
}

interface Props {
  events: TimelineEvent[];
}

export function JobTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>;
  }

  return (
    <ol className="relative border-l border-border">
      {events.map((ev) => {
        const when = new Date(ev.changedAt);
        return (
          <li key={ev.id} className="mb-4 ms-4">
            <div className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-muted-foreground/60" />
            <div className="flex flex-wrap items-center gap-2">
              <JobStatusChip status={ev.toStatus} />
              {ev.reopened && (
                <span className="text-xs text-orange-600 font-medium">Reopened</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {ev.changedBy.displayName} ({ev.changedBy.username}){" "}
              <span title={formatTz(when)}>{timeAgo(when)}</span>
            </p>
            {ev.note && (
              <p className="mt-1 text-sm">{ev.note}</p>
            )}
            {ev.timeSpentDeltaMinutes > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Time: {Math.round(ev.timeSpentDeltaMinutes / 60 * 10) / 10}h
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
