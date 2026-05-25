import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/billing/payments/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const PAYMENT_ID = "00000000-0000-0000-0000-000000000001";
const URL = `http://localhost/api/billing/payments/${PAYMENT_ID}`;

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: PAYMENT_ID }) };
}

describe("PATCH /api/billing/payments/[id] status transition matrix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
  });

  it("rejects draft -> paid with 422", async () => {
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "draft",
      clientId: "client-1",
    });

    const res = await PATCH(
      makeRequest({ status: "paid", paidDate: "2026-05-24" }),
      makeParams(),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("draft");
    expect(body.error).toContain("paid");
    // Update must NOT run on an illegal transition.
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("accepts draft -> sent_to_client with 200", async () => {
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "draft",
      clientId: "client-1",
    });
    prisma.payment.update.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "sent_to_client",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      makeRequest({ status: "sent_to_client" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("sent_to_client");
    expect(prisma.payment.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects paid -> draft with 422 (paid is terminal)", async () => {
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "paid",
      clientId: "client-1",
    });

    const res = await PATCH(
      makeRequest({ status: "draft" }),
      makeParams(),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("paid");
    expect(body.error).toContain("draft");
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
