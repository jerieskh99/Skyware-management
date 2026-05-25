import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/finalize/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-000000000c01";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}/finalize`;

function makeRequest() {
  return new Request(URL, { method: "POST" });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("POST /api/receipts/[id]/finalize - feature flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 for a non-admin employee (flag never read)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
    expect(prisma.receiptDocument.findUnique).not.toHaveBeenCalled();
  });

  it("returns 503 for an admin when receipt_finalize_enabled is false", async () => {
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: false });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Receipts finalization is disabled");
    expect(prisma.receiptDocument.findUnique).not.toHaveBeenCalled();
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
  });

  it("proceeds past the flag check for an admin when the flag is true", async () => {
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });

    // The domain will try to load the row; return a draft that satisfies
    // the invariants so the route can finalize successfully.
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
    prisma.receiptDocumentSequence.upsert.mockResolvedValueOnce({
      id: "seq-1",
      type: "invoice",
      year: 2026,
      nextNumber: 2,
    });
    // Wave 2A-PDF: finalize composes a snapshot from the singleton
    // CompanySettings row before writing the update.
    prisma.companySettings.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000001",
      legalNameEn: "TEST Skyware IT LTD",
      legalNameHe: "TEST סקייוור איי טי בע\"מ",
      companyNumber: "TEST-000000000",
      vatNumber: "TEST-000000000",
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      documentNumber: 1,
      documentNumberYear: 2026,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
  });
});
