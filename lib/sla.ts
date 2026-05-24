import type { JobPriority, JobSeverity } from "@prisma/client";

// Configurable defaults. These match the spec's suggested values.
const DEFAULT_PRIORITY_SLA_MINUTES: Record<JobPriority, number> = {
  urgent: 240,    // 4 h
  high: 1440,     // 24 h
  normal: 4320,   // 72 h
  low: 10080,     // 168 h
};

const DEFAULT_SEVERITY_SLA_MINUTES: Record<JobSeverity, number> = {
  critical: 240,
  major: 1440,
  moderate: 4320,
  minor: 10080,
};

export type SlaState = "green" | "amber" | "red" | "breached";

/** Effective SLA = min(priority SLA, severity SLA). */
export function deriveSlaTargetMinutes(
  priority: JobPriority,
  severity: JobSeverity,
  overrides?: {
    priority?: Partial<Record<JobPriority, number>>;
    severity?: Partial<Record<JobSeverity, number>>;
  }
): number {
  const pMin = overrides?.priority?.[priority] ?? DEFAULT_PRIORITY_SLA_MINUTES[priority];
  const sMin = overrides?.severity?.[severity] ?? DEFAULT_SEVERITY_SLA_MINUTES[severity];
  return Math.min(pMin, sMin);
}

/** Classify elapsed vs target.
 *  Display-only in MVP. No automated breach events.
 */
export function computeSlaState(
  elapsedMinutes: number,
  targetMinutes: number
): SlaState {
  if (targetMinutes <= 0) return "green";
  const ratio = elapsedMinutes / targetMinutes;
  if (ratio >= 1.0) return "breached";
  if (ratio >= 0.75) return "red";
  if (ratio >= 0.50) return "amber";
  return "green";
}

/** Returns elapsed minutes from a start timestamp to now. */
export function elapsedMinutes(startAt: Date | null): number {
  if (!startAt) return 0;
  return Math.floor((Date.now() - startAt.getTime()) / 60_000);
}
