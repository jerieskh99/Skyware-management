import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/billing/payments/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

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

describe("PATCH /api/billing/payments/[id] (mark paid)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 for an employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));

    const res = await PATCH(
      makeRequest({ status: "paid", paidDate: "2026-05-24" }),
      makeParams()
    );

    expect(res.status).toBe(403);
    // The admin gate should fire before any DB lookup.
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 for an admin marking a payment as paid", async () => {
    mockAuthAs(makeAdminSession());

    prisma.payment.findUnique.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "waiting_for_payment",
      clientId: "client-1",
    });
    prisma.payment.update.mockResolvedValueOnce({
      id: PAYMENT_ID,
      status: "paid",
      paidDate: new Date("2026-05-24"),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      makeRequest({ status: "paid", paidDate: "2026-05-24" }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe(PAYMENT_ID);
    expect(body.status).toBe("paid");

    expect(prisma.payment.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("payment.updated");
    expect(auditCall.data.entityType).toBe("Payment");
    expect(auditCall.data.entityId).toBe(PAYMENT_ID);
  });
});
