import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/credit-note/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const SOURCE_ID = "00000000-0000-0000-0000-000000000e01";
const CREDIT_ID = "00000000-0000-0000-0000-000000000e02";
const URL = `http://localhost/api/receipts/${SOURCE_ID}/credit-note`;

function makeRequest() {
  return new Request(URL, { method: "POST" });
}

function makeParams() {
  return { params: Promise.resolve({ id: SOURCE_ID }) };
}

describe("POST /api/receipts/[id]/credit-note", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("issues a credit note linked to the source and writes an audit row", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: SOURCE_ID,
      type: "tax_invoice",
      status: "finalized",
      clientId: "client-1",
      paymentId: null,
      descriptionLines: [{ description: "consulting", subtotal: 10000 }],
      amountBeforeVat: 10_000,
      vatRateBasisPoints: 1800,
      vatAmount: 1_800,
      totalAmount: 11_800,
      currency: "ILS",
      language: "he",
    });
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: CREDIT_ID,
      type: "credit_note",
      status: "draft",
      clientId: "client-1",
      creditedReceiptId: SOURCE_ID,
      amountBeforeVat: -10_000,
      vatAmount: -1_800,
      totalAmount: -11_800,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-c1" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      type: string;
      creditedReceiptId: string;
      totalAmount: number;
    };
    expect(body.id).toBe(CREDIT_ID);
    expect(body.type).toBe("credit_note");
    expect(body.creditedReceiptId).toBe(SOURCE_ID);
    expect(body.totalAmount).toBe(-11_800);

    expect(prisma.receiptDocument.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: {
        type: string;
        creditedReceiptId: string;
        amountBeforeVat: number;
        vatAmount: number;
        totalAmount: number;
      };
    };
    expect(createCall.data.type).toBe("credit_note");
    expect(createCall.data.creditedReceiptId).toBe(SOURCE_ID);
    expect(createCall.data.amountBeforeVat).toBe(-10_000);
    expect(createCall.data.vatAmount).toBe(-1_800);
    expect(createCall.data.totalAmount).toBe(-11_800);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("receipt.credit_note_issued");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
    expect(auditCall.data.entityId).toBe(CREDIT_ID);
  });

  it("returns 422 when the source is not finalized", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: SOURCE_ID,
      type: "invoice",
      status: "draft",
      clientId: "client-1",
      paymentId: null,
      descriptionLines: [],
      amountBeforeVat: 1000,
      vatRateBasisPoints: 1800,
      vatAmount: 180,
      totalAmount: 1180,
      currency: "ILS",
      language: "he",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(422);
    expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
  });
});
