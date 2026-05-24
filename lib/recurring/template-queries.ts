import { z } from "zod";
import type { Prisma, RecurringJobTemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { computeNextRunAt } from "@/lib/recurring/schedule";

const cadenceEnum = z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly"]);
const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
const severityEnum = z.enum(["minor", "moderate", "major", "critical"]);

const dailyAnchorSchema = z.object({
  minuteOfDay: z.number().int().min(0).max(1439),
});
const weeklyAnchorSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  minuteOfDay: z.number().int().min(0).max(1439),
});
const monthlyAnchorSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(28),
  minuteOfDay: z.number().int().min(0).max(1439),
});

function anchorSchemaFor(cadence: z.infer<typeof cadenceEnum>) {
  if (cadence === "daily") return dailyAnchorSchema;
  if (cadence === "weekly" || cadence === "biweekly") return weeklyAnchorSchema;
  return monthlyAnchorSchema;
}

export const createTemplateSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional().nullable(),
    titleTemplate: z.string().min(1).max(255).trim(),
    description: z.string().max(2000).optional().nullable(),
    departmentId: z.string().uuid(),
    clientId: z.string().uuid().optional().nullable(),
    priority: priorityEnum.default("normal"),
    severity: severityEnum.default("moderate"),
    defaultAssigneeId: z.string().uuid().optional().nullable(),
    cadence: cadenceEnum,
    anchor: z.unknown(),
    timezone: z.string().min(1).max(64).default("Asia/Jerusalem"),
  })
  .superRefine((val, ctx) => {
    const parsed = anchorSchemaFor(val.cadence).safeParse(val.anchor);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anchor"],
        message: parsed.error.issues[0]?.message ?? "Invalid anchor",
      });
    }
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).max(200).trim().nullable().optional(),
    titleTemplate: z.string().min(1).max(255).trim().optional(),
    description: z.string().max(2000).nullable().optional(),
    departmentId: z.string().uuid().optional(),
    clientId: z.string().uuid().nullable().optional(),
    priority: priorityEnum.optional(),
    severity: severityEnum.optional(),
    defaultAssigneeId: z.string().uuid().nullable().optional(),
    cadence: cadenceEnum.optional(),
    anchor: z.unknown().optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export interface ListFilters {
  status?: "active" | "paused";
  departmentId?: string;
  clientId?: string;
}

export async function listTemplates(filters?: ListFilters): Promise<RecurringJobTemplate[]> {
  return prisma.recurringJobTemplate.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters?.clientId ? { clientId: filters.clientId } : {}),
    },
    orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
  });
}

export async function getTemplate(id: string): Promise<RecurringJobTemplate | null> {
  return prisma.recurringJobTemplate.findUnique({ where: { id } });
}

export async function createTemplate(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; input: CreateTemplateInput }
): Promise<RecurringJobTemplate> {
  const { actorUserId, input } = args;
  const now = new Date();
  const nextRunAt = computeNextRunAt(now, input.cadence, input.anchor, input.timezone);
  const created = await tx.recurringJobTemplate.create({
    data: {
      name: input.name ?? null,
      titleTemplate: input.titleTemplate,
      description: input.description ?? null,
      departmentId: input.departmentId,
      clientId: input.clientId ?? null,
      priority: input.priority,
      severity: input.severity,
      defaultAssigneeId: input.defaultAssigneeId ?? null,
      cadence: input.cadence,
      anchor: input.anchor as Prisma.InputJsonValue,
      timezone: input.timezone,
      nextRunAt,
      createdByUserId: actorUserId,
    },
  });
  await writeAudit(tx, {
    actorUserId,
    action: "recurring_template.created",
    entityType: "RecurringJobTemplate",
    entityId: created.id,
    diff: {
      titleTemplate: { old: null, new: created.titleTemplate },
      cadence: { old: null, new: created.cadence },
      status: { old: null, new: created.status },
    },
  });
  return created;
}

