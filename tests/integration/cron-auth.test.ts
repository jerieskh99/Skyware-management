import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/cron/sla-breach";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("POST /api/cron/sla-breach — auth gate", () => {
  const originalSecret = process.env["CRON_SECRET"];

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(null);
    process.env["CRON_SECRET"] = "test-secret";
    // Default: flags off so the breach scanner short-circuits to {scanned:0,notified:0}.
    prisma.featureFlag.findMany.mockResolvedValue([]);
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env["CRON_SECRET"];
    } else {
      process.env["CRON_SECRET"] = originalSecret;
    }
  });

  it("rejects 401 when no bearer header and no session", async () => {
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects 401 when the bearer secret is wrong", async () => {
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
  });

  it("rejects 401 when the session is an employee, not admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("accepts 200 when the bearer secret matches", async () => {
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; summary: { scanned: number; notified: number } };
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual({ scanned: 0, notified: 0 });
  });

  it("accepts 200 when the caller is an admin session", async () => {
    mockAuthAs(makeAdminSession());
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("denies bearer path when CRON_SECRET is unset", async () => {
    delete process.env["CRON_SECRET"];
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(401);
  });
});
