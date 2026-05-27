import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { runKnowledgeFreshnessCron } from "@/lib/knowledge/freshness-cron";

export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  return runCronJob(
    "knowledge-freshness",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await runKnowledgeFreshnessCron();
      return { summary };
    },
  );
}
