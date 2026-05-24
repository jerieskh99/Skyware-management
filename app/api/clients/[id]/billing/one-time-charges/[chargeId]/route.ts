import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string; chargeId: string }> }

async function getCharge(clientId: string, chargeId: string) {
  const ba = await prisma.billingAccount.findUnique({ where: { clientId }, select: { id: true } });
  if (!ba) return null;
  return prisma.oneTimeJobCharge.findFirst({ where: { id: chargeId, billingAccountId: ba.id } });
}

const patchSchema = z.object({
  priceAmountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).optional(),
  paymentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, chargeId } = await params;
  const charge = await getCharge(clientId, chargeId);
  if (!charge) return notFound("One-time charge");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      updateData[k] = v;
      diff[k] = { old: (charge as Record<string, unknown>)[k] ?? null, new: v };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.oneTimeJobCharge.update({ where: { id: chargeId }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "one_time_job_charge.updated",
      entityType: "OneTimeJobCharge",
      entityId: chargeId,
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

  const { id: clientId, chargeId } = await params;
  const charge = await getCharge(clientId, chargeId);
  if (!charge) return notFound("One-time charge");

  await prisma.$transaction(async (tx) => {
    await tx.oneTimeJobCharge.delete({ where: { id: chargeId } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "one_time_job_charge.deleted",
      entityType: "OneTimeJobCharge",
      entityId: chargeId,
      diff: { jobNameSnapshot: { old: charge.jobNameSnapshot, new: null } },
    });
  });

  return new NextResponse(null, { status: 204 });
}
