import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  scheduleDueReminders,
  decideReminder,
} from "@/lib/billing/reminders";

/**
 * Evaluation: full late-payment reminder flow, driven at the lib layer
 * (not over HTTP).
 *
 *   1. A Payment with a lateness rule whose trigger date has passed.
 *   2. `scheduleDueReminders` -> creates a reminder, an admin notification,
 *      and an admin email (test mode), then advances to `admin_notified`.
 *   3. `decideReminder(send_now)` -> `sendClientReminder` writes a SENT
 *      EmailLog (test mode), flips the reminder to `sent`, and audits.
 *
 * Asserts each side effect and that ZERO real emails left the system: every
 * EmailLog row is testMode=true and the transport never threw.
 */

const REMINDER_ID = "rem-flow-1";
const PAYMENT_ID = "pay-flow-1";
const CLIENT_ID = "cli-flow-1";

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

function adminTemplate() {
  return {
    id: "tpl-admin",
    kind: "payment_reminder_admin" as const,
    name: "admin",
    subjectEn: "Overdue {{payment_public_number}}",
    bodyEn: "{{client_name}} owes {{amount}}",
    subjectHe: "באיחור",
    bodyHe: "{{client_name}}",
    variableNotes: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function clientTemplate() {
  return {
    id: "tpl-client",
    kind: "payment_reminder_client" as const,
    name: "client",
    subjectEn: "Payment reminder {{payment_public_number}}",
    bodyEn: "Dear {{client_name}}, {{amount}} is overdue",
    subjectHe: "תזכורת תשלום {{payment_public_number}}",
    bodyHe: "שלום {{client_name}}",
    variableNotes: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("billing reminder full flow (lib layer)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    // notifications on so we can assert the admin notification side effect.
    setFlags({ notifications_enabled: true });
    // Keep email in test mode.
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];

    // Shared lookups.
    prisma.companySettings.findFirst.mockResolvedValue({
      legalNameEn: "Skyware Ltd",
      legalNameHe: "סקייוור",
      websiteUrl: "https://skyware.example",
      email: "billing@skyware.example",
    });
    prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    prisma.user.findUnique.mockResolvedValue({
      email: "ceo@skyware.example",
      languagePref: "en",
    });
    prisma.auditLog.create.mockResolvedValue({ id: "audit" });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    prisma.emailLog.create.mockResolvedValue({ id: "log" });

    // Template lookup disambiguated by kind.
    prisma.emailTemplate.findUnique.mockImplementation(async (args: unknown) => {
      const kind = (args as { where?: { kind?: string } } | undefined)?.where?.kind;
      if (kind === "payment_reminder_admin") return adminTemplate();
      if (kind === "payment_reminder_client") return clientTemplate();
      return null;
    });

    // The reminder's status as the flow advances it.
    let reminderStatus = "scheduled";
    prisma.paymentReminder.create.mockImplementation(async () => {
      reminderStatus = "scheduled";
      return { id: REMINDER_ID, status: reminderStatus };
    });
    prisma.paymentReminder.update.mockImplementation(async (args: unknown) => {
      const next = (args as { data?: { status?: string } }).data?.status;
      if (next) reminderStatus = next;
      return { id: REMINDER_ID, status: reminderStatus };
    });
    // findUnique is used by decideReminder (gate) and sendClientReminder (full).
    // Disambiguate by the requested `select` shape.
    prisma.paymentReminder.findUnique.mockImplementation(async (args: unknown) => {
      const select = (args as { select?: Record<string, unknown> }).select ?? {};
      if ("paymentId" in select) {
        // decideReminder gate.
        return {
          id: REMINDER_ID,
          status: reminderStatus,
          paymentId: PAYMENT_ID,
          payment: { autoSendAfterMinutes: null },
        };
      }
      // sendClientReminder full load.
      return {
        id: REMINDER_ID,
        status: reminderStatus,
        payment: {
          id: PAYMENT_ID,
          reference: "INV-FLOW",
          dueDate: new Date("2026-01-01T00:00:00Z"),
          amountPlaceholder: null,
          totalAmount: 75000,
          currency: "ILS",
          client: {
            id: CLIENT_ID,
            companyName: "Acme",
            email: "ar@acme.example",
            phone: null,
          },
        },
      };
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("schedules -> notifies admin -> send_now -> sent, with only test-mode emails", async () => {
    const now = new Date("2026-03-01T00:00:00Z"); // well past dueDate + 7d

    // One eligible candidate.
    prisma.payment.findMany.mockResolvedValueOnce([
      {
        id: PAYMENT_ID,
        reference: "INV-FLOW",
        dueDate: new Date("2026-01-01T00:00:00Z"),
        latenessAmount: 7,
        latenessUnit: "days",
        amountPlaceholder: null,
        totalAmount: 75000,
        currency: "ILS",
        client: { id: CLIENT_ID, companyName: "Acme", email: "ar@acme.example" },
        reminders: [],
      },
    ]);

    // ---- Phase 1: schedule + notify ----
    const sched = await scheduleDueReminders(prisma as never, now);
    expect(sched.scheduled).toBe(1);
    expect(sched.notified).toBe(1);

    // Reminder created, then advanced to admin_notified.
    expect(prisma.paymentReminder.create).toHaveBeenCalledTimes(1);
    const advancedToNotified = prisma.paymentReminder.update.mock.calls.some((c) => {
      const a = c[0] as { data?: { status?: string } };
      return a.data?.status === "admin_notified";
    });
    expect(advancedToNotified).toBe(true);

    // Admin notification fan-out written (notifications flag on).
    expect(prisma.notification.createMany).toHaveBeenCalled();
    const notifyArg = prisma.notification.createMany.mock.calls[0]?.[0] as {
      data: Array<{ kind: string }>;
    };
    expect(notifyArg.data[0]!.kind).toBe("payment_reminder_pending_review");

    // Admin email written in test mode.
    const afterPhase1Logs = prisma.emailLog.create.mock.calls.length;
    expect(afterPhase1Logs).toBe(1);
    const adminLog = prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { kind: string; testMode: boolean; status: string };
    };
    expect(adminLog.data.kind).toBe("payment_reminder_admin");
    expect(adminLog.data.testMode).toBe(true);
    expect(adminLog.data.status).toBe("queued");

    // ---- Phase 2: send_now ----
    const decision = await decideReminder(prisma as never, {
      reminderId: REMINDER_ID,
      adminUserId: "admin-1",
      decision: "send_now",
    });
    expect(decision.status).toBe("sent");

    // A second EmailLog — the client reminder — also in test mode.
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(2);
    const clientLog = prisma.emailLog.create.mock.calls[1]?.[0] as {
      data: { kind: string; testMode: boolean; status: string };
    };
    expect(clientLog.data.kind).toBe("payment_reminder_client");
    expect(clientLog.data.testMode).toBe(true);
    expect(clientLog.data.status).toBe("queued");

    // Reminder flipped to sent.
    const flippedToSent = prisma.paymentReminder.update.mock.calls.some((c) => {
      const a = c[0] as { data?: { status?: string } };
      return a.data?.status === "sent";
    });
    expect(flippedToSent).toBe(true);

    // A sent audit was written.
    const sentAudit = prisma.auditLog.create.mock.calls.some((c) => {
      const a = c[0] as { data?: { action?: string } };
      return a.data?.action === "billing.reminder.sent";
    });
    expect(sentAudit).toBe(true);

    // ZERO real emails: every EmailLog row is test mode.
    for (const call of prisma.emailLog.create.mock.calls) {
      const a = call[0] as { data: { testMode: boolean } };
      expect(a.data.testMode).toBe(true);
    }
  });
});
