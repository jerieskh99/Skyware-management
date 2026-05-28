import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * POST /api/cron/billing-reminders.
 *
 * Cron auth (bearer + admin both accepted, otherwise 401), flag-off skip,
 * and a flag-on run that schedules a reminder and writes an admin EmailLog.
 * Crucially: no real email is transmitted — the transport stays in test mode
 * and every EmailLog row is written with testMode=true.
 */

const URL = "http://localhost/api/cron/billing-reminders";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
}

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

describe("POST /api/cron/billing-reminders", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(null);
    process.env["CRON_SECRET"] = "cron-secret";
    // Keep email in test mode: no production env gates.
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects 401 when no bearer header and no session", async () => {
    setFlags({ billing_reminders_enabled: true });
    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects 401 for a non-admin session and a wrong bearer", async () => {
    setFlags({ billing_reminders_enabled: true });
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });

  it("accepts the cron bearer secret", async () => {
    setFlags({ billing_reminders_enabled: true });
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.paymentReminder.findMany.mockResolvedValue([]);
    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest({ authorization: "Bearer cron-secret" }));
    expect(res.status).toBe(200);
  });

  it("accepts an authenticated admin session", async () => {
    setFlags({ billing_reminders_enabled: true });
    mockAuthAs(makeAdminSession());
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.paymentReminder.findMany.mockResolvedValue([]);
    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it("skips with { skipped: true } when billing_reminders_enabled is off", async () => {
    setFlags({ billing_reminders_enabled: false });
    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest({ authorization: "Bearer cron-secret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: boolean };
    expect(body.skipped).toBe(true);
    // The reminder engine never ran.
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("flag on: schedules a due reminder and writes a test-mode admin EmailLog (no real send)", async () => {
    setFlags({ billing_reminders_enabled: true, notifications_enabled: false });

    // One unpaid payment whose 7-day lateness rule already fired.
    prisma.payment.findMany.mockResolvedValueOnce([
      {
        id: "pay-1",
        reference: "INV-7",
        dueDate: new Date("2026-01-01T00:00:00Z"),
        latenessAmount: 7,
        latenessUnit: "days",
        amountPlaceholder: null,
        totalAmount: 90000,
        currency: "ILS",
        client: { id: "cli-1", companyName: "Acme", email: "ar@acme.example" },
        reminders: [], // no open reminder -> eligible
      },
    ]);
    // getActiveAdminIds
    prisma.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }]);
    // admin email template
    prisma.emailTemplate.findUnique.mockResolvedValueOnce({
      id: "tpl-admin",
      kind: "payment_reminder_admin",
      name: "admin",
      subjectEn: "Overdue {{payment_public_number}}",
      bodyEn: "{{client_name}} is {{days_overdue}} days overdue",
      subjectHe: "באיחור {{payment_public_number}}",
      bodyHe: "{{client_name}}",
      variableNotes: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.companySettings.findFirst.mockResolvedValue({
      legalNameEn: "Skyware Ltd",
      legalNameHe: "סקייוור",
      websiteUrl: "https://skyware.example",
    });
    prisma.paymentReminder.create.mockResolvedValueOnce({
      id: "rem-1",
      status: "scheduled",
    });
    // per-admin lookup for email address + language
    prisma.user.findUnique.mockResolvedValueOnce({
      email: "ceo@skyware.example",
      languagePref: "en",
    });
    prisma.emailLog.create.mockResolvedValueOnce({ id: "log-admin-1" });
    prisma.paymentReminder.update.mockResolvedValue({
      id: "rem-1",
      status: "admin_notified",
    });
    // autoSendEligibleReminders: nothing pending.
    prisma.paymentReminder.findMany.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/cron/billing-reminders/route");
    const res = await POST(makeRequest({ authorization: "Bearer cron-secret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      summary: {
        scheduled: number;
        notified: number;
        autoSent: number;
        failed: number;
        skipped: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.summary.scheduled).toBe(1);
    expect(body.summary.notified).toBe(1);
    expect(body.summary.autoSent).toBe(0);

    // The admin EmailLog was written in TEST MODE — no real send.
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const logArg = prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { testMode: boolean; status: string; kind: string };
    };
    expect(logArg.data.testMode).toBe(true);
    expect(logArg.data.status).toBe("queued");
    expect(logArg.data.kind).toBe("payment_reminder_admin");

    // The reminder advanced to admin_notified.
    const updateArg = prisma.paymentReminder.update.mock.calls.find((c) => {
      const a = c[0] as { data?: { status?: string } };
      return a.data?.status === "admin_notified";
    });
    expect(updateArg).toBeDefined();
  });
});
