import { NextResponse } from "next/server";
import { z } from "zod";
import type { EmailTemplateKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  notFound,
} from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canEditEmailTemplates } from "@/lib/billing/permissions";
import { BILLING_AUDIT_ACTIONS } from "@/lib/billing/billing-audit-actions";

interface Params {
  params: Promise<{ kind: string }>;
}

const KIND_VALUES: EmailTemplateKind[] = [
  "payment_reminder_admin",
  "payment_reminder_client",
  "hourly_bank_low_admin",
  "hourly_bank_low_client",
  "manual_contact",
];

function isKind(value: string): value is EmailTemplateKind {
  return (KIND_VALUES as string[]).includes(value);
}

const patchSchema = z
  .object({
    subjectEn: z.string().trim().min(1).max(500).optional(),
    bodyEn: z.string().trim().min(1).max(20_000).optional(),
    subjectHe: z.string().trim().min(1).max(500).optional(),
    bodyHe: z.string().trim().min(1).max(20_000).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    variableNotes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided.",
  });

/**
 * GET /api/admin/email-templates/[kind] — fetch one template.
 * Gated by `email_templates_admin_ui` (404 when off). Admin-only.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canEditEmailTemplates(auth.user)) return forbidden();

  if (!(await getFeatureFlag("email_templates_admin_ui"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { kind } = await params;
  if (!isKind(kind)) return notFound("Email template");

  const template = await prisma.emailTemplate.findUnique({ where: { kind } });
  if (!template) return notFound("Email template");
  return NextResponse.json(template);
}

/**
 * PATCH /api/admin/email-templates/[kind] — update subject/body (en + he).
 *
 * Body: any subset of { subjectEn, bodyEn, subjectHe, bodyHe, name,
 *        variableNotes }. Gated by `email_templates_admin_ui` (404 when off).
 * Admin-only. Audited as `billing.email_template.updated`.
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canEditEmailTemplates(auth.user)) return forbidden();

  if (!(await getFeatureFlag("email_templates_admin_ui"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { kind } = await params;
  if (!isKind(kind)) return notFound("Email template");

  const existing = await prisma.emailTemplate.findUnique({ where: { kind } });
  if (!existing) return notFound("Email template");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const updateData: Record<string, unknown> = { updatedByUserId: auth.user.id };
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      updateData[k] = v;
      diff[k] = { old: (existing as Record<string, unknown>)[k] ?? null, new: v };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.emailTemplate.update({ where: { kind }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: BILLING_AUDIT_ACTIONS.EMAIL_TEMPLATE_UPDATED,
      entityType: "EmailTemplate",
      entityId: u.id,
      diff,
    });
    return u;
  });

  return NextResponse.json(updated);
}
