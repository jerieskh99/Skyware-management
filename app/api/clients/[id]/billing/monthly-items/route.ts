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

  const items = await prisma.monthlyBillingItem.findMany({
    where: { billingAccountId: ba.id },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(items);
}

const createSchema = z.object({
  serviceName: z.string().min(1).max(200).trim(),
  priceAmountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).default("ILS"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["active", "paused", "cancelled", "none"]).default("active"),
  billingCycle: z.string().max(50).default("monthly"),
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

  const item = await prisma.$transaction(async (tx) => {
    const i = await tx.monthlyBillingItem.create({
      data: {
        billingAccountId: ba.id,
        serviceName: d.serviceName,
        priceAmountPlaceholder: d.priceAmountPlaceholder ?? null,
        currency: d.currency,
        startDate: new Date(d.startDate),
        endDate: d.endDate ? new Date(d.endDate) : null,
        status: d.status,
        billingCycle: d.billingCycle,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "monthly_billing_item.created",
      entityType: "MonthlyBillingItem",
      entityId: i.id,
      diff: { serviceName: { old: null, new: d.serviceName } },
    });
    return i;
  });

  return NextResponse.json(item, { status: 201 });
}
