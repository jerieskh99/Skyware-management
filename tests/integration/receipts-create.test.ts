import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const URL_BASE = "http://localhost/api/receipts";
const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const NEW_RECEIPT_ID = "00000000-0000-0000-0000-000000000abc";

const VALID_BODY = {
  type: "tax_invoice",
  clientId: CLIENT_ID,
  issueDate: "2026-03-15",
  descriptionLines: [
    {
      description: "Consulting",
      quantity: 1,
      unitPrice: 10_000,
      lineTotal: 10_000,
    },
  ],
};

function makeRequest(body: unknown) {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/receipts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 when descriptionLines is empty", async () => {
    mockAuthAs(makeAdminSession());
    const res = await POST(
      makeRequest({ ...VALID_BODY, descriptionLines: [] }),
    );
    expect(res.status).toBe(400);
    expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
  });

  it("returns 201 with the created row and writes an audit entry", async () => {
    mockAuthAs(makeAdminSession());
    prisma.client.findUnique.mockResolvedValueOnce({ id: CLIENT_ID });
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({
      id: NEW_RECEIPT_ID,
      type: "tax_invoice",
      status: "draft",
      clientId: CLIENT_ID,
      currency: "ILS",
      vatRateBasisPoints: 1800,
      language: "he",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(NEW_RECEIPT_ID);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("receipt.draft_created");
  });

  it("applies defaults (currency=ILS, vatRateBasisPoints=1800, language=he) when not provided", async () => {
    mockAuthAs(makeAdminSession());
    prisma.client.findUnique.mockResolvedValueOnce({ id: CLIENT_ID });
    prisma.companySettings.findFirst.mockResolvedValueOnce(null);
    prisma.receiptDocument.create.mockResolvedValueOnce({ id: NEW_RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await POST(makeRequest(VALID_BODY));

    const createCall = prisma.receiptDocument.create.mock.calls[0]?.[0] as {
      data: { currency: string; vatRateBasisPoints: number; language: string };
    };
    expect(createCall.data.currency).toBe("ILS");
    expect(createCall.data.vatRateBasisPoints).toBe(1800);
    expect(createCall.data.language).toBe("he");
  });

  it("returns 400 when the referenced client does not exist", async () => {
    mockAuthAs(makeAdminSession());
    prisma.client.findUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(prisma.receiptDocument.create).not.toHaveBeenCalled();
  });
});
