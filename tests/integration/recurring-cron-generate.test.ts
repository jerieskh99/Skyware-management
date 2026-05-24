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

interface FlagRow { key: string; enabled: boolean }
function setFlag(rows: FlagRow[]) {
  for (const r of rows) {
    prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { key?: string } } | undefined)?.where;
      if (!where?.key) return null;
      const match = rows.find((row) => row.key === where.key);
      return match ? { enabled: match.enabled } : null;
    });
  }
}

describe("POST /api/cron/recurring-jobs — generator", () => {
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

  it("creates one job per due template, updates the template, writes audit", async () => {
    setFlag([{ key: "recurring_jobs_enabled", enabled: true }]);
    prisma.slaDefaults.findMany.mockResolvedValueOnce([
      { priority: "normal", targetMinutes: 240 },
    ]);

    const due = {
      id: "tpl-1",
      name: "Weekly check",
      titleTemplate: "Weekly check {{date}}",
      description: null,
      departmentId: "dept-helpdesk",
      clientId: null,
      priority: "normal" as const,
      severity: "moderate" as const,
      defaultAssigneeId: null,
      cadence: "weekly" as const,
      anchor: { dayOfWeek: 1, minuteOfDay: 9 * 60 },
      timezone: "Asia/Jerusalem",
      nextRunAt: new Date("2026-05-23T06:00:00Z"),
      lastGeneratedAt: null,
      generatedCount: 0,
      status: "active" as const,
      createdByUserId: "admin-1",
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.recurringJobTemplate.findMany.mockResolvedValueOnce([due]);
    prisma.job.findFirst.mockResolvedValueOnce(null);
    prisma.job.create.mockResolvedValueOnce({
      id: "job-new",
      publicNumber: "2026-0001",
      title: "Weekly check 2026-05-24",
    });
    prisma.jobStatusEvent.create.mockResolvedValueOnce({ id: "evt-1" });
    prisma.recurringJobTemplate.update.mockResolvedValueOnce({ ...due, generatedCount: 1 });

    const { POST } = await import("@/app/api/cron/recurring-jobs/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; generated: number; skipped: number } };
    expect(body.summary).toEqual({ scanned: 1, generated: 1, skipped: 0 });

    expect(prisma.job.create).toHaveBeenCalledTimes(1);
    const jobArg = prisma.job.create.mock.calls[0]?.[0] as { data: { recurringTemplateId: string; departmentId: string; status: string; slaTargetMinutes: number } };
    expect(jobArg.data.recurringTemplateId).toBe("tpl-1");
    expect(jobArg.data.departmentId).toBe("dept-helpdesk");
    expect(jobArg.data.status).toBe("new");
    expect(jobArg.data.slaTargetMinutes).toBeGreaterThan(0);

    expect(prisma.recurringJobTemplate.update).toHaveBeenCalledTimes(1);
    const updArg = prisma.recurringJobTemplate.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { lastGeneratedAt: Date; generatedCount: { increment: number }; nextRunAt: Date };
    };
    expect(updArg.where.id).toBe("tpl-1");
    expect(updArg.data.generatedCount).toEqual({ increment: 1 });
    expect(updArg.data.nextRunAt).toBeInstanceOf(Date);

    // Two audit rows total: one for the template-generated event, one for the cron wrapper.
    expect(prisma.auditLog.create).toHaveBeenCalled();
    const actions = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("recurring_template.generated_job");
    expect(actions).toContain("cron.run");
  });

  it("returns empty summary when no templates are due", async () => {
    setFlag([{ key: "recurring_jobs_enabled", enabled: true }]);
    prisma.slaDefaults.findMany.mockResolvedValueOnce([]);
    prisma.recurringJobTemplate.findMany.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/cron/recurring-jobs/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { scanned: number; generated: number; skipped: number } };
    expect(body.summary).toEqual({ scanned: 0, generated: 0, skipped: 0 });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});
