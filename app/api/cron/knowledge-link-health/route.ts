import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";
import { getFeatureFlag } from "@/lib/feature-flags";
import { runKnowledgeLinkHealthCron } from "@/lib/knowledge/freshness-cron";

export async function POST(req: Request) {
  const authResult = await requireCronAuth(req);
  if (authResult.kind === "deny") return authResult.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      skipped: "knowledge_articles_enabled is off",
      summary: { scanned: 0, broken: 0, deduped: 0 },
    });
  }

  return runCronJob(
    "knowledge-link-health",
    {
      triggeredBy: authResult.kind,
      actorUserId: authResult.kind === "admin" ? authResult.userId : null,
    },
    async () => {
      const summary = await runKnowledgeLinkHealthCron();
      return { summary };
    },
  );
}
