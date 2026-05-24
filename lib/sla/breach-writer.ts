import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";
import { notifySlaBreached } from "@/lib/notifications/triggers";

/**
 * SLA breach cron entrypoint.
 *
 * Scans active jobs whose elapsed-since-assigned time exceeds their stored
 * `sla_target_minutes` and writes one `sla_breached` notification per
 * (assignee, job) the first time the breach is observed. Re-runs do not
 * re-notify because of the NOT EXISTS de-dup in the candidate query.
 *
 * Respects two flags:
 *   - notifications_enabled               — global notifications switch
 *   - sla_breach_automation_enabled       — gate for this scanner only
 *
 * When either is off, returns { scanned: 0, notified: 0 } without touching
 * the DB beyond the flag read.
 */

type Candidate = {
  id: string;
  publicNumber: string;
  assignedEmployeeId: string;
  slaTargetMinutes: number;
  breachMinutes: number;
};

const ACTIVE_STATUSES = [
  "assigned",
  "taken",
  "working_on_it",
  "waiting_for_client",
  "waiting_for_admin",
] as const;

export async function runSlaBreachCron(): Promise<{ scanned: number; notified: number }> {
  const flags = await getFeatureFlags([
    "notifications_enabled",
    "sla_breach_automation_enabled",
  ]);
  if (!flags["notifications_enabled"] || !flags["sla_breach_automation_enabled"]) {
    return { scanned: 0, notified: 0 };
  }

  // Candidate set:
  //   - assigned_employee_id IS NOT NULL (someone to notify)
  //   - assigned_timestamp IS NOT NULL
  //   - status is one of the live working states
  //   - elapsed minutes > sla_target_minutes
  //   - no sla_breached notification already exists for (assignee, job)
  // Note: `kind` column is an enum; use `::text` for a safe string compare in
  // the NOT EXISTS subquery and to keep the cast independent of enum order.
  const candidates = await prisma.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT
      j.id                                                                              AS "id",
      j.public_number                                                                   AS "publicNumber",
      j.assigned_employee_id                                                            AS "assignedEmployeeId",
      j.sla_target_minutes                                                              AS "slaTargetMinutes",
      FLOOR(EXTRACT(EPOCH FROM (NOW() - j.assigned_timestamp)) / 60)::int                AS "breachMinutes"
    FROM jobs j
    WHERE j.assigned_employee_id IS NOT NULL
      AND j.assigned_timestamp   IS NOT NULL
      AND j.status::text IN (${Prisma.join(ACTIVE_STATUSES.map((s) => Prisma.sql`${s}`))})
      AND EXTRACT(EPOCH FROM (NOW() - j.assigned_timestamp)) / 60 > j.sla_target_minutes
      AND NOT EXISTS (
        SELECT 1
        FROM notifications n
        WHERE n.user_id = j.assigned_employee_id
          AND n.kind::text = 'sla_breached'
          AND (n.payload ->> 'jobId') = j.id::text
      )
    ORDER BY j.assigned_timestamp ASC
  `);

  if (candidates.length === 0) {
    return { scanned: 0, notified: 0 };
  }

  let notified = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      await notifySlaBreached(tx, {
        userId: c.assignedEmployeeId,
        jobId: c.id,
        publicNumber: c.publicNumber,
        breachMinutes: c.breachMinutes,
      });
      notified += 1;
    }
  });

  return { scanned: candidates.length, notified };
}
