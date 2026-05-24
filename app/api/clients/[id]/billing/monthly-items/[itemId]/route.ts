import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string; itemId: string }> }

async function getItem(clientId: string, itemId: string) {
  const ba = await prisma.billingAccount.findUnique({ where: { clientId }, select: { id: true } });
  if (!ba) return null;
  return prisma.monthlyBillingItem.findFirst({ where: { id: itemId, billingAccountId: ba.id } });
}

const patchSchema = z.object({
  serviceName: z.string().min(1).max(200).trim().optional(),
  priceAmountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "paused", "cancelled", "none"]).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, itemId } = await params;
  const item = await getItem(clientId, itemId);
  if (!item) return notFound("Monthly billing item");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      updateData[k] = k === "endDate" && v ? new Date(v as string) : v;
      diff[k] = { old: (item as Record<string, unknown>)[k] ?? null, new: v };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.monthlyBillingItem.update({ where: { id: itemId }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "monthly_billing_item.updated",
      entityType: "MonthlyBillingItem",
      entityId: itemId,
      diff,
    });
    return u;
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, itemId } = await params;
  const item = await getItem(clientId, itemId);
  if (!item) return notFound("Monthly billing item");

  await prisma.$transaction(async (tx) => {
    await tx.monthlyBillingItem.delete({ where: { id: itemId } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "monthly_billing_item.deleted",
      entityType: "MonthlyBillingItem",
      entityId: itemId,
      diff: { serviceName: { old: item.serviceName, new: null } },
    });
  });

  return new NextResponse(null, { status: 204 });
}
