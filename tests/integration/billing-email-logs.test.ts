import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/billing/email-logs/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * GET /api/billing/email-logs — admin email history for a client or payment.
 * Requires `clientId` OR `paymentId` (400 without). Admin-only. Returns shape.
 * No feature-flag gate (read-only audit view).
 */

const URL_BASE = "http://localhost/api/billing/email-logs";

function makeRequest(qs = "") {
  return new Request(`${URL_BASE}${qs}`, { method: "GET" });
}

const CLIENT_ID = "00000000-0000-0000-0000-0000000000c1";
const PAYMENT_ID = "00000000-0000-0000-0000-00000000ad01";

describe("GET /api/billing/email-logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest(`?clientId=${CLIENT_ID}`));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await GET(makeRequest(`?clientId=${CLIENT_ID}`));
    expect(res.status).toBe(403);
  });

  it("returns 400 when neither clientId nor paymentId is given", async () => {
    mockAuthAs(makeAdminSession());
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    expect(prisma.emailLog.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the logs shape when filtered by clientId", async () => {
    mockAuthAs(makeAdminSession());
    prisma.emailLog.findMany.mockResolvedValueOnce([
      {
        id: "log-1",
        kind: "manual_contact",
        status: "queued",
        testMode: true,
        toEmail: "billing@acme.example",
        subject: "Hello",
        language: "en",
        createdAt: new Date("2026-05-10T00:00:00Z"),
      },
    ]);
    prisma.emailLog.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest(`?clientId=${CLIENT_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Array<{ id: string; testMode: boolean; kind: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.logs[0]!.id).toBe("log-1");
    expect(body.logs[0]!.testMode).toBe(true);

    const findArg = prisma.emailLog.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findArg.where).toMatchObject({ clientId: CLIENT_ID });
  });

  it("filters by paymentId when provided", async () => {
    mockAuthAs(makeAdminSession());
    prisma.emailLog.findMany.mockResolvedValueOnce([]);
    prisma.emailLog.count.mockResolvedValueOnce(0);

    await GET(makeRequest(`?paymentId=${PAYMENT_ID}`));
    const findArg = prisma.emailLog.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findArg.where).toMatchObject({ paymentId: PAYMENT_ID });
  });
});
