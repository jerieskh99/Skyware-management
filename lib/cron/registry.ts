/**
 * Registry of known cron jobs. The admin trigger UI reads this list to render
 * "Run now" buttons. Future workstreams append entries here when they ship a
 * new `app/api/cron/<key>/route.ts`.
 */
export interface CronJobMeta {
  key: string;
  label: string;
  description: string;
}

export const CRON_JOBS: CronJobMeta[] = [
  {
    key: "sla-breach",
    label: "SLA breach scan",
    description:
      "Scan active jobs whose assigned-to-now elapsed time has exceeded their SLA target and write one sla_breached notification per assignee. No-op when notifications_enabled or sla_breach_automation_enabled is off.",
  },
  {
    key: "recurring-jobs",
    label: "Recurring job writer",
    description:
      "Scan active recurring job templates whose next_run_at has elapsed and create a Job per template, recomputing next_run_at. No-op when recurring_jobs_enabled is off.",
  },
  {
    key: "client-health",
    label: "Client health snapshots",
    description:
      "Compute weekly per-client KPI snapshots (open jobs, delayed jobs, hours consumed, outstanding payments, projected months remaining) and upsert one row per (clientId, ISO-week). Idempotent. No-op when client_health_snapshots_enabled is off.",
  },
];

export function findCronJob(key: string): CronJobMeta | undefined {
  return CRON_JOBS.find((j) => j.key === key);
}
