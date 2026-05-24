import type { JobPriority, JobSeverity } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Hardcoded fallback defaults. Used when the `sla_defaults` table is empty
 * (fresh dev DB / unseeded test DB) so behavior stays stable. Production gets
 * its values from the DB via `getSlaDefaults()` after seed.
 */
export const FALLBACK_PRIORITY_SLA_MINUTES: Record<JobPriority, number> = {
  urgent: 60,
  high: 120,
  normal: 240,
  low: 480,
};

const DEFAULT_SEVERITY_SLA_MINUTES: Record<JobSeverity, number> = {
  critical: 240,
  major: 1440,
  moderate: 4320,
  minor: 10080,
};

export type SlaState = "green" | "amber" | "red" | "breached";

/** Read SLA defaults per priority from the DB. Falls back to constants
 *  when the table is empty (fresh dev / unseeded tests). */
export async function getSlaDefaults(): Promise<Record<JobPriority, number>> {
  const rows = await prisma.slaDefaults.findMany({
    select: { priority: true, targetMinutes: true },
  });
  if (rows.length === 0) return { ...FALLBACK_PRIORITY_SLA_MINUTES };
  const result: Record<JobPriority, number> = { ...FALLBACK_PRIORITY_SLA_MINUTES };
  for (const row of rows) result[row.priority] = row.targetMinutes;
  return result;
}

/** Effective SLA = min(priority SLA, severity SLA). Severity ceiling stays
 *  in code; priority defaults come from the DB via `getSlaDefaults()`. */
export function deriveSlaTargetMinutes(
  priority: JobPriority,
  severity: JobSeverity,
  defaults: Record<JobPriority, number>
): number {
  const pMin = defaults[priority] ?? FALLBACK_PRIORITY_SLA_MINUTES[priority];
  const sMin = DEFAULT_SEVERITY_SLA_MINUTES[severity];
  return Math.min(pMin, sMin);
}

/** Classify elapsed vs target. */
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
