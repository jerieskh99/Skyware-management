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

const patchSchema = z.object({
  status: z.enum(["draft", "sent_to_client", "waiting_for_payment", "partially_paid", "paid", "cancelled", "overdue"]).optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  method: z.enum(["bank_transfer", "bit", "cheque", "cash", "credit_card", "other"]).optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  amountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, status: true, clientId: true },
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      const normalized = v === "" ? null : v;
      updateData[k] = k.endsWith("Date") && normalized ? new Date(normalized as string) : normalized;
      diff[k] = { old: (existing as Record<string, unknown>)[k] ?? null, new: normalized };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.payment.update({ where: { id }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "payment.updated",
      entityType: "Payment",
      entityId: id,
      diff,
    });
    return u;
  });

  return NextResponse.json(updated);
}
