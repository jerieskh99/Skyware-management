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
  return prisma.hourlyBank.findFirst({ where: { id: bankId, billingAccountId: ba.id }, select: { id: true } });
}

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, bankId } = await params;
  const bank = await getBank(clientId, bankId);
  if (!bank) return notFound("Hourly bank");

  const usages = await prisma.hourlyBankUsage.findMany({
    where: { hourlyBankId: bankId },
    include: {
      job: { select: { id: true, publicNumber: true, title: true } },
      recordedBy: { select: { displayName: true } },
    },
    orderBy: { usedAt: "desc" },
  });
  return NextResponse.json(usages);
}

const createSchema = z.object({
  jobId: z.string().uuid(),
  minutesUsed: z.number().int().positive(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, bankId } = await params;
  const bank = await getBank(clientId, bankId);
  if (!bank) return notFound("Hourly bank");

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const job = await prisma.job.findUnique({ where: { id: d.jobId }, select: { id: true } });
  if (!job) return notFound("Job");

  const usage = await prisma.$transaction(async (tx) => {
    const u = await tx.hourlyBankUsage.create({
      data: {
        hourlyBankId: bankId,
        jobId: d.jobId,
        minutesUsed: d.minutesUsed,
        recordedByUserId: auth.user.id,
        note: d.note ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "hourly_bank_usage.created",
      entityType: "HourlyBankUsage",
      entityId: u.id,
      diff: { minutesUsed: { old: null, new: d.minutesUsed }, jobId: { old: null, new: d.jobId } },
    });
    return u;
  });

  return NextResponse.json(usage, { status: 201 });
}
