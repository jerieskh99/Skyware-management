import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string }> }

async function getBa(clientId: string) {
  return prisma.billingAccount.findUnique({ where: { clientId }, select: { id: true } });
}

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId } = await params;
  const ba = await getBa(clientId);
  if (!ba) return notFound("Billing account");

  const banks = await prisma.hourlyBank.findMany({
    where: { billingAccountId: ba.id },
    include: {
      usages: { select: { id: true, minutesUsed: true, usedAt: true, note: true } },
    },
    orderBy: { purchaseDate: "desc" },
  });
  return NextResponse.json(banks);
}

const createSchema = z.object({
  totalHoursPurchasedMinutes: z.number().int().positive().nullable().optional(),
  pricePerHourPlaceholder: z.number().int().nonnegative().nullable().optional(),
  totalPaymentPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).default("ILS"),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["active", "used_up", "none"]).default("active"),
  alertThresholdPercent: z.number().int().min(0).max(100).default(25),
});

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId } = await params;
  const ba = await getBa(clientId);
  if (!ba) return notFound("Billing account");

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const bank = await prisma.$transaction(async (tx) => {
    const b = await tx.hourlyBank.create({
      data: {
        billingAccountId: ba.id,
        totalHoursPurchasedMinutes: d.totalHoursPurchasedMinutes ?? null,
        pricePerHourPlaceholder: d.pricePerHourPlaceholder ?? null,
        totalPaymentPlaceholder: d.totalPaymentPlaceholder ?? null,
        currency: d.currency,
        purchaseDate: new Date(d.purchaseDate),
        expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
        status: d.status,
        alertThresholdPercent: d.alertThresholdPercent,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "hourly_bank.created",
      entityType: "HourlyBank",
      entityId: b.id,
      diff: { purchaseDate: { old: null, new: d.purchaseDate } },
    });
    return b;
  });

  return NextResponse.json(bank, { status: 201 });
}
