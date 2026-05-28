import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { getFeatureFlag } from "@/lib/feature-flags";
import { runBillingRemindersCron } from "@/lib/billing/reminders";

/**
 * POST /api/cron/billing-reminders — schedule due reminders + run auto-send.
 *
 * Auth: cron bearer secret OR an authenticated admin session.
 * Gated by `billing_reminders_enabled` — when off, the job no-ops and returns
 * a skipped summary (so the scheduler does not error).
 * Summary: { scheduled, notified, autoSent, failed, skipped }.
 */
export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  if (!(await getFeatureFlag("billing_reminders_enabled"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "flag_off" });
  }

  return runCronJob(
    "billing-reminders",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await runBillingRemindersCron();
      return { summary };
    },
  );
}
