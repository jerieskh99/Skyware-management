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

describe("POST /api/cron/client-health — feature flag off", () => {
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

  it("returns zeros without touching the snapshot table when the flag is off", async () => {
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: false });

    const { POST } = await import("@/app/api/cron/client-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; written: number; skipped: number };
    };
    expect(body.summary).toEqual({ scanned: 0, written: 0, skipped: 0 });

    // Writer must short-circuit before reading clients or writing snapshots.
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.clientHealthSnapshot.upsert).not.toHaveBeenCalled();
  });
});
