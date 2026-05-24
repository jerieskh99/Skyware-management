import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { runSlaBreachCron } from "@/lib/sla/breach-writer";

export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  return runCronJob(
    "sla-breach",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await runSlaBreachCron();
      return { summary };
    }
  );
}
