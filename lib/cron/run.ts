import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/lib/audit";

export interface CronRunContext {
  actorUserId: string | null;
  triggeredBy: "cron" | "admin";
}

export interface CronRunResult {
  summary: Record<string, unknown>;
}

/**
 * Run a cron job body with uniform timing, logging, and audit.
 *
 * Success path:
 *   - emits `cron.success` log with name + durationMs + summary
 *   - writes one AuditLog row with action `cron.run`, entityType `Cron`,
 *     entityId = job name, diff = { summary, durationMs }
 *   - returns 200 with `{ ok: true, summary }`
 *
 * Failure path:
 *   - emits `cron.failed` log with name + error
 *   - rethrows so Next.js surfaces a 500
 */
export async function runCronJob(
  name: string,
  ctx: CronRunContext,
  fn: () => Promise<CronRunResult>
): Promise<NextResponse> {
  const start = Date.now();
  try {
    const { summary } = await fn();
    const durationMs = Date.now() - start;

    logger.info("cron.success", { name, durationMs, summary, triggeredBy: ctx.triggeredBy });

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: ctx.actorUserId,
        action: "cron.run",
        entityType: "Cron",
        entityId: name,
        diff: {
          summary: { old: null, new: summary },
          durationMs: { old: null, new: durationMs },
        },
      });
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error("cron.failed", {
      name,
      durationMs,
      triggeredBy: ctx.triggeredBy,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
    });
    throw err;
  }
}
