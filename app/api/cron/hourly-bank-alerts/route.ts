import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { getFeatureFlag } from "@/lib/feature-flags";
import { scanHourlyBankUsage } from "@/lib/billing/hourly-bank-alerts";

/**
 * POST /api/cron/hourly-bank-alerts — scan active hourly banks for the 90%
 * low-balance threshold.
 *
 * Auth: cron bearer secret OR an authenticated admin session.
 * Gated by `hourly_bank_alerts_enabled` — when off, the job no-ops.
 * Summary: { scanned, alerted, deduped, skipped }.
 */
export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  if (!(await getFeatureFlag("hourly_bank_alerts_enabled"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "flag_off" });
  }

  return runCronJob(
    "hourly-bank-alerts",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await scanHourlyBankUsage();
      return { summary };
    },
  );
}
