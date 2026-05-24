import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { getAgingBuckets, listPaymentsByAgingBucket } from "@/lib/billing/queries";

describe("getAgingBuckets — query and shape", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns zeroed buckets when no rows are returned", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const out = await getAgingBuckets();
    expect(out).toEqual({
      b0_30: 0,
      b31_60: 0,
      b61_90: 0,
      b91_plus: 0,
      b0_30Amount: 0,
      b31_60Amount: 0,
      b61_90Amount: 0,
      b91_plusAmount: 0,
    });
  });

  it("maps raw bucket rows into the four named slots", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { bucket: "0-30", count: 5, total: BigInt(1500) },
      { bucket: "31-60", count: 2, total: BigInt(800) },
      { bucket: "61-90", count: 1, total: BigInt(300) },
      { bucket: "91+", count: 3, total: BigInt(4200) },
    ]);
    const out = await getAgingBuckets();
    expect(out.b0_30).toBe(5);
    expect(out.b0_30Amount).toBe(1500);
    expect(out.b31_60).toBe(2);
    expect(out.b31_60Amount).toBe(800);
    expect(out.b61_90).toBe(1);
    expect(out.b61_90Amount).toBe(300);
    expect(out.b91_plus).toBe(3);
    expect(out.b91_plusAmount).toBe(4200);
  });

  it("tolerates partial bucket rows (only some present)", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { bucket: "0-30", count: 7, total: BigInt(2000) },
      { bucket: "91+", count: 1, total: BigInt(999) },
    ]);
    const out = await getAgingBuckets();
    expect(out.b0_30).toBe(7);
    expect(out.b31_60).toBe(0);
    expect(out.b61_90).toBe(0);
    expect(out.b91_plus).toBe(1);
    expect(out.b91_plusAmount).toBe(999);
  });

  it("treats null total as 0 amount", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { bucket: "31-60", count: 4, total: null },
    ]);
    const out = await getAgingBuckets();
    expect(out.b31_60).toBe(4);
    expect(out.b31_60Amount).toBe(0);
  });
});

describe("listPaymentsByAgingBucket — date-range filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("filters by status set and a bounded date range for 31-60", async () => {
    prisma.payment.findMany.mockResolvedValueOnce([]);
    await listPaymentsByAgingBucket("31-60");

    const call = prisma.payment.findMany.mock.calls[0]?.[0] as {
      where: {
        status: { in: string[] };
        dueDate: { gte: Date; lte: Date };
      };
    };
    expect(call.where.status.in).toEqual([
      "sent_to_client",
      "waiting_for_payment",
      "partially_paid",
      "overdue",
    ]);
    // Bounded range for 31-60: gte ≈ 60d ago, lte ≈ 31d ago.
    expect(call.where.dueDate.gte).toBeInstanceOf(Date);
    expect(call.where.dueDate.lte).toBeInstanceOf(Date);
    const spread =
      call.where.dueDate.lte.getTime() - call.where.dueDate.gte.getTime();
    // Range width ≈ 29 days.
    expect(Math.round(spread / 86_400_000)).toBe(29);
  });

  it("uses an open-upper range for 0-30", async () => {
    prisma.payment.findMany.mockResolvedValueOnce([]);
    await listPaymentsByAgingBucket("0-30");
    const call = prisma.payment.findMany.mock.calls[0]?.[0] as {
      where: { dueDate: { gte: Date; lte?: Date } | { lte: Date } };
    };
    // 0-30 is gte: now-30d, no lte (open ended into future).
    const due = call.where.dueDate as { gte: Date; lte?: Date };
    expect(due.gte).toBeInstanceOf(Date);
    expect(due.lte).toBeUndefined();
  });

  it("uses a lte-only range for 91+", async () => {
    prisma.payment.findMany.mockResolvedValueOnce([]);
    await listPaymentsByAgingBucket("91+");
    const call = prisma.payment.findMany.mock.calls[0]?.[0] as {
      where: { dueDate: { lte: Date } };
    };
    expect(call.where.dueDate.lte).toBeInstanceOf(Date);
    const ageDays =
      (Date.now() - call.where.dueDate.lte.getTime()) / 86_400_000;
    expect(Math.round(ageDays)).toBe(91);
  });
});
