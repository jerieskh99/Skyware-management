import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getPaymentById } from "@/lib/billing/queries";
import { isAllowedTransition } from "@/lib/billing/payment-lifecycle";
import { BILLING_AUDIT_ACTIONS } from "@/lib/billing/billing-audit-actions";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const payment = await getPaymentById(id);
  if (!payment) return notFound("Payment");
  return NextResponse.json(payment);
}

const patchSchema = z
  .object({
    status: z.enum(["draft", "sent_to_client", "waiting_for_payment", "partially_paid", "paid", "cancelled", "overdue"]).optional(),
    paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    method: z.enum(["bank_transfer", "bit", "cheque", "cash", "credit_card", "other"]).optional().nullable(),
    reference: z.string().trim().max(200).optional().nullable(),
    amountPlaceholder: z.number().int().nonnegative().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    // Wave-2 lateness reminder rule. `latenessAmount` + `latenessUnit` must be
    // set together or both null (DB CHECK `payments_lateness_consistency_chk`).
    latenessAmount: z.number().int().positive().nullable().optional(),
    latenessUnit: z.enum(["days", "weeks"]).nullable().optional(),
    latenessNotifyAdminFirst: z.boolean().optional(),
    autoSendAfterMinutes: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (d) => {
      // Both-or-neither for the amount/unit pair, only when at least one is
      // present in the patch. A patch that touches neither is unconstrained.
      const touchesAmount = d.latenessAmount !== undefined;
      const touchesUnit = d.latenessUnit !== undefined;
      if (!touchesAmount && !touchesUnit) return true;
      const amount = d.latenessAmount ?? null;
      const unit = d.latenessUnit ?? null;
      return (amount === null) === (unit === null);
    },
    {
      message:
        "latenessAmount and latenessUnit must be provided together, or both cleared (null).",
      path: ["latenessAmount"],
    },
  );

/** Fields that constitute the lateness reminder rule (audited separately). */
const LATENESS_FIELDS = new Set([
  "latenessAmount",
  "latenessUnit",
  "latenessNotifyAdminFirst",
  "autoSendAfterMinutes",
]);

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      clientId: true,
      latenessAmount: true,
      latenessUnit: true,
      latenessNotifyAdminFirst: true,
      autoSendAfterMinutes: true,
    },
  });
  if (!existing) return notFound("Payment");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // Enforce the status transition matrix at the server layer. The UI guards
  // against bad transitions in MarkPaidSheet, but any direct PATCH must still
  // pass the matrix in lib/billing/payment-lifecycle.ts.
  if (d.status && d.status !== existing.status) {
    if (!isAllowedTransition(existing.status, d.status)) {
      return unprocessable(
        `Payment cannot transition from ${existing.status} to ${d.status}`,
      );
    }
  }

  if (d.status === "paid" && !d.paidDate) {
    return badRequest([{ message: "paidDate is required when marking a payment as paid." }]);
  }

  // Validate the lateness rule against the MERGED state (patch over existing),
  // so partial patches cannot leave the row in an amount/unit-inconsistent
  // shape that the DB CHECK would reject with an opaque 500.
  const mergedAmount =
    d.latenessAmount !== undefined ? d.latenessAmount : existing.latenessAmount;
  const mergedUnit =
    d.latenessUnit !== undefined ? d.latenessUnit : existing.latenessUnit;
  if ((mergedAmount === null) !== (mergedUnit === null)) {
    return badRequest([
      {
        message:
          "latenessAmount and latenessUnit must both be set or both be null after the update.",
        path: ["latenessAmount"],
      },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const latenessDiff: Record<string, { old: unknown; new: unknown }> = {};

  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      const normalized = v === "" ? null : v;
      updateData[k] = k.endsWith("Date") && normalized ? new Date(normalized as string) : normalized;
      const entry = { old: (existing as Record<string, unknown>)[k] ?? null, new: normalized };
      if (LATENESS_FIELDS.has(k)) latenessDiff[k] = entry;
      else diff[k] = entry;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.payment.update({ where: { id }, data: updateData });
    // Non-lateness changes audit under the existing payment.updated action.
    if (Object.keys(diff).length > 0) {
      await writeAudit(tx, {
        actorUserId: auth.user.id,
        action: "payment.updated",
        entityType: "Payment",
        entityId: id,
        diff,
      });
    }
    // Lateness-rule changes audit under their own action so the reminder
    // configuration history is greppable independently.
    if (Object.keys(latenessDiff).length > 0) {
      await writeAudit(tx, {
        actorUserId: auth.user.id,
        action: BILLING_AUDIT_ACTIONS.PAYMENT_LATENESS_RULE_SET,
        entityType: "Payment",
        entityId: id,
        diff: latenessDiff,
      });
    }
    return u;
  });

  return NextResponse.json(updated);
}
