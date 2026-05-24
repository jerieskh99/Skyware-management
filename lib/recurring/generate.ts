import type { Prisma, RecurringJobTemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFeatureFlag } from "@/lib/feature-flags";
import { writeAudit } from "@/lib/audit";
import { deriveSlaTargetMinutes, getSlaDefaults } from "@/lib/sla";
import { generatePublicNumber } from "@/lib/jobs/numbers";
import { notifyJobAssigned } from "@/lib/notifications/triggers";
import { computeNextRunAt, renderTitle } from "@/lib/recurring/schedule";
import { logger } from "@/lib/logger";

export interface RecurringSummary extends Record<string, unknown> {
  scanned: number;
  generated: number;
  skipped: number;
}

const FLAG_KEY = "recurring_jobs_enabled";

/** Recurring-jobs cron entrypoint. */
export async function runRecurringJobsCron(): Promise<RecurringSummary> {
  if (!(await getFeatureFlag(FLAG_KEY))) {
    return { scanned: 0, generated: 0, skipped: 0 };
  }

  const now = new Date();
  const due = await prisma.recurringJobTemplate.findMany({
    where: { status: "active", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
  });

  if (due.length === 0) {
    return { scanned: 0, generated: 0, skipped: 0 };
  }

  const slaDefaults = await getSlaDefaults();

  let generated = 0;
  let skipped = 0;

  for (const tpl of due) {
    try {
      await prisma.$transaction(async (tx) => {
        await generateOnce(tx, tpl, slaDefaults, now);
      });
      generated += 1;
    } catch (err) {
      skipped += 1;
      logger.error("recurring.generate.failed", {
        templateId: tpl.id,
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      });
    }
  }

  return { scanned: due.length, generated, skipped };
}

async function generateOnce(
  tx: Prisma.TransactionClient,
  tpl: RecurringJobTemplate,
  slaDefaults: Awaited<ReturnType<typeof getSlaDefaults>>,
  now: Date
): Promise<void> {
  const slaTargetMinutes = deriveSlaTargetMinutes(tpl.priority, tpl.severity, slaDefaults);
  const publicNumber = await generatePublicNumber(tx);
  const title = renderTitle(tpl.titleTemplate, now, tpl.timezone);
  const assignedEmployeeId = tpl.defaultAssigneeId;
  const initialStatus = assignedEmployeeId ? "assigned" : "new";

  const job = await tx.job.create({
    data: {
      publicNumber,
      title,
      description: tpl.description ?? null,
      departmentId: tpl.departmentId,
      createdByUserId: tpl.createdByUserId,
      assignedEmployeeId,
      clientId: tpl.clientId ?? null,
      status: initialStatus,
      priority: tpl.priority,
      severity: tpl.severity,
      slaTargetMinutes,
      assignedTimestamp: assignedEmployeeId ? now : null,
      recurringTemplateId: tpl.id,
    },
    select: { id: true, publicNumber: true, title: true },
  });

  await tx.jobStatusEvent.create({
    data: {
      jobId: job.id,
      fromStatus: null,
      toStatus: initialStatus,
      changedByUserId: tpl.createdByUserId,
      note: `Generated from recurring template ${tpl.id}`,
    },
  });

  if (assignedEmployeeId) {
    await notifyJobAssigned(tx, {
      userId: assignedEmployeeId,
      jobId: job.id,
      publicNumber: job.publicNumber,
      title: job.title,
    });
  }

  const nextRunAt = computeNextRunAt(now, tpl.cadence, tpl.anchor, tpl.timezone);
  await tx.recurringJobTemplate.update({
    where: { id: tpl.id },
    data: {
      lastGeneratedAt: now,
      generatedCount: { increment: 1 },
      nextRunAt,
    },
  });

  await writeAudit(tx, {
    actorUserId: tpl.createdByUserId,
    action: "recurring_template.generated_job",
    entityType: "RecurringJobTemplate",
    entityId: tpl.id,
    diff: {
      jobId: { old: null, new: job.id },
      publicNumber: { old: null, new: job.publicNumber },
      nextRunAt: { old: tpl.nextRunAt, new: nextRunAt },
    },
  });
}
