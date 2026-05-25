import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/receipts/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-0000000000d1";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}`;

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("PATCH /api/receipts/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await PATCH(makeRequest({ notes: "x" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await PATCH(makeRequest({ notes: "x" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 200 on a successful draft update", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      vatRateBasisPoints: 1800,
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      notes: "old",
      descriptionLines: [],
      currency: "ILS",
      exchangeRate: null,
      language: "he",
      paymentMethod: null,
      reference: null,
      paymentDate: null,
      issueDate: new Date("2026-03-15"),
      paymentId: null,
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      notes: "new",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(makeRequest({ notes: "new" }), makeParams());
    expect(res.status).toBe(200);
  });

  it("returns 422 when the row is finalized", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      type: "tax_invoice",
      vatRateBasisPoints: 1800,
    });

    const res = await PATCH(makeRequest({ notes: "x" }), makeParams());
    expect(res.status).toBe(422);
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("merges patches field-by-field (passing only `notes` leaves others intact)", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      vatRateBasisPoints: 1800,
      amountBeforeVat: 10_000,
      vatAmount: 1_800,
      totalAmount: 11_800,
      notes: "old",
      descriptionLines: [],
      currency: "ILS",
      exchangeRate: null,
      language: "he",
      paymentMethod: null,
      reference: "REF-1",
      paymentDate: null,
      issueDate: new Date("2026-03-15"),
      paymentId: null,
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await PATCH(makeRequest({ notes: "new" }), makeParams());

    const updateCall = prisma.receiptDocument.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data.notes).toBe("new");
    expect("reference" in updateCall.data).toBe(false);
    expect("descriptionLines" in updateCall.data).toBe(false);
    expect("amountBeforeVat" in updateCall.data).toBe(false);
  });
});
