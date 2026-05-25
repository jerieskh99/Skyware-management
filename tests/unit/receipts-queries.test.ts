import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  createReceiptDraft,
  updateReceiptDraft,
  deleteReceiptDraft,
} from "@/lib/receipts/queries";
import {
  ReceiptStateError,
  ReceiptValidationError,
} from "@/lib/receipts/errors";
import { prisma, resetPrisma } from "../helpers/prisma";

type Tx = Prisma.TransactionClient;

const ACTOR_ID = "00000000-0000-0000-0000-0000000000aa";
const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const RECEIPT_ID = "00000000-0000-0000-0000-000000000010";

const DESC_LINES = [
  { description: "Consulting", quantity: 1, unitPrice: 100, lineTotal: 100 },
];

describe("createReceiptDraft - defaults and auto-fill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("rejects with ReceiptValidationError when descriptionLines is empty", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce({
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      country: "IL",
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        createReceiptDraft(
          tx,
          {
            type: "tax_invoice",
            clientId: CLIENT_ID,
            issueDate: new Date("2026-03-15"),
            descriptionLines: [],
          },
          ACTOR_ID,
        ),
      ),
    ).rejects.toBeInstanceOf(ReceiptValidationError);

    expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
  });

  it("falls back to ILS currency when not provided", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      currency: "ILS",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
        },
        ACTOR_ID,
      ),
    );

    expect(prisma.receiptDocument.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { currency: string };
    };
    expect(createCall.data.currency).toBe("ILS");
  });

  it("falls back to vatRateBasisPoints 1800 when not provided", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: RECEIPT_ID,
      vatRateBasisPoints: 1800,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
        },
        ACTOR_ID,
      ),
    );

    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { vatRateBasisPoints: number };
    };
    expect(createCall.data.vatRateBasisPoints).toBe(1800);
  });

  it('falls back to language "he" when not provided', async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: RECEIPT_ID,
      language: "he",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
        },
        ACTOR_ID,
      ),
    );

    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { language: string };
    };
    expect(createCall.data.language).toBe("he");
  });

  it("auto-fills vatAmount from amountBeforeVat + vatRateBasisPoints when vatAmount is not provided", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
          amountBeforeVat: 10_000, // 100.00 ILS in minor units
          vatRateBasisPoints: 1800,
        },
        ACTOR_ID,
      ),
    );

    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: {
        amountBeforeVat: number;
        vatAmount: number;
        totalAmount: number;
        vatRateBasisPoints: number;
      };
    };
    // 10_000 * 1800 / 10_000 = 1_800
    expect(createCall.data.vatAmount).toBe(1_800);
    expect(createCall.data.totalAmount).toBe(11_800);
    expect(createCall.data.amountBeforeVat).toBe(10_000);
    expect(createCall.data.vatRateBasisPoints).toBe(1800);
  });

  it("writes an audit entry with action 'receipt.draft_created'", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      clientId: CLIENT_ID,
      status: "draft",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
        },
        ACTOR_ID,
      ),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditCall.data.action).toBe("receipt.draft_created");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
  });

  it("uses CompanySettings.defaultVatBasisPoints when provided", async () => {
    prisma.companySettings.findFirst.mockResolvedValueOnce({
      defaultVatBasisPoints: 1700, // hypothetical override
      defaultCurrency: "ILS",
      country: "IL",
    });
    prisma.receiptDocument.create.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      createReceiptDraft(
        tx,
        {
          type: "tax_invoice",
          clientId: CLIENT_ID,
          issueDate: new Date("2026-03-15"),
          descriptionLines: DESC_LINES,
        },
        ACTOR_ID,
      ),
    );

    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { vatRateBasisPoints: number };
    };
    expect(createCall.data.vatRateBasisPoints).toBe(1700);
  });
});

describe("updateReceiptDraft - state and merge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("rejects with ReceiptStateError on a finalized row", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      type: "tax_invoice",
      vatRateBasisPoints: 1800,
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        updateReceiptDraft(tx, RECEIPT_ID, { notes: "x" }, ACTOR_ID),
      ),
    ).rejects.toBeInstanceOf(ReceiptStateError);

    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("rejects with ReceiptStateError when the row does not exist", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce(null);

    await expect(
      prisma.$transaction((tx: Tx) =>
        updateReceiptDraft(tx, RECEIPT_ID, { notes: "x" }, ACTOR_ID),
      ),
    ).rejects.toBeInstanceOf(ReceiptStateError);
  });

  it("preserves untouched fields when only `notes` is patched", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      paymentId: null,
      issueDate: new Date("2026-03-15"),
      paymentDate: null,
      descriptionLines: DESC_LINES,
      amountBeforeVat: 10_000,
      vatRateBasisPoints: 1800,
      vatAmount: 1_800,
      totalAmount: 11_800,
      paymentMethod: null,
      reference: "ABC",
      currency: "ILS",
      exchangeRate: null,
      notes: "old notes",
      language: "he",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      notes: "new notes",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      updateReceiptDraft(tx, RECEIPT_ID, { notes: "new notes" }, ACTOR_ID),
    );

    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.receiptDocument.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    // Only `notes` should be in the diff/update payload.
    expect(updateCall.data.notes).toBe("new notes");
    expect("reference" in updateCall.data).toBe(false);
    expect("descriptionLines" in updateCall.data).toBe(false);
    expect("amountBeforeVat" in updateCall.data).toBe(false);
    expect("vatAmount" in updateCall.data).toBe(false);
    expect("totalAmount" in updateCall.data).toBe(false);
  });

  it("writes an audit entry with action 'receipt.draft_updated'", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      vatRateBasisPoints: 1800,
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      notes: "old",
      descriptionLines: DESC_LINES,
      currency: "ILS",
      exchangeRate: null,
      language: "he",
      paymentMethod: null,
      reference: null,
      paymentDate: null,
      issueDate: new Date("2026-03-15"),
      paymentId: null,
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      updateReceiptDraft(tx, RECEIPT_ID, { notes: "new" }, ACTOR_ID),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditCall.data.action).toBe("receipt.draft_updated");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
  });
});

describe("deleteReceiptDraft - state and audit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("rejects with ReceiptStateError on a finalized row", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      type: "tax_invoice",
      clientId: CLIENT_ID,
    });

    await expect(
      prisma.$transaction((tx: Tx) =>
        deleteReceiptDraft(tx, RECEIPT_ID, ACTOR_ID),
      ),
    ).rejects.toBeInstanceOf(ReceiptStateError);

    expect(prisma.receiptDocument.delete).not.toHaveBeenCalled();
  });

  it("rejects with ReceiptStateError when the row does not exist", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce(null);

    await expect(
      prisma.$transaction((tx: Tx) =>
        deleteReceiptDraft(tx, RECEIPT_ID, ACTOR_ID),
      ),
    ).rejects.toBeInstanceOf(ReceiptStateError);
  });

  it("deletes a draft and writes an audit entry with action 'receipt.draft_deleted'", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      clientId: CLIENT_ID,
    });
    prisma.receiptDocument.delete.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction((tx: Tx) =>
      deleteReceiptDraft(tx, RECEIPT_ID, ACTOR_ID),
    );

    expect(prisma.receiptDocument.delete).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditCall.data.action).toBe("receipt.draft_deleted");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
  });
});
