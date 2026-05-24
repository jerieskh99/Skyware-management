import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { requestAllocationNumber } from "@/lib/receipts/allocation";
import { prisma, resetPrisma } from "../helpers/prisma";

type Tx = Prisma.TransactionClient;

const RECEIPT_ID = "00000000-0000-0000-0000-000000000b01";
const ACTOR_ID = "00000000-0000-0000-0000-00000000bbbb";

describe("requestAllocationNumber - threshold logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns not_required when total is below the ILS threshold", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      currency: "ILS",
      totalAmount: 2_499_999, // 24,999.99 ILS - just below 25,000 threshold
      allocationStatus: "not_required",
    });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("not_required");
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns not_required for non-ILS even when above the ILS threshold", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      currency: "USD",
      totalAmount: 10_000_000,
      allocationStatus: "not_required",
    });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("not_required");
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("returns pending and writes audit when ILS total is at/above threshold", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      currency: "ILS",
      totalAmount: 2_500_000, // exactly 25,000 ILS
      allocationStatus: "not_required",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      allocationStatus: "pending",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-a1" });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("pending");
    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("receipt.allocation_requested");
  });
});
