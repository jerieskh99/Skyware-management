import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { runClientHealthSnapshotsCron } from "@/lib/client-health/cron";

export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  return runCronJob(
    "client-health",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await runClientHealthSnapshotsCron();
      return { summary };
    }
  );
}