export async function updateTemplate(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string; patch: UpdateTemplateInput }
): Promise<RecurringJobTemplate> {
  const { actorUserId, id, patch } = args;
  const existing = await tx.recurringJobTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error("RecurringJobTemplate not found");

  const cadence = patch.cadence ?? existing.cadence;
  const anchor = patch.anchor !== undefined ? patch.anchor : existing.anchor;
  const timezone = patch.timezone ?? existing.timezone;

  if (patch.cadence !== undefined || patch.anchor !== undefined) {
    const checkSchema = anchorSchemaFor(cadence);
    const parsed = checkSchema.safeParse(anchor);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid anchor");
    }
  }

  const recomputeNext =
    patch.cadence !== undefined ||
    patch.anchor !== undefined ||
    patch.timezone !== undefined;

  const data: Prisma.RecurringJobTemplateUpdateInput = {
    updatedBy: { connect: { id: actorUserId } },
  };
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.titleTemplate !== undefined) data.titleTemplate = patch.titleTemplate;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.departmentId !== undefined) {
    data.department = { connect: { id: patch.departmentId } };
  }
  if (patch.clientId !== undefined) {
    data.client = patch.clientId === null ? { disconnect: true } : { connect: { id: patch.clientId } };
  }
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.severity !== undefined) data.severity = patch.severity;
  if (patch.defaultAssigneeId !== undefined) {
    data.defaultAssignee =
      patch.defaultAssigneeId === null
        ? { disconnect: true }
        : { connect: { id: patch.defaultAssigneeId } };
  }
  if (patch.cadence !== undefined) data.cadence = patch.cadence;
  if (patch.anchor !== undefined) data.anchor = patch.anchor as Prisma.InputJsonValue;
  if (patch.timezone !== undefined) data.timezone = patch.timezone;
  if (recomputeNext) {
    data.nextRunAt = computeNextRunAt(new Date(), cadence, anchor, timezone);
  }

  const updated = await tx.recurringJobTemplate.update({ where: { id }, data });

  await writeAudit(tx, {
    actorUserId,
    action: "recurring_template.updated",
    entityType: "RecurringJobTemplate",
    entityId: id,
    diff: buildDiff(existing, updated),
  });
  return updated;
}

export async function pauseTemplate(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string }
): Promise<RecurringJobTemplate> {
  return setStatus(tx, args.actorUserId, args.id, "paused");
}

export async function resumeTemplate(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string }
): Promise<RecurringJobTemplate> {
  const existing = await tx.recurringJobTemplate.findUnique({ where: { id: args.id } });
  if (!existing) throw new Error("RecurringJobTemplate not found");
  const nextRunAt = computeNextRunAt(new Date(), existing.cadence, existing.anchor, existing.timezone);
  const updated = await tx.recurringJobTemplate.update({
    where: { id: args.id },
    data: { status: "active", nextRunAt, updatedByUserId: args.actorUserId },
  });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "recurring_template.resumed",
    entityType: "RecurringJobTemplate",
    entityId: args.id,
    diff: {
      status: { old: existing.status, new: "active" },
      nextRunAt: { old: existing.nextRunAt, new: nextRunAt },
    },
  });
  return updated;
}

async function setStatus(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  id: string,
  status: "active" | "paused"
): Promise<RecurringJobTemplate> {
  const existing = await tx.recurringJobTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error("RecurringJobTemplate not found");
  const updated = await tx.recurringJobTemplate.update({
    where: { id },
    data: { status, updatedByUserId: actorUserId },
  });
  await writeAudit(tx, {
    actorUserId,
    action: `recurring_template.${status === "paused" ? "paused" : "resumed"}`,
    entityType: "RecurringJobTemplate",
    entityId: id,
    diff: { status: { old: existing.status, new: status } },
  });
  return updated;
}

export async function deleteTemplate(
  tx: Prisma.TransactionClient,
  args: { actorUserId: string; id: string }
): Promise<void> {
  const existing = await tx.recurringJobTemplate.findUnique({ where: { id: args.id } });
  if (!existing) throw new Error("RecurringJobTemplate not found");
  await tx.recurringJobTemplate.delete({ where: { id: args.id } });
  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: "recurring_template.deleted",
    entityType: "RecurringJobTemplate",
    entityId: args.id,
    diff: {
      titleTemplate: { old: existing.titleTemplate, new: null },
      status: { old: existing.status, new: null },
    },
  });
}

function buildDiff(
  before: RecurringJobTemplate,
  after: RecurringJobTemplate
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys: (keyof RecurringJobTemplate)[] = [
    "name",
    "titleTemplate",
    "description",
    "departmentId",
    "clientId",
    "priority",
    "severity",
    "defaultAssigneeId",
    "cadence",
    "timezone",
    "nextRunAt",
    "status",
  ];
  for (const k of keys) {
    const a = before[k] as unknown;
    const b = after[k] as unknown;
    if (a instanceof Date && b instanceof Date) {
      if (a.getTime() !== b.getTime()) diff[k] = { old: a, new: b };
    } else if (a !== b) {
      diff[k] = { old: a, new: b };
    }
  }
  const aAnchor = JSON.stringify(before.anchor);
  const bAnchor = JSON.stringify(after.anchor);
  if (aAnchor !== bAnchor) diff["anchor"] = { old: before.anchor, new: after.anchor };
  return diff;
}
