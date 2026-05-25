import { describe, it, expect, beforeEach, vi } from "vitest";
import { DELETE } from "@/app/api/receipts/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-0000000000e1";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}`;

function makeRequest() {
  return new Request(URL, { method: "DELETE" });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("DELETE /api/receipts/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 204 when a draft is deleted", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
      type: "tax_invoice",
      clientId: "00000000-0000-0000-0000-000000000001",
    });
    prisma.receiptDocument.delete.mockResolvedValueOnce({ id: RECEIPT_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(204);
  });

  it("returns 422 when the row is finalized", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
      type: "tax_invoice",
      clientId: "00000000-0000-0000-0000-000000000001",
    });

    const res = await DELETE(makeRequest(), makeParams());
    expect(res.status).toBe(422);
    expect(prisma.receiptDocument.delete).not.toHaveBeenCalled();
  });
});
