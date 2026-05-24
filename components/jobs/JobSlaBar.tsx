import { cn } from "@/lib/utils";
import { computeSlaState, elapsedMinutes } from "@/lib/sla";

const BAR_COLOR = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
  breached: "bg-red-600",
};

interface Props {
  assignedTimestamp: Date | null;
  startedTimestamp: Date | null;
  slaTargetMinutes: number;
  status: string;
  compact?: boolean;
}

export function JobSlaBar({
  assignedTimestamp,
  startedTimestamp,
  slaTargetMinutes,
  status,
  compact = false,
}: Props) {
  // SLA clock starts when the job is first assigned or taken.
  const start = assignedTimestamp ?? startedTimestamp;
  const terminal = ["reviewed", "cancelled"].includes(status);

  if (!start || terminal) return null;

  const elapsed = elapsedMinutes(start);
  const state = computeSlaState(elapsed, slaTargetMinutes);
  const pct = Math.min((elapsed / slaTargetMinutes) * 100, 100);

  if (compact) {
    return (
      <div
        className={cn(
          "h-1 w-full overflow-hidden rounded-full bg-muted",
        )}
        title={`SLA: ${Math.round(pct)}% elapsed`}
      >
        <div
          className={cn("h-full transition-all", BAR_COLOR[state])}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  const targetH = Math.round(slaTargetMinutes / 60);
  const label =
    state === "breached"
      ? `SLA breached (target ${targetH}h)`
      : `${Math.round(pct)}% of ${targetH}h SLA`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {state === "breached" && (
          <span className="font-medium text-red-600">Delayed</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", BAR_COLOR[state])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
