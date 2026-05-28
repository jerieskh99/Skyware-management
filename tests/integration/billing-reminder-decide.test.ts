import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PATCH } from "@/app/api/billing/reminders/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * PATCH /api/billing/reminders/[id] — admin decision on a reminder.
 *
 * Drives the route (which delegates to `decideReminder`). Covers approve,
 * delay (incl. the 400 when `newScheduledFor` is missing), cancel, send_now,
 * the 422 illegal transition, plus the 403 / 404 gates. Email always stays in
 * test mode (no production env gates set), so no real email is transmitted.
 */

const URL_BASE = "http://localhost/api/billing/reminders";
const ID = "00000000-0000-0000-0000-0000000000r1";

function makeRequest(body: unknown) {
  return new Request(`${URL_BASE}/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: ID }) };

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

/** Common send-path mocks for send_now / approve-with-auto-send. */
function primeSendPath() {
  // sendClientReminder reloads the reminder with the full payment + client.
  prisma.paymentReminder.findUnique.mockResolvedValueOnce({
    id: ID,
    status: "admin_notified",
    payment: {
      id: "pay-1",
      reference: "INV-1",
      dueDate: new Date("2026-04-01T00:00:00Z"),
      amountPlaceholder: null,
      totalAmount: 50000,
      currency: "ILS",
      client: {
        id: "cli-1",
        companyName: "Acme",
        email: "ar@acme.example",
        phone: null,
      },
    },
  });
  prisma.emailTemplate.findUnique.mockResolvedValueOnce({
    id: "tpl-client",
    kind: "payment_reminder_client",
    name: "client",
    subjectEn: "Reminder {{payment_public_number}}",
    bodyEn: "Hi {{client_name}}",
    subjectHe: "תזכורת {{payment_public_number}}",
    bodyHe: "שלום {{client_name}}",
    variableNotes: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.companySettings.findFirst.mockResolvedValueOnce({
    legalNameEn: "Skyware Ltd",
    legalNameHe: "סקייוור",
    websiteUrl: "https://skyware.example",
  });
  prisma.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }]);
  prisma.emailLog.create.mockResolvedValueOnce({ id: "log-1" });
  prisma.paymentReminder.update.mockResolvedValue({ id: ID, status: "sent" });
  prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  prisma.notification.createMany.mockResolvedValue({ count: 1 });
}

describe("PATCH /api/billing/reminders/[id]", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    setFlags({ billing_reminders_enabled: true, notifications_enabled: false });
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
    // Ensure email stays in test mode regardless of ambient env.
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await PATCH(makeRequest({ action: "approve" }), params);
    expect(res.status).toBe(403);
  });

  it("returns 404 when billing_reminders_enabled is off", async () => {
    setFlags({ billing_reminders_enabled: false });
    const res = await PATCH(makeRequest({ action: "approve" }), params);
    expect(res.status).toBe(404);
    expect(prisma.paymentReminder.findUnique).not.toHaveBeenCalled();
  });

  it("approves: admin_notified -> approved (no auto-send)", async () => {
    prisma.paymentReminder.findUnique.mockResolvedValueOnce({
      id: ID,
      status: "admin_notified",
      paymentId: "pay-1",
      payment: { autoSendAfterMinutes: null },
    });
    prisma.paymentReminder.update.mockResolvedValueOnce({
      id: ID,
      status: "approved",
    });

    const res = await PATCH(makeRequest({ action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toEqual({ id: ID, status: "approved" });

    const updateArg = prisma.paymentReminder.update.mock.calls[0]?.[0] as {
      data: { status: string; decidedByUserId: string };
    };
    expect(updateArg.data.status).toBe("approved");
    expect(updateArg.data.decidedByUserId).toBe("admin-1");
    // No client send occurred.
    expect(prisma.emailLog.create).not.toHaveBeenCalled();
  });

  it("delays: requires newScheduledFor (400 without)", async () => {
    const res = await PATCH(makeRequest({ action: "delay" }), params);
    expect(res.status).toBe(400);
    expect(prisma.paymentReminder.findUnique).not.toHaveBeenCalled();
  });

  it("delays: admin_notified -> delayed with a new scheduledFor", async () => {
    prisma.paymentReminder.findUnique.mockResolvedValueOnce({
      id: ID,
      status: "admin_notified",
      paymentId: "pay-1",
      payment: { autoSendAfterMinutes: null },
    });
    prisma.paymentReminder.update.mockResolvedValueOnce({
      id: ID,
      status: "delayed",
    });

    const when = "2026-06-15T09:00:00.000Z";
    const res = await PATCH(
      makeRequest({ action: "delay", newScheduledFor: when }),
      params,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("delayed");

    const updateArg = prisma.paymentReminder.update.mock.calls[0]?.[0] as {
      data: { status: string; scheduledFor: Date };
    };
    expect(updateArg.data.status).toBe("delayed");
    expect(updateArg.data.scheduledFor).toEqual(new Date(when));
  });

  it("cancels with a comment: admin_notified -> cancelled", async () => {
    prisma.paymentReminder.findUnique.mockResolvedValueOnce({
      id: ID,
      status: "admin_notified",
      paymentId: "pay-1",
      payment: { autoSendAfterMinutes: null },
    });
    prisma.paymentReminder.update.mockResolvedValueOnce({
      id: ID,
      status: "cancelled",
    });

    const res = await PATCH(
      makeRequest({ action: "cancel", comment: "client already paid" }),
      params,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("cancelled");

    const updateArg = prisma.paymentReminder.update.mock.calls[0]?.[0] as {
      data: { status: string; decisionComment: string };
    };
    expect(updateArg.data.decisionComment).toBe("client already paid");
  });

  it("send_now: renders + sends (test mode) and flips to sent", async () => {
    // First findUnique: the decide gate (status + autoSend).
    prisma.paymentReminder.findUnique.mockResolvedValueOnce({
      id: ID,
      status: "admin_notified",
      paymentId: "pay-1",
      payment: { autoSendAfterMinutes: null },
    });
    // Then sendClientReminder primes the full payment + client + template.
    primeSendPath();

    const res = await PATCH(makeRequest({ action: "send_now" }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("sent");

    // Exactly one EmailLog written, in test mode (queued).
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const logArg = prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { testMode: boolean; status: string; kind: string };
    };
    expect(logArg.data.testMode).toBe(true);
    expect(logArg.data.status).toBe("queued");
    expect(logArg.data.kind).toBe("payment_reminder_client");
  });

  it("returns 422 on an illegal transition (cancel a sent reminder)", async () => {
    prisma.paymentReminder.findUnique.mockResolvedValueOnce({
      id: ID,
      status: "sent",
      paymentId: "pay-1",
      payment: { autoSendAfterMinutes: null },
    });

    const res = await PATCH(makeRequest({ action: "cancel" }), params);
    expect(res.status).toBe(422);
    expect(prisma.paymentReminder.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the reminder does not exist", async () => {
    prisma.paymentReminder.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ action: "approve" }), params);
    expect(res.status).toBe(404);
  });
});
