import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/credit-note/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const SOURCE_ID = "00000000-0000-0000-0000-000000000f01";
const CREDIT_ID = "00000000-0000-0000-0000-000000000f02";
const URL = `http://localhost/api/receipts/${SOURCE_ID}/credit-note`;

function makeRequest() {
  return new Request(URL, { method: "POST" });
}

function makeParams() {
  return { params: Promise.resolve({ id: SOURCE_ID }) };
}

describe("POST /api/receipts/[id]/credit-note - FX copy from source", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("copies BOTH currency and exchangeRate from a non-ILS source row", async () => {
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
      currency: "USD",
      exchangeRate: "3.700000",
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
      currency: "USD",
      exchangeRate: "3.700000",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-fx-1" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(201);

    expect(prisma.receiptDocument.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: {
        currency: string;
        exchangeRate: string | null;
        creditedReceiptId: string;
        type: string;
      };
    };
    // Both currency AND exchangeRate must propagate to the credit note so the
    // finalize-time `receipt_finalized_exchange_rate_chk` constraint passes.
    expect(createCall.data.currency).toBe("USD");
    expect(createCall.data.exchangeRate).toBe("3.700000");
    expect(createCall.data.type).toBe("credit_note");
    expect(createCall.data.creditedReceiptId).toBe(SOURCE_ID);
  });

  it("passes exchangeRate=null through for an ILS source row", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: SOURCE_ID,
      type: "tax_invoice",
      status: "finalized",
      clientId: "client-1",
      paymentId: null,
      descriptionLines: [],
      amountBeforeVat: 5_000,
      vatRateBasisPoints: 1800,
      vatAmount: 900,
      totalAmount: 5_900,
      currency: "ILS",
      exchangeRate: null,
      language: "he",
    });
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: CREDIT_ID,
      type: "credit_note",
      status: "draft",
      currency: "ILS",
      exchangeRate: null,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-fx-2" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(201);
    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { currency: string; exchangeRate: string | null };
    };
    expect(createCall.data.currency).toBe("ILS");
    expect(createCall.data.exchangeRate).toBeNull();
  });
});
