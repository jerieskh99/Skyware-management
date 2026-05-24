import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaymentStatus } from "@prisma/client";

export const AGING_BUCKET_KEYS = ["0-30", "31-60", "61-90", "91+"] as const;
export type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number];

const OPEN_AGING_STATUSES: PaymentStatus[] = [
  "sent_to_client",
  "waiting_for_payment",
  "partially_paid",
  "overdue",
];

const OPEN_AGING_STATUSES_SQL = Prisma.sql`('sent_to_client','waiting_for_payment','partially_paid','overdue')`;

/**
 * Pure helper. Returns the aging bucket for a row given its due date and the
 * comparison `now`. Rows not yet due (negative age) land in the 0-30 bucket
 * because they are still considered "open" against the same status set.
 */
export function bucketize(dueDate: Date | null, now: Date): AgingBucketKey | null {
  if (!dueDate) return null;
  const ageDays = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "91+";
}

export function bucketRange(key: AgingBucketKey, now: Date): { gte: Date; lte: Date | null } {
  const day = 86_400_000;
  switch (key) {
    case "0-30": {
      const gte = new Date(now.getTime() - 30 * day);
      return { gte, lte: null };
    }
    case "31-60":
      return { gte: new Date(now.getTime() - 60 * day), lte: new Date(now.getTime() - 31 * day) };
    case "61-90":
      return { gte: new Date(now.getTime() - 90 * day), lte: new Date(now.getTime() - 61 * day) };
    case "91+":
      return { gte: new Date(0), lte: new Date(now.getTime() - 91 * day) };
  }
}

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

export interface AgingBuckets {
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91_plus: number;
  b0_30Amount: number;
  b31_60Amount: number;
  b61_90Amount: number;
  b91_plusAmount: number;
}

interface AgingBucketRow {
  bucket: string;
  count: bigint | number;
  total: bigint | number | null;
}

/**
 * Time-bucketed AR aging. One round-trip; counts and summed amounts grouped
 * by bucket. Buckets are 0-30 / 31-60 / 61-90 / 91+ days past `due_date`.
 *
 * Rows whose `due_date` is in the future still fall in the 0-30 bucket since
 * they are open and not yet overdue. `due_date IS NULL` rows are excluded.
 */
export async function getAgingBuckets(): Promise<AgingBuckets> {
  const rows = await prisma.$queryRaw<AgingBucketRow[]>`
    SELECT
      CASE
        WHEN GREATEST(0, FLOOR((EXTRACT(EPOCH FROM (NOW() - due_date)) / 86400) / 30)::int) >= 3 THEN '91+'
        WHEN GREATEST(0, FLOOR((EXTRACT(EPOCH FROM (NOW() - due_date)) / 86400) / 30)::int) = 2 THEN '61-90'
        WHEN GREATEST(0, FLOOR((EXTRACT(EPOCH FROM (NOW() - due_date)) / 86400) / 30)::int) = 1 THEN '31-60'
        ELSE '0-30'
      END AS bucket,
      COUNT(*)::int AS count,
      COALESCE(SUM(amount_placeholder), 0)::bigint AS total
    FROM payments
    WHERE status IN ${OPEN_AGING_STATUSES_SQL}
      AND due_date IS NOT NULL
    GROUP BY bucket
  `;

  const out: AgingBuckets = {
    b0_30: 0,
    b31_60: 0,
    b61_90: 0,
    b91_plus: 0,
    b0_30Amount: 0,
    b31_60Amount: 0,
    b61_90Amount: 0,
    b91_plusAmount: 0,
  };

  for (const r of rows) {
    const count = Number(r.count);
    const total = r.total === null ? 0 : Number(r.total);
    switch (r.bucket) {
      case "0-30":
        out.b0_30 = count;
        out.b0_30Amount = total;
        break;
      case "31-60":
        out.b31_60 = count;
        out.b31_60Amount = total;
        break;
      case "61-90":
        out.b61_90 = count;
        out.b61_90Amount = total;
        break;
      case "91+":
        out.b91_plus = count;
        out.b91_plusAmount = total;
        break;
    }
  }

  return out;
}

/**
 * Filter the same payments table by aging bucket for click-through from the
 * aging strip on `/billing`. Returns the same shape as `listPayments` so the
 * caller can render with the existing table.
 *
 * Buckets bound `due_date` as follows (with `now` = call time):
 *   0-30  -> dueDate >= now - 30d (open-ended into the future)
 *   31-60 -> now - 60d <= dueDate <= now - 31d
 *   61-90 -> now - 90d <= dueDate <= now - 61d
 *   91+   -> dueDate <= now - 91d (open-ended into the past)
 */
