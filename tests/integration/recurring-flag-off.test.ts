import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/cron/recurring-jobs";

function makeRequest() {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer s3cret" },
  });
}

describe("POST /api/cron/recurring-jobs — flag off", () => {
  const originalSecret = process.env["CRON_SECRET"];

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "s3cret";
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env["CRON_SECRET"];
    else process.env["CRON_SECRET"] = originalSecret;
  });

  it("no-op when recurring_jobs_enabled is off", async () => {
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: false });

    const { POST } = await import("@/app/api/cron/recurring-jobs/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; generated: number; skipped: number } };
    expect(body.summary).toEqual({ scanned: 0, generated: 0, skipped: 0 });

    expect(prisma.recurringJobTemplate.findMany).not.toHaveBeenCalled();
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});
