import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/allocation/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-000000000a01";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}/allocation`;
// In the JAN-2026 schedule window (10K pre-VAT threshold).
const ISSUE_DATE_FEB_2026 = new Date("2026-02-15T00:00:00Z");
// In the JUN-2026 schedule window (5K pre-VAT threshold).
const ISSUE_DATE_JUL_2026 = new Date("2026-07-15T00:00:00Z");

function makeRequest() {
  return new Request(URL, { method: "POST" });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("POST /api/receipts/[id]/allocation - country profile threshold", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.companySettings.findFirst.mockResolvedValue({ country: "IL" });
  });

  it("returns not_required for tax_invoice with pre-VAT just under 10,000 ILS", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: ISSUE_DATE_FEB_2026,
      amountBeforeVat: 999_999, // 9,999.99 ILS pre-VAT.
      allocationStatus: "not_required",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("not_required");
    // No transition (already not_required) so no update / no audit row.
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns pending for tax_invoice with pre-VAT exactly 10,000 ILS", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice",
      issueDate: ISSUE_DATE_FEB_2026,
      amountBeforeVat: 1_000_000, // exactly 10,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      allocationStatus: "pending",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-a1" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.receiptDocument.update.mock.calls[0]?.[0] as {
      data: { allocationStatus: string };
    };
    expect(updateCall.data.allocationStatus).toBe("pending");
  });

  it("always returns not_required for proforma_invoice even above 10K", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "proforma_invoice",
      issueDate: ISSUE_DATE_FEB_2026,
      amountBeforeVat: 5_000_000, // 50,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("not_required");
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("returns pending for tax_invoice_receipt with pre-VAT 5,000 ILS after 2026-06-01", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice_receipt",
      issueDate: ISSUE_DATE_JUL_2026,
      amountBeforeVat: 500_000, // exactly 5,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      allocationStatus: "pending",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-a2" });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");
  });

  it("returns not_required for tax_invoice_receipt with pre-VAT 4,999 ILS after 2026-06-01", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      type: "tax_invoice_receipt",
      issueDate: ISSUE_DATE_JUL_2026,
      amountBeforeVat: 499_999, // just under 5,000 ILS pre-VAT.
      allocationStatus: "not_required",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("not_required");
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });
});
