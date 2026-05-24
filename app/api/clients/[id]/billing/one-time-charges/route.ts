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

  const charges = await prisma.oneTimeJobCharge.findMany({
    where: { billingAccountId: ba.id },
    include: {
      job: { select: { id: true, publicNumber: true, title: true } },
      payment: { select: { id: true, status: true } },
    },
    orderBy: { dateCreated: "desc" },
  });
  return NextResponse.json(charges);
}

const createSchema = z.object({
  jobId: z.string().uuid(),
  priceAmountPlaceholder: z.number().int().nonnegative().nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).default("ILS"),
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

  const job = await prisma.job.findUnique({
    where: { id: d.jobId },
    select: { id: true, title: true, clientId: true, oneTimeCharge: true },
  });
  if (!job) return notFound("Job");
  if (job.oneTimeCharge) {
    return badRequest([{ message: "This job already has a one-time charge." }]);
  }

  const charge = await prisma.$transaction(async (tx) => {
    const c = await tx.oneTimeJobCharge.create({
      data: {
        billingAccountId: ba.id,
        jobId: d.jobId,
        jobNameSnapshot: job.title,
        priceAmountPlaceholder: d.priceAmountPlaceholder ?? null,
        currency: d.currency,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "one_time_job_charge.created",
      entityType: "OneTimeJobCharge",
      entityId: c.id,
      diff: { jobId: { old: null, new: d.jobId }, jobNameSnapshot: { old: null, new: job.title } },
    });
    return c;
  });

  return NextResponse.json(charge, { status: 201 });
}
