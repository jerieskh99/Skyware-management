import { NextResponse } from "next/server";
import { z } from "zod";
import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { listPayments } from "@/lib/billing/queries";

const VALID_STATUSES = new Set<PaymentStatus>([
  "draft", "sent_to_client", "waiting_for_payment",
  "partially_paid", "paid", "cancelled", "overdue",
]);

/** GET /api/billing/payments?status=...&clientId=... */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const rawStatuses = searchParams.getAll("status").filter((s) =>
    VALID_STATUSES.has(s as PaymentStatus)
  ) as PaymentStatus[];
  const clientId = searchParams.get("clientId") ?? undefined;

  const payments = await listPayments({ status: rawStatuses.length ? rawStatuses : undefined, clientId });
  return NextResponse.json(payments);
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  sourceType: z.enum(["monthly", "hourly_bank", "one_time"]),
  sourceMonthlyId: z.string().uuid().optional(),
  sourceHourlyId: z.string().uuid().optional(),
  amountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).default("ILS"),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["draft", "sent_to_client", "waiting_for_payment", "partially_paid", "paid", "cancelled", "overdue"]).default("draft"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** POST /api/billing/payments */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } });
  if (!client) return notFound("Client");

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        clientId: d.clientId,
        sourceType: d.sourceType,
        sourceMonthlyId: d.sourceMonthlyId ?? null,
        sourceHourlyId: d.sourceHourlyId ?? null,
        amountPlaceholder: d.amountPlaceholder ?? null,
        currency: d.currency,
        issuedDate: new Date(d.issuedDate),
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        status: d.status,
        notes: d.notes ?? null,
        createdByUserId: auth.user.id,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "payment.created",
      entityType: "Payment",
      entityId: p.id,
      diff: { status: { old: null, new: d.status }, clientId: { old: null, new: d.clientId } },
    });
    return p;
  });

  return NextResponse.json(payment, { status: 201 });
}
