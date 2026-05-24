import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/cron/sla-breach";

function makeRequest() {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer s3cret" },
  });
}

describe("POST /api/cron/sla-breach — breach writer", () => {
  const originalSecret = process.env["CRON_SECRET"];

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "s3cret";
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env["CRON_SECRET"];
    } else {
      process.env["CRON_SECRET"] = originalSecret;
    }
  });

  it("no-op when notifications_enabled is off", async () => {
    prisma.featureFlag.findMany.mockResolvedValueOnce([
      { key: "notifications_enabled", enabled: false },
      { key: "sla_breach_automation_enabled", enabled: true },
    ]);
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; notified: number } };
    expect(body.summary).toEqual({ scanned: 0, notified: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("no-op when sla_breach_automation_enabled is off", async () => {
    prisma.featureFlag.findMany.mockResolvedValueOnce([
      { key: "notifications_enabled", enabled: true },
      { key: "sla_breach_automation_enabled", enabled: false },
    ]);
    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; notified: number } };
    expect(body.summary).toEqual({ scanned: 0, notified: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("writes one notification per breached candidate when both flags are on", async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: "notifications_enabled", enabled: true },
      { key: "sla_breach_automation_enabled", enabled: true },
    ]);

    // First scan: two breached candidates.
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: "job-1",
        publicNumber: "SKY-001",
        assignedEmployeeId: "u-alpha",
        slaTargetMinutes: 60,
        breachMinutes: 90,
      },
      {
        id: "job-2",
        publicNumber: "SKY-002",
        assignedEmployeeId: "u-beta",
        slaTargetMinutes: 120,
        breachMinutes: 180,
      },
    ]);
    // notifySlaBreached re-reads the flag through getFeatureFlag.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.notification.create.mockResolvedValue({ id: "n-x" });

    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; notified: number } };
    expect(body.summary).toEqual({ scanned: 2, notified: 2 });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);

    const calls = prisma.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { userId: string; kind: string; payload: { jobId: string } } }).data
    );
    expect(calls.find((d) => d.userId === "u-alpha" && d.payload.jobId === "job-1")).toBeDefined();
    expect(calls.find((d) => d.userId === "u-beta" && d.payload.jobId === "job-2")).toBeDefined();
    for (const d of calls) expect(d.kind).toBe("sla_breached");
  });

  it("does not re-notify on a second run when the de-dup query returns no rows", async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: "notifications_enabled", enabled: true },
      { key: "sla_breach_automation_enabled", enabled: true },
    ]);
    // Second-run scan: NOT EXISTS subquery filters out previously-notified jobs.
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/cron/sla-breach/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; notified: number } };
    expect(body.summary).toEqual({ scanned: 0, notified: 0 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
