import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { scanHourlyBankUsage } from "@/lib/billing/hourly-bank-alerts";

/**
 * The 90% low-balance threshold computation inside `scanHourlyBankUsage`:
 *   percent = floor(consumed / total * 100); alert when percent >= 90.
 * Covers 89% (no alert), 90% (alert), 100% (alert), and the zero-total guard.
 * Email transport stays in test mode (no production env gates).
 */

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

function bankRow(id: string, totalMinutes: number) {
  return {
    id,
    totalHoursPurchasedMinutes: totalMinutes,
    billingAccount: {
      client: { id: `cli-${id}`, companyName: "Acme", email: null },
    },
  };
}

describe("scanHourlyBankUsage — 90% threshold", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    // notifications off so the notify helpers no-op; email templates absent.
    setFlags({ notifications_enabled: false });
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
    prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    prisma.companySettings.findFirst.mockResolvedValue({
      legalNameEn: "Skyware Ltd",
      legalNameHe: "סקייוור",
      websiteUrl: "",
    });
    prisma.emailTemplate.findUnique.mockResolvedValue(null);
    prisma.hourlyBankAlertLog.findFirst.mockResolvedValue(null);
    prisma.hourlyBankAlertLog.create.mockResolvedValue({ id: "alog" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("89% does not alert", async () => {
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow("b", 1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "b", _sum: { minutesUsed: 899 } },
    ]);

    const summary = await scanHourlyBankUsage();
    expect(summary.scanned).toBe(1);
    expect(summary.alerted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(prisma.hourlyBankAlertLog.create).not.toHaveBeenCalled();
  });

  it("exactly 90% alerts", async () => {
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow("b", 1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "b", _sum: { minutesUsed: 900 } },
    ]);

    const summary = await scanHourlyBankUsage();
    expect(summary.alerted).toBe(1);
    expect(prisma.hourlyBankAlertLog.create).toHaveBeenCalledTimes(1);
  });

  it("100% alerts", async () => {
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow("b", 1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "b", _sum: { minutesUsed: 1000 } },
    ]);

    const summary = await scanHourlyBankUsage();
    expect(summary.alerted).toBe(1);
  });

  it("zero-total bank is guarded (skipped, never divides by zero)", async () => {
    // A bank with totalHoursPurchasedMinutes 0 must be skipped even though
    // findMany's `not: null` filter would let a 0 through.
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow("b", 0)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([
      { hourlyBankId: "b", _sum: { minutesUsed: 50 } },
    ]);

    const summary = await scanHourlyBankUsage();
    expect(summary.scanned).toBe(1);
    expect(summary.alerted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(prisma.hourlyBankAlertLog.create).not.toHaveBeenCalled();
  });

  it("a bank with no usage rows reads 0% and is skipped", async () => {
    prisma.hourlyBank.findMany.mockResolvedValueOnce([bankRow("b", 1000)]);
    prisma.hourlyBankUsage.groupBy.mockResolvedValueOnce([]); // no usage

    const summary = await scanHourlyBankUsage();
    expect(summary.alerted).toBe(0);
    expect(summary.skipped).toBe(1);
  });
});
