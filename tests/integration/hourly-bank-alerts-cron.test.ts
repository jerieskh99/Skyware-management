import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

/**
 * POST /api/cron/hourly-bank-alerts.
 *
 * Flag gate, the 90% threshold firing an alert + writing a HourlyBankAlertLog,
 * dedup within 30 days suppressing a re-fire, and the
 * { scanned, alerted, deduped } summary shape.
 */

const URL = "http://localhost/api/cron/hourly-bank-alerts";

function makeRequest() {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer cron-secret",
    },
  });
}

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

/** A single active bank with total purchased minutes. */
function bankRow(totalMinutes: number) {
  return {
    id: "bank-1",
    totalHoursPurchasedMinutes: totalMinutes,
    billingAccount: {
      client: { id: "cli-1", companyName: "Acme", email: "ar@acme.example" },
    },
  };
}

describe("POST /api/cron/hourly-bank-alerts", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "cron-secret";
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips with { skipped: true } when hourly_bank_alerts_enabled is off", async () => {
    setFlags({ hourly_bank_alerts_enabled: false });
    const { POST } = await import("@/app/api/cron/hourly-bank-alerts/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: boolean };
    expect(body.skipped).toBe(true);
    expect(prisma.hourlyBank.findMany).not.toHaveBeenCalled();
  });

  it("fires an alert at the 90% threshold and writes a HourlyBankAlertLog", async () => {
    setFlags({ hourly_bank_alerts_enabled: true, notifications_enabled: false });

    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow(1000)]);
    // 900 / 1000 = 90% -> at threshold.
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "bank-1", _sum: { minutesUsed: 900 } },
    ]);
    // No prior alert within the dedup window.
    prisma.hourlyBankAlertLog.findFirst.mockResolvedValueOnce(null);
    prisma.hourlyBankAlertLog.create.mockResolvedValueOnce({ id: "alog-1" });
    prisma.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }]);
    prisma.companySettings.findFirst.mockResolvedValue({
      legalNameEn: "Skyware Ltd",
      legalNameHe: "סקייוור",
      websiteUrl: "https://skyware.example",
    });
    // No admin / client templates seeded -> the email branches are skipped,
    // but the alert log + audit still fire.
    prisma.emailTemplate.findUnique.mockResolvedValue(null);

    const { POST } = await import("@/app/api/cron/hourly-bank-alerts/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; alerted: number; deduped: number; skipped: number };
    };
    expect(body.summary.scanned).toBe(1);
    expect(body.summary.alerted).toBe(1);
    expect(body.summary.deduped).toBe(0);

    // The dedup row was written at the 90 tier with the real consumed/total.
    expect(prisma.hourlyBankAlertLog.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.hourlyBankAlertLog.create.mock.calls[0]?.[0] as {
      data: { thresholdPercent: number; consumedMinutes: number; totalMinutes: number };
    };
    expect(createArg.data.thresholdPercent).toBe(90);
    expect(createArg.data.consumedMinutes).toBe(900);
    expect(createArg.data.totalMinutes).toBe(1000);
  });

  it("does NOT fire below the threshold (89%)", async () => {
    setFlags({ hourly_bank_alerts_enabled: true });
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow(1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "bank-1", _sum: { minutesUsed: 890 } },
    ]);

    const { POST } = await import("@/app/api/cron/hourly-bank-alerts/route");
    const res = await POST(makeRequest());
    const body = (await res.json()) as {
      summary: { scanned: number; alerted: number; skipped: number };
    };
    expect(body.summary.scanned).toBe(1);
    expect(body.summary.alerted).toBe(0);
    expect(body.summary.skipped).toBe(1);
    expect(prisma.hourlyBankAlertLog.create).not.toHaveBeenCalled();
  });

  it("dedups: a recent alert within 30 days does not re-fire", async () => {
    setFlags({ hourly_bank_alerts_enabled: true });
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow(1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "bank-1", _sum: { minutesUsed: 950 } },
    ]);
    // A recent alert exists -> deduped, no new alert.
    prisma.hourlyBankAlertLog.findFirst.mockResolvedValueOnce({ id: "prev-alog" });

    const { POST } = await import("@/app/api/cron/hourly-bank-alerts/route");
    const res = await POST(makeRequest());
    const body = (await res.json()) as {
      summary: { scanned: number; alerted: number; deduped: number };
    };
    expect(body.summary.scanned).toBe(1);
    expect(body.summary.alerted).toBe(0);
    expect(body.summary.deduped).toBe(1);
    expect(prisma.hourlyBankAlertLog.create).not.toHaveBeenCalled();
  });
});
