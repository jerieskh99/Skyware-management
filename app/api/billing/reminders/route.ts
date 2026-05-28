import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, PaymentReminderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canManageReminders } from "@/lib/billing/permissions";

const STATUS_VALUES: PaymentReminderStatus[] = [
  "scheduled",
  "admin_notified",
  "approved",
  "delayed",
  "cancelled",
  "sent",
  "send_failed",
  "bounced",
];

const listQuerySchema = z.object({
  status: z.enum(STATUS_VALUES as [PaymentReminderStatus, ...PaymentReminderStatus[]]).optional(),
  clientId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

/**
 * GET /api/billing/reminders — admin list of payment reminders.
 *
 * Filters: `status`, `clientId`, `from`/`to` (bounds on `scheduledFor`,
 * inclusive of the day), plus `limit`/`offset` paging.
 *
 * Gated by `billing_reminders_enabled` (404 when off). Admin-only.
 *
 * Response shape (per reminder):
 *   {
 *     id, status, scheduledFor, adminNotifiedAt, decidedAt, sentAt,
 *     failureReason,
 *     payment: { id, reference, dueDate, amount, currency,
 *                latenessAmount, latenessUnit, latenessNotifyAdminFirst,
 *                autoSendAfterMinutes },
 *     client: { id, companyName }
 *   }
 * Top-level: { reminders: [...], total, limit, offset }.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canManageReminders(auth.user)) return forbidden();

  if (!(await getFeatureFlag("billing_reminders_enabled"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    clientId: searchParams.get("clientId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.issues);
  const q = parsed.data;

  const scheduledFor: Prisma.DateTimeFilter = {};
  if (q.from) scheduledFor.gte = new Date(`${q.from}T00:00:00.000Z`);
  if (q.to) scheduledFor.lte = new Date(`${q.to}T23:59:59.999Z`);

  const where: Prisma.PaymentReminderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.from || q.to ? { scheduledFor } : {}),
    ...(q.clientId ? { payment: { clientId: q.clientId } } : {}),
  };

  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;

  const [rows, total] = await Promise.all([
    prisma.paymentReminder.findMany({
      where,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        adminNotifiedAt: true,
        decidedAt: true,
        sentAt: true,
        failureReason: true,
        payment: {
          select: {
            id: true,
            reference: true,
            dueDate: true,
            amountPlaceholder: true,
            totalAmount: true,
            currency: true,
            latenessAmount: true,
            latenessUnit: true,
            latenessNotifyAdminFirst: true,
            autoSendAfterMinutes: true,
            client: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: [{ scheduledFor: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.paymentReminder.count({ where }),
  ]);

  const reminders = rows.map((r) => ({
    id: r.id,
    status: r.status,
    scheduledFor: r.scheduledFor,
    adminNotifiedAt: r.adminNotifiedAt,
    decidedAt: r.decidedAt,
    sentAt: r.sentAt,
    failureReason: r.failureReason,
    payment: {
      id: r.payment.id,
      reference: r.payment.reference,
      dueDate: r.payment.dueDate,
      amount: r.payment.totalAmount ?? r.payment.amountPlaceholder ?? null,
      currency: r.payment.currency,
      latenessAmount: r.payment.latenessAmount,
      latenessUnit: r.payment.latenessUnit,
      latenessNotifyAdminFirst: r.payment.latenessNotifyAdminFirst,
      autoSendAfterMinutes: r.payment.autoSendAfterMinutes,
    },
    client: r.payment.client,
  }));

  return NextResponse.json({ reminders, total, limit, offset });
}
