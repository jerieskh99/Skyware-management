import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/cancel/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const RECEIPT_ID = "00000000-0000-0000-0000-000000000d01";
const URL = `http://localhost/api/receipts/${RECEIPT_ID}/cancel`;

function makeRequest(body?: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : null,
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("POST /api/receipts/[id]/cancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("returns 422 when attempting to cancel a finalized receipt", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "finalized",
    });

    const res = await POST(makeRequest({ reason: "oops" }), makeParams());

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/credit note/i);
    expect(prisma.receiptDocument.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 when cancelling a draft", async () => {
    prisma.receiptDocument.findUnique.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "draft",
    });
    prisma.receiptDocument.update.mockResolvedValueOnce({
      id: RECEIPT_ID,
      status: "cancelled",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(makeRequest({ reason: "duplicate" }), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe(RECEIPT_ID);
    expect(body.status).toBe("cancelled");

    expect(prisma.receiptDocument.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.receiptDocument.update.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateCall.data.status).toBe("cancelled");

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditCall.data.action).toBe("receipt.cancelled");
    expect(auditCall.data.entityType).toBe("ReceiptDocument");
  });
});
