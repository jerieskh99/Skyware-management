import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/billing/reminders/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * GET /api/billing/reminders — admin list of payment reminders.
 * Auth (401), admin gate (403), feature-flag gate (404 when
 * `billing_reminders_enabled` is off), and the 200 response shape.
 */

const URL_BASE = "http://localhost/api/billing/reminders";

function makeRequest(qs = "") {
  return new Request(`${URL_BASE}${qs}`, { method: "GET" });
}

/** Mock getFeatureFlag's underlying findUnique by key. */
function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

describe("GET /api/billing/reminders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    // Flag is never consulted once the admin gate fails.
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when billing_reminders_enabled is off", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ billing_reminders_enabled: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the list shape for an admin when the flag is on", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ billing_reminders_enabled: true });

    prisma.paymentReminder.findMany.mockResolvedValueOnce([
      {
        id: "rem-1",
        status: "admin_notified",
        scheduledFor: new Date("2026-05-01T00:00:00Z"),
        adminNotifiedAt: new Date("2026-05-01T01:00:00Z"),
        decidedAt: null,
        sentAt: null,
        failureReason: null,
        payment: {
          id: "pay-1",
          reference: "INV-42",
          dueDate: new Date("2026-04-01T00:00:00Z"),
          amountPlaceholder: null,
          totalAmount: 120000,
          currency: "ILS",
          latenessAmount: 7,
          latenessUnit: "days",
          latenessNotifyAdminFirst: true,
          autoSendAfterMinutes: null,
          client: { id: "cli-1", companyName: "Acme" },
        },
      },
    ]);
    prisma.paymentReminder.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reminders: Array<{
        id: string;
        status: string;
        payment: { id: string; amount: number; currency: string };
        client: { id: string; companyName: string };
      }>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
    expect(body.reminders).toHaveLength(1);
    const r = body.reminders[0]!;
    expect(r.id).toBe("rem-1");
    expect(r.status).toBe("admin_notified");
    // amount prefers totalAmount over amountPlaceholder.
    expect(r.payment.amount).toBe(120000);
    expect(r.payment.currency).toBe("ILS");
    expect(r.client).toEqual({ id: "cli-1", companyName: "Acme" });
  });

  it("passes status + clientId filters into the where clause", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ billing_reminders_enabled: true });
    prisma.paymentReminder.findMany.mockResolvedValueOnce([]);
    prisma.paymentReminder.count.mockResolvedValueOnce(0);

    const clientId = "00000000-0000-0000-0000-0000000000c1";
    await GET(makeRequest(`?status=sent&clientId=${clientId}`));

    const findCall = prisma.paymentReminder.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findCall.where).toMatchObject({
      status: "sent",
      payment: { clientId },
    });
  });

  it("returns 400 on an invalid status filter", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ billing_reminders_enabled: true });
    const res = await GET(makeRequest("?status=NOPE"));
    expect(res.status).toBe(400);
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });
});
