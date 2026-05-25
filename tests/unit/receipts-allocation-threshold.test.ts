import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { requestAllocationNumber } from "@/lib/receipts/allocation";
import { prisma, resetPrisma } from "../helpers/prisma";

type Tx = Prisma.TransactionClient;

const RECEIPT_ID = "00000000-0000-0000-0000-000000000b01";
const ACTOR_ID = "00000000-0000-0000-0000-00000000bbbb";
// After 2026-01-01 Asia/Jerusalem, threshold = 10,000 ILS (1_000_000 minor).
// After 2026-06-01 Asia/Jerusalem, threshold = 5,000 ILS  (500_000   minor).
const AFTER_JAN_2026 = new Date("2026-02-15T00:00:00Z");
const AFTER_JUN_2026 = new Date("2026-07-15T00:00:00Z");

describe("requestAllocationNumber - country profile threshold", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    // CompanySettings singleton resolves to IL by default.
    prisma.companySettings.findFirst.mockResolvedValue({ country: "IL" });
  });

  it("returns not_required for tax_invoice below the 10K threshold (pre-VAT)", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: AFTER_JAN_2026,
      amountBeforeVat: 999_999, // 9,999.99 ILS pre-VAT, just under 10K.
      allocationStatus: "not_required",
    });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("not_required");
    // No transition happened: the status was already not_required.
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns pending and audits when tax_invoice meets the 10K threshold (pre-VAT)", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: AFTER_JAN_2026,
      amountBeforeVat: 1_000_000, // exactly 10,000 ILS pre-VAT.
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

  it("returns pending when tax_invoice_receipt meets the 10K threshold", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice_receipt",
      issueDate: AFTER_JAN_2026,
      amountBeforeVat: 1_500_000, // 15,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      allocationStatus: "pending",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-a2" });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("pending");
  });

  it("returns not_required for non-applicable types (receipt, proforma, invoice, credit_note)", async () => {
    for (const type of [
      "receipt",
      "proforma_invoice",
      "invoice",
      "credit_note",
    ] as const) {
      resetPrisma();
      prisma.companySettings.findFirst.mockResolvedValue({ country: "IL" });
      prisma.receiptDocument.findUnique.mockResolvedValueOnce({
        id: RECEIPT_ID,
        type,
        issueDate: AFTER_JAN_2026,
        amountBeforeVat: 9_999_999, // ~100K ILS pre-VAT.
        allocationStatus: "not_required",
      });

      const out = await prisma.$transaction((tx: Tx) =>
        requestAllocationNumber(tx, {
          receiptId: RECEIPT_ID,
          actorUserId: ACTOR_ID,
        }),
      );
      expect(out.status).toBe("not_required");
      // Status already not_required; no transition, no audit.
      expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    }
  });

  it("returns pending when tax_invoice meets the 5K threshold after 2026-06-01", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: AFTER_JUN_2026,
      amountBeforeVat: 500_000, // exactly 5,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      allocationStatus: "pending",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-a3" });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("pending");
    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent on rows already in `issued`", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: AFTER_JAN_2026,
      amountBeforeVat: 1_500_000,
      allocationStatus: "issued",
    });

    const out = await prisma.$transaction((tx: Tx) =>
      requestAllocationNumber(tx, {
        receiptId: RECEIPT_ID,
        actorUserId: ACTOR_ID,
      }),
    );

    expect(out.status).toBe("issued");
    // No CompanySettings lookup, no update, no audit on `issued` shortcut.
    expect(prisma.companySettings.findFirst).not.toHaveBeenCalled();
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
