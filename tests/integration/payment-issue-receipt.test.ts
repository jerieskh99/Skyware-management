import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/payments/[id]/issue-receipt/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const PAYMENT_ID = "00000000-0000-0000-0000-000000000a01";
const NEW_RECEIPT_ID = "00000000-0000-0000-0000-000000000a02";
const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const URL = `http://localhost/api/payments/${PAYMENT_ID}/issue-receipt`;

function makeRequest() {
  return new Request(URL, { method: "POST" });
}

function makeParams() {
  return { params: Promise.resolve({ id: PAYMENT_ID }) };
}

const PAID_PAYMENT = {
  id: PAYMENT_ID,
  clientId: CLIENT_ID,
  amountBeforeVat: 10_000,
  vatAmount: 1_800,
  totalAmount: 11_800,
  amountPlaceholder: null,
  vatRateBasisPoints: 1800,
  currency: "ILS" as const,
  currencyExchangeRate: null,
  paidDate: new Date("2026-03-20"),
  status: "paid",
  linkedReceiptId: null as string | null,
  method: null,
  reference: null,
  notes: null,
  sourceType: "one_time",
  sourceMonthly: null,
  sourceHourly: null,
};

describe("POST /api/payments/[id]/issue-receipt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the payment does not exist", async () => {
    mockAuthAs(makeAdminSession());
    prisma.payment.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 201 and creates a draft tax_invoice_receipt for a paid payment", async () => {
    mockAuthAs(makeAdminSession());
    prisma.payment.findUnique.mockResolvedValueOnce(PAID_PAYMENT);
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: NEW_RECEIPT_ID,
      type: "tax_invoice_receipt",
      status: "draft",
      paymentId: PAYMENT_ID,
      clientId: CLIENT_ID,
    });
    prisma.payment.update.mockResolvedValueOnce({
      id: PAYMENT_ID,
      linkedReceiptId: NEW_RECEIPT_ID,
    });
    prisma.auditLog.create.mockResolvedValue({ id: "audit" });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(NEW_RECEIPT_ID);

    expect(prisma.receiptDocument.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { type: string };
    };
    expect(createCall.data.type).toBe("tax_invoice_receipt");

    expect(prisma.payment.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.payment.update.mock.calls[0]?.[0] as {
      data: { linkedReceiptId: string };
    };
    expect(updateCall.data.linkedReceiptId).toBe(NEW_RECEIPT_ID);

    // Two audit calls expected: receipt.draft_created (from createReceiptDraft)
    // and payment.receipt_issued (from the route handler).
    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(auditActions).toContain("payment.receipt_issued");
    expect(auditActions).toContain("receipt.draft_created");
  });

  it("is idempotent when the payment already has a non-cancelled linkedReceipt", async () => {
    mockAuthAs(makeAdminSession());
    prisma.payment.findUnique.mockResolvedValueOnce({
      ...PAID_PAYMENT,
      linkedReceiptId: NEW_RECEIPT_ID,
    });
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: NEW_RECEIPT_ID,
      status: "draft",
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { existing: boolean; id: string };
    expect(body.existing).toBe(true);
    expect(body.id).toBe(NEW_RECEIPT_ID);
    expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
