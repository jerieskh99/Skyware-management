import { prisma } from "@/lib/prisma";
import type { PaymentStatus } from "@prisma/client";

export async function getClientBillingData(clientId: string) {
  const [billingAccount, payments] = await Promise.all([
    prisma.billingAccount.findUnique({
      where: { clientId },
      include: {
        monthlyBillingItems: { orderBy: { startDate: "desc" } },
        hourlyBanks: {
          include: {
            usages: {
              select: { id: true, minutesUsed: true, jobId: true, usedAt: true, note: true },
            },
          },
          orderBy: { purchaseDate: "desc" },
        },
        oneTimeCharges: {
          include: {
            job: { select: { id: true, publicNumber: true, title: true } },
            payment: { select: { id: true, status: true } },
          },
          orderBy: { dateCreated: "desc" },
        },
      },
    }),
    prisma.payment.findMany({
      where: { clientId },
      include: {
        sourceMonthly: { select: { id: true, serviceName: true } },
        createdBy: { select: { displayName: true } },
      },
      orderBy: { issuedDate: "desc" },
      take: 50,
    }),
  ]);

  return { billingAccount, payments };
}

export async function listPayments(opts: {
  status?: PaymentStatus[];
  clientId?: string;
  take?: number;
} = {}) {
  return prisma.payment.findMany({
    where: {
      ...(opts.status?.length ? { status: { in: opts.status } } : {}),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
    include: {
      client: { select: { id: true, companyName: true } },
      sourceMonthly: { select: { serviceName: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: opts.take ?? 100,
  });
}

export async function getBillingKpis() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [unpaidCount, overdueCount, paidThisMonth] = await Promise.all([
    prisma.payment.count({
      where: {
        status: { in: ["draft", "sent_to_client", "waiting_for_payment", "partially_paid"] },
      },
    }),
    prisma.payment.count({ where: { status: "overdue" } }),
    prisma.payment.count({
      where: { status: "paid", paidDate: { gte: monthStart } },
    }),
  ]);

  return { unpaidCount, overdueCount, paidThisMonth };
}

export async function getPaymentById(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      client: { select: { id: true, companyName: true } },
      sourceMonthly: { select: { serviceName: true } },
      createdBy: { select: { displayName: true } },
    },
  });
}

export async function getAgingPayments() {
  return prisma.payment.findMany({
    where: { status: { in: ["waiting_for_payment", "partially_paid", "overdue"] } },
    include: {
      client: { select: { id: true, companyName: true } },
      sourceMonthly: { select: { serviceName: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 10,
  });
}