export async function listPaymentsByAgingBucket(bucket: AgingBucketKey, opts: { take?: number } = {}) {
  const now = new Date();
  const day = 86_400_000;

  let dueDate: { gte?: Date; lte?: Date };
  switch (bucket) {
    case "0-30":
      dueDate = { gte: new Date(now.getTime() - 30 * day) };
      break;
    case "31-60":
      dueDate = { gte: new Date(now.getTime() - 60 * day), lte: new Date(now.getTime() - 31 * day) };
      break;
    case "61-90":
      dueDate = { gte: new Date(now.getTime() - 90 * day), lte: new Date(now.getTime() - 61 * day) };
      break;
    case "91+":
      dueDate = { lte: new Date(now.getTime() - 91 * day) };
      break;
  }

  return prisma.payment.findMany({
    where: {
      status: { in: OPEN_AGING_STATUSES },
      dueDate,
    },
    include: {
      client: { select: { id: true, companyName: true } },
      sourceMonthly: { select: { serviceName: true } },
    },
    orderBy: [{ dueDate: "asc" }, { status: "asc" }],
    take: opts.take ?? 100,
  });
}

// ─── Hourly-bank burn rate ──────────────────────────────────────────────────

export interface BankBurn {
  monthsObserved: number;
  minutesUsedTotal: number;
  avgMonthlyMinutes: number;
  remainingMinutes: number;
  projectedMonthsRemaining: number | null;
}

interface BankBurnUsageRow {
  hourlyBankId: string;
  minutesUsed: number;
  usedAt: Date;
}

interface BankMeta {
  id: string;
  totalHoursPurchasedMinutes: number | null;
}

/**
 * Compute monthly burn for one or many hourly banks in a single query. When
 * `bankIds` is omitted, all active banks are scanned. Returns a Map keyed by
 * `bankId` so callers can join against their own bank rows without N+1.
 */
export async function getBankBurn(
  bankId: string,
): Promise<BankBurn>;
export async function getBankBurn(
  bankIds: string[],
): Promise<Map<string, BankBurn>>;
export async function getBankBurn(
  input: string | string[],
): Promise<BankBurn | Map<string, BankBurn>> {
  const ids = Array.isArray(input) ? input : [input];
  if (ids.length === 0) {
    return new Map();
  }

  const [banks, usages] = await Promise.all([
    prisma.hourlyBank.findMany({
      where: { id: { in: ids } },
      select: { id: true, totalHoursPurchasedMinutes: true },
    }) as Promise<BankMeta[]>,
    prisma.hourlyBankUsage.findMany({
      where: { hourlyBankId: { in: ids } },
      select: { hourlyBankId: true, minutesUsed: true, usedAt: true },
    }) as Promise<BankBurnUsageRow[]>,
  ]);

  const map = new Map<string, BankBurn>();
  for (const bank of banks) {
    map.set(bank.id, computeBurnFor(bank, usages.filter((u) => u.hourlyBankId === bank.id)));
  }
  // Any requested id that has no row gets a zero record.
  for (const id of ids) {
    if (!map.has(id)) map.set(id, zeroBurn());
  }

  if (Array.isArray(input)) return map;
  return map.get(ids[0]!) ?? zeroBurn();
}

/** Pure compute used by `getBankBurn`; exported for tests. */
export function computeBurnFor(
  bank: { totalHoursPurchasedMinutes: number | null },
  usages: Array<{ minutesUsed: number; usedAt: Date }>,
): BankBurn {
  if (usages.length === 0) {
    const remaining = bank.totalHoursPurchasedMinutes ?? 0;
    return {
      monthsObserved: 0,
      minutesUsedTotal: 0,
      avgMonthlyMinutes: 0,
      remainingMinutes: remaining,
      projectedMonthsRemaining: null,
    };
  }

  const months = new Set<string>();
  let total = 0;
  for (const u of usages) {
    total += u.minutesUsed;
    const d = u.usedAt;
    months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const monthsObserved = months.size;
  const avgMonthlyMinutes = monthsObserved > 0 ? total / monthsObserved : 0;
  const remainingMinutes = Math.max(0, (bank.totalHoursPurchasedMinutes ?? 0) - total);
  const projectedMonthsRemaining =
    avgMonthlyMinutes > 0 ? remainingMinutes / avgMonthlyMinutes : null;

  return {
    monthsObserved,
    minutesUsedTotal: total,
    avgMonthlyMinutes,
    remainingMinutes,
    projectedMonthsRemaining,
  };
}

function zeroBurn(): BankBurn {
  return {
    monthsObserved: 0,
    minutesUsedTotal: 0,
    avgMonthlyMinutes: 0,
    remainingMinutes: 0,
    projectedMonthsRemaining: null,
  };
}
