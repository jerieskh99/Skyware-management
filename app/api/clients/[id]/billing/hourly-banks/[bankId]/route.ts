import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string; bankId: string }> }

async function getBank(clientId: string, bankId: string) {
  const ba = await prisma.billingAccount.findUnique({ where: { clientId }, select: { id: true } });
  if (!ba) return null;
  return prisma.hourlyBank.findFirst({ where: { id: bankId, billingAccountId: ba.id } });
}

const patchSchema = z.object({
  totalHoursPurchasedMinutes: z.number().int().positive().nullable().optional(),
  pricePerHourPlaceholder: z.number().int().nonnegative().nullable().optional(),
  totalPaymentPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "used_up", "none"]).optional(),
  alertThresholdPercent: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, bankId } = await params;
  const bank = await getBank(clientId, bankId);
  if (!bank) return notFound("Hourly bank");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      updateData[k] = k === "expiryDate" && v ? new Date(v as string) : v;
      diff[k] = { old: (bank as Record<string, unknown>)[k] ?? null, new: v };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.hourlyBank.update({ where: { id: bankId }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "hourly_bank.updated",
      entityType: "HourlyBank",
      entityId: bankId,
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

  const { id: clientId, bankId } = await params;
  const bank = await getBank(clientId, bankId);
  if (!bank) return notFound("Hourly bank");

  await prisma.$transaction(async (tx) => {
    await tx.hourlyBank.delete({ where: { id: bankId } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "hourly_bank.deleted",
      entityType: "HourlyBank",
      entityId: bankId,
      diff: { status: { old: bank.status, new: null } },
    });
  });

  return new NextResponse(null, { status: 204 });
}
