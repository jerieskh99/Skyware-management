import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/cron/client-health";

function makeRequest() {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer s3cret" },
  });
}

describe("POST /api/cron/client-health — writer", () => {
  const originalSecret = process.env["CRON_SECRET"];

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "s3cret";
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
    // Flag on by default for these tests.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    // Default empty bank set so the bank-burn branch is a no-op.
    prisma.hourlyBank.findMany.mockResolvedValue([]);
    prisma.hourlyBankUsage.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env["CRON_SECRET"];
    } else {
      process.env["CRON_SECRET"] = originalSecret;
    }
  });

  it("writes one snapshot row per active client", async () => {
    prisma.client.findMany.mockResolvedValueOnce([
      { id: "client-a" },
      { id: "client-b" },
    ]);
    // computeSnapshotFor uses $transaction([...]) with [count, raw, raw, raw, findMany].
    // Mock $transaction to dispatch to the underlying mocks (array form already does
    // this), so we only need to feed the per-call results.
    prisma.job.count.mockResolvedValue(3);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ delayed_count: BigInt(1) }])
      .mockResolvedValueOnce([{ hours_total: 4.5 }])
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([{ delayed_count: BigInt(0) }])
      .mockResolvedValueOnce([{ hours_total: 0 }])
      .mockResolvedValueOnce([{ total: BigInt(12345) }]);
    prisma.clientHealthSnapshot.upsert.mockResolvedValue({ id: "snap-1" });

    const { POST } = await import("@/app/api/cron/client-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; written: number; skipped: number };
    };
    expect(body.summary).toEqual({ scanned: 2, written: 2, skipped: 0 });
    expect(prisma.clientHealthSnapshot.upsert).toHaveBeenCalledTimes(2);

    const args = prisma.clientHealthSnapshot.upsert.mock.calls.map((c) => c[0]) as Array<{
      where: { client_period_unique: { clientId: string; periodStart: Date } };
      create: { clientId: string; openJobs: number };
    }>;
    expect(args.find((a) => a.create.clientId === "client-a")).toBeDefined();
    expect(args.find((a) => a.create.clientId === "client-b")).toBeDefined();
  });

  it("re-running the same week does not insert duplicates (upsert by client_period_unique)", async () => {
    prisma.client.findMany.mockResolvedValue([{ id: "client-a" }]);
    prisma.job.count.mockResolvedValue(0);
    prisma.$queryRaw
      // First run: delayed, hours, outstanding.
      .mockResolvedValueOnce([{ delayed_count: BigInt(0) }])
      .mockResolvedValueOnce([{ hours_total: 0 }])
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      // Second run: same shape.
      .mockResolvedValueOnce([{ delayed_count: BigInt(0) }])
      .mockResolvedValueOnce([{ hours_total: 0 }])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    prisma.clientHealthSnapshot.upsert.mockResolvedValue({ id: "snap-1" });

    const { POST } = await import("@/app/api/cron/client-health/route");
    await POST(makeRequest());
    await POST(makeRequest());

    // Both runs call upsert; uniqueness is enforced at the DB layer (we cannot
    // exercise the constraint here), but the where clause must always be
    // `client_period_unique` so re-runs target the same row.
    expect(prisma.clientHealthSnapshot.upsert).toHaveBeenCalledTimes(2);
    for (const call of prisma.clientHealthSnapshot.upsert.mock.calls) {
      const arg = call[0] as { where: Record<string, unknown> };
      expect(arg.where).toHaveProperty("client_period_unique");
    }
    // No `create` ever called directly.
    expect(prisma.clientHealthSnapshot.create).not.toHaveBeenCalled();
  });

  it("skips clients whose compute throws but continues the rest", async () => {
    prisma.client.findMany.mockResolvedValueOnce([
      { id: "client-a" },
      { id: "client-b" },
    ]);
    prisma.job.count.mockResolvedValue(0);
    // computeSnapshotFor invokes $queryRaw 3 times per client (delayed,
    // hours, outstanding). Six calls total when running two clients.
    prisma.$queryRaw
      // Client-a: first call rejects → tx rejects → caught → skipped.
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ hours_total: 0 }])
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      // Client-b: all three succeed.
      .mockResolvedValueOnce([{ delayed_count: BigInt(0) }])
      .mockResolvedValueOnce([{ hours_total: 0 }])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    prisma.clientHealthSnapshot.upsert.mockResolvedValue({ id: "snap-1" });

    const { POST } = await import("@/app/api/cron/client-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; written: number; skipped: number };
    };
    expect(body.summary.scanned).toBe(2);
    expect(body.summary.written).toBe(1);
    expect(body.summary.skipped).toBe(1);
  });
});
