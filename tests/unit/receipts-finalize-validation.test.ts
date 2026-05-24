import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { finalizeReceipt } from "@/lib/receipts/finalize";
import {
  ReceiptStateError,
  ReceiptValidationError,
} from "@/lib/receipts/errors";
import { prisma, resetPrisma } from "../helpers/prisma";

type Tx = Prisma.TransactionClient;

const RECEIPT_ID = "00000000-0000-0000-0000-0000000000a1";
const ACTOR_ID = "00000000-0000-0000-0000-00000000aaaa";

function setupSequenceUpsert() {
  prisma.receiptDocumentSequence.upsert.mockResolvedValueOnce({
    id: "seq-1",
    type: "invoice",
    year: 2026,
    nextNumber: 2, // post-create state; issued number = 1
  });
}

describe("finalizeReceipt - validation invariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("throws ReceiptValidationError when total != before + vat", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "invoice",
      status: "draft",
      currency: "ILS",
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_900, // wrong - should be 11_800
      exchangeRate: null,
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        finalizeReceipt(tx, { id: RECEIPT_ID, actorUserId: ACTOR_ID }),
      ),
    ).rejects.toBeInstanceOf(ReceiptValidationError);

    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("throws ReceiptValidationError when non-ILS row has no exchange rate", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "invoice",
      status: "draft",
      currency: "USD",
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      exchangeRate: null,
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        finalizeReceipt(tx, { id: RECEIPT_ID, actorUserId: ACTOR_ID }),
      ),
    ).rejects.toBeInstanceOf(ReceiptValidationError);
  });

  it("throws ReceiptStateError when row is not in draft", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "invoice",
      status: "finalized",
      currency: "ILS",
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      exchangeRate: null,
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        finalizeReceipt(tx, { id: RECEIPT_ID, actorUserId: ACTOR_ID }),
      ),
    ).rejects.toBeInstanceOf(ReceiptStateError);
  });

  it("reserves a number and updates the row when a draft is valid", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "invoice",
      status: "draft",
      currency: "ILS",
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      exchangeRate: null,
      documentNumber: null,
      documentNumberYear: null,
    });
    setupSequenceUpsert();
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      documentNumber: 1,
      documentNumberYear: 2026,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const out = await prisma.$transaction((tx: Tx) =>
      finalizeReceipt(tx, { id: RECEIPT_ID, actorUserId: ACTOR_ID }),
    );

    expect(out.status).toBe("finalized");
    expect(prisma.receiptDocumentSequence.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.receiptDocument.update.mock.calls[0]?.[0] as {
      data: {
        status: string;
        documentNumber: number;
        documentNumberYear: number;
        finalizedByUserId: string;
      };
    };
    expect(updateCall.data.status).toBe("finalized");
    expect(updateCall.data.documentNumber).toBe(1);
    expect(updateCall.data.finalizedByUserId).toBe(ACTOR_ID);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditCall.data.action).toBe("receipt.finalized");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
  });

  it("succeeds for a non-ILS draft when exchange rate is present", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      status: "draft",
      currency: "USD",
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      exchangeRate: "3.700000",
      documentNumber: null,
      documentNumberYear: null,
    });
    setupSequenceUpsert();
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-2" });

    const out = await prisma.$transaction((tx: Tx) =>
      finalizeReceipt(tx, { id: RECEIPT_ID, actorUserId: ACTOR_ID }),
    );

    expect(out.status).toBe("finalized");
  });
});
