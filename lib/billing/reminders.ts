import type { LatenessUnit, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { formatCurrency, formatDateIL } from "@/lib/format";
import { renderEmail, type RenderVars } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/transport";
import { BILLING_AUDIT_ACTIONS } from "./billing-audit-actions";
import { isAllowedReminderTransition } from "./reminder-state";
import {
  notifyAdminsReminderOutcome,
  notifyAdminsReminderPendingReview,
} from "./notification-triggers";

/**
 * Wave-2 late-payment reminder engine.
 *
 * Lifecycle (see `reminder-state.ts` for the legal edges):
 *   1. `scheduleDueReminders` (cron) finds unpaid payments whose lateness rule
 *      has fired and that have no open reminder, creates a `PaymentReminder`
 *      (status `scheduled`), notifies admins (dashboard + `payment_reminder_admin`
 *      email), and advances the row to `admin_notified`.
 *   2. An admin decides via `decideReminder` (approve / delay / cancel / send_now).
 *   3. `sendClientReminder` renders + sends the `payment_reminder_client` email,
 *      marks the row `sent` / `send_failed`, and notifies admins of the outcome.
 *   4. `autoSendEligibleReminders` (cron) handles the auto-send policy: reminders
 *      still in `admin_notified` whose `autoSendAfterMinutes` has elapsed with no
 *      admin decision are sent automatically.
 *
 * Every email goes through `lib/email/transport.ts`, which is test-mode by
 * default and never transmits a real client email in V2.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Statuses that count as "still unpaid" for reminder eligibility. */
const UNPAID_STATUSES = [
  "sent_to_client",
  "waiting_for_payment",
  "partially_paid",
  "overdue",
] as const;

/** Reminder statuses that count as "already open" (do not re-schedule). */
const OPEN_REMINDER_STATUSES = [
  "scheduled",
  "admin_notified",
  "approved",
  "delayed",
] as const;

interface LatenessPayment {
  dueDate: Date | null;
  latenessAmount: number | null;
  latenessUnit: LatenessUnit | null;
}

/**
 * The resolved date a reminder should fire for a payment: `dueDate` plus the
 * lateness offset. Returns null when the payment has no due date or no
 * complete lateness rule (both `latenessAmount` and `latenessUnit` required).
 */
export function triggerDateFor(payment: LatenessPayment): Date | null {
  if (!payment.dueDate) return null;
  if (payment.latenessAmount == null || payment.latenessUnit == null) return null;
  const offsetMs =
    payment.latenessUnit === "weeks"
      ? payment.latenessAmount * WEEK_MS
      : payment.latenessAmount * DAY_MS;
  return new Date(payment.dueDate.getTime() + offsetMs);
}

/**
 * Whole days a payment is overdue relative to `now`. Floors at 0 (a payment
 * not yet past due reports 0). Returns 0 when there is no due date.
 */
export function daysOverdue(
  payment: { dueDate: Date | null },
  now: Date,
): number {
  if (!payment.dueDate) return 0;
  const diff = now.getTime() - payment.dueDate.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

/** Gross amount in minor units for a payment, preferring the VAT-split total. */
function paymentTotalMinorUnits(p: {
  totalAmount: number | null;
  amountPlaceholder: number | null;
}): number {
  return p.totalAmount ?? p.amountPlaceholder ?? 0;
}

/** Resolve active admin user ids. */
async function getActiveAdminIds(
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const admins = await tx.user.findMany({
    where: { isActive: true, role: { isAdmin: true } },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}

interface ReminderPaymentContext {
  clientName: string;
  clientEmail: string | null;
  paymentPublicNumber: string;
  amountMinor: number;
  currency: string;
  dueDate: Date | null;
  language: "en" | "he";
}

/** Build the template render vars from a payment context. */
function buildReminderVars(
  ctx: ReminderPaymentContext,
  companyName: string,
  contactUrl: string,
  now: Date,
): RenderVars {
  return {
    client_name: ctx.clientName,
    payment_public_number: ctx.paymentPublicNumber,
    amount: formatCurrency(ctx.amountMinor, ctx.currency, ctx.language),
    currency: ctx.currency,
    due_date: ctx.dueDate ? formatDateIL(ctx.dueDate, ctx.language) : "",
    days_overdue: daysOverdue({ dueDate: ctx.dueDate }, now),
    company_name: companyName,
    contact_url: contactUrl,
  };
}

/**
 * Payments do not carry a human public number column the way jobs do; we use a
 * short slug derived from the payment id + reference so the email and the
 * notification have a stable, readable handle.
 */
function paymentHandle(p: { id: string; reference: string | null }): string {
  if (p.reference && p.reference.trim()) return p.reference.trim();
  return `PMT-${p.id.slice(0, 8).toUpperCase()}`;
}

interface ScheduleSummary extends Record<string, unknown> {
  scheduled: number;
  notified: number;
  skipped: number;
}

/**
 * Find unpaid payments whose lateness rule has fired and that have no open
 * reminder. For each: create a `PaymentReminder` (scheduled), notify admins
 * (dashboard + admin email), advance to `admin_notified`. Idempotent — a
 * payment with an open reminder is skipped.
 */
export async function scheduleDueReminders(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<ScheduleSummary> {
  const summary: ScheduleSummary = { scheduled: 0, notified: 0, skipped: 0 };

  const candidates = await tx.payment.findMany({
    where: {
      status: { in: [...UNPAID_STATUSES] },
      dueDate: { not: null },
      latenessAmount: { not: null },
      latenessUnit: { not: null },
    },
    select: {
      id: true,
      reference: true,
      dueDate: true,
      latenessAmount: true,
      latenessUnit: true,
      amountPlaceholder: true,
      totalAmount: true,
      currency: true,
      client: { select: { id: true, companyName: true, email: true } },
      reminders: {
        where: { status: { in: [...OPEN_REMINDER_STATUSES] } },
        select: { id: true },
      },
    },
  });

  if (candidates.length === 0) return summary;

  const [adminIds, template, company] = await Promise.all([
    getActiveAdminIds(tx),
    tx.emailTemplate.findUnique({ where: { kind: "payment_reminder_admin" } }),
    tx.companySettings.findFirst({
      select: { legalNameEn: true, legalNameHe: true, websiteUrl: true },
    }),
  ]);

  const companyName =
    company?.legalNameEn || company?.legalNameHe || "Skyware";
  const contactUrl = company?.websiteUrl || "";

  for (const p of candidates) {
    const trigger = triggerDateFor(p);
    if (!trigger || trigger.getTime() > now.getTime()) {
      summary.skipped += 1;
      continue;
    }
    if (p.reminders.length > 0) {
      summary.skipped += 1;
      continue;
    }

    const handle = paymentHandle(p);
    const amountMinor = paymentTotalMinorUnits(p);

    const reminder = await tx.paymentReminder.create({
      data: {
        paymentId: p.id,
        status: "scheduled",
        scheduledFor: trigger,
      },
      select: { id: true, status: true },
    });
    summary.scheduled += 1;

    await writeAudit(tx, {
      actorUserId: null,
      action: BILLING_AUDIT_ACTIONS.REMINDER_SCHEDULED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: {
        paymentId: { old: null, new: p.id },
        scheduledFor: { old: null, new: trigger.toISOString() },
      },
    });

    // Advance to admin_notified: dashboard notification + admin email.
    if (!isAllowedReminderTransition("scheduled", "admin_notified")) {
      // Defensive: the machine guarantees this edge, but assert anyway.
      continue;
    }

    const overdue = daysOverdue({ dueDate: p.dueDate }, now);

    // Admin email (test-mode by default).
    if (template) {
      const adminLangVars: RenderVars = {
        client_name: p.client.companyName,
        payment_public_number: handle,
        amount: formatCurrency(amountMinor, p.currency, "en"),
        currency: p.currency,
        due_date: p.dueDate ? formatDateIL(p.dueDate, "en") : "",
        days_overdue: overdue,
        company_name: companyName,
        contact_url: contactUrl,
      };
      const rendered = renderEmail(template, "en", adminLangVars);
      for (const adminId of adminIds) {
        const admin = await tx.user.findUnique({
          where: { id: adminId },
          select: { email: true, languagePref: true },
        });
        if (!admin?.email) continue;
        const langVars =
          admin.languagePref === "he"
            ? { ...adminLangVars, amount: formatCurrency(amountMinor, p.currency, "he"), due_date: p.dueDate ? formatDateIL(p.dueDate, "he") : "" }
            : adminLangVars;
        const adminRendered =
          admin.languagePref === "he"
            ? renderEmail(template, "he", langVars)
            : rendered;
        await sendEmail(tx, {
          kind: "payment_reminder_admin",
          toEmail: admin.email,
          subject: adminRendered.subject,
          bodyHtml: adminRendered.bodyHtml,
          bodyText: adminRendered.bodyText,
          language: admin.languagePref === "he" ? "he" : "en",
          links: { paymentId: p.id, paymentReminderId: reminder.id, clientId: p.client.id },
          triggeredByUserId: null,
        });
      }
    }

    await notifyAdminsReminderPendingReview(tx, {
      adminUserIds: adminIds,
      reminderId: reminder.id,
      paymentId: p.id,
      clientName: p.client.companyName,
      paymentPublicNumber: handle,
      daysOverdue: overdue,
    });

    await tx.paymentReminder.update({
      where: { id: reminder.id },
      data: { status: "admin_notified", adminNotifiedAt: now },
    });

    await writeAudit(tx, {
      actorUserId: null,
      action: BILLING_AUDIT_ACTIONS.REMINDER_ADMIN_NOTIFIED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: { status: { old: "scheduled", new: "admin_notified" } },
    });
    summary.notified += 1;
  }

  return summary;
}

export type ReminderDecision = "approve" | "delay" | "cancel" | "send_now";

interface DecideArgs {
  reminderId: string;
  adminUserId: string;
  decision: ReminderDecision;
  comment?: string;
  /** Required for `delay`: the new fire date. */
  newScheduledFor?: Date;
}

export class ReminderTransitionError extends Error {}
export class ReminderNotFoundError extends Error {}

/**
 * Apply an admin decision to a reminder. Enforces the state machine; the admin
 * permission check is the caller's responsibility (`canManageReminders`).
 *
 *   - approve   : admin_notified -> approved. If the payment carries an
 *                 autoSendAfterMinutes policy, the approval also triggers an
 *                 immediate client send (the admin explicitly chose to proceed).
 *   - delay     : admin_notified -> delayed, sets a new scheduledFor.
 *   - cancel    : (admin_notified|approved) -> cancelled.
 *   - send_now  : (admin_notified|approved) -> sent (renders + sends now).
 */
export async function decideReminder(
  tx: Prisma.TransactionClient,
  args: DecideArgs,
): Promise<{ id: string; status: string }> {
  const reminder = await tx.paymentReminder.findUnique({
    where: { id: args.reminderId },
    select: {
      id: true,
      status: true,
      paymentId: true,
      payment: { select: { autoSendAfterMinutes: true } },
    },
  });
  if (!reminder) throw new ReminderNotFoundError("Reminder not found");

  const from = reminder.status;

  if (args.decision === "approve") {
    assertTransition(from, "approved");
    await tx.paymentReminder.update({
      where: { id: reminder.id },
      data: {
        status: "approved",
        decidedAt: new Date(),
        decidedByUserId: args.adminUserId,
        decisionComment: args.comment ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: args.adminUserId,
      action: BILLING_AUDIT_ACTIONS.REMINDER_APPROVED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: { status: { old: from, new: "approved" } },
    });
    // Policy: when the payment opted into auto-send, an explicit approval
    // proceeds straight to the client send.
    if (reminder.payment.autoSendAfterMinutes != null) {
      return sendClientReminder(tx, {
        reminderId: reminder.id,
        actorUserId: args.adminUserId,
      });
    }
    return { id: reminder.id, status: "approved" };
  }

  if (args.decision === "delay") {
    assertTransition(from, "delayed");
    if (!args.newScheduledFor) {
      throw new ReminderTransitionError("newScheduledFor is required to delay");
    }
    await tx.paymentReminder.update({
      where: { id: reminder.id },
      data: {
        status: "delayed",
        scheduledFor: args.newScheduledFor,
        decidedAt: new Date(),
        decidedByUserId: args.adminUserId,
        decisionComment: args.comment ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: args.adminUserId,
      action: BILLING_AUDIT_ACTIONS.REMINDER_DELAYED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: {
        status: { old: from, new: "delayed" },
        scheduledFor: { old: null, new: args.newScheduledFor.toISOString() },
      },
    });
    return { id: reminder.id, status: "delayed" };
  }

  if (args.decision === "cancel") {
    assertTransition(from, "cancelled");
    await tx.paymentReminder.update({
      where: { id: reminder.id },
      data: {
        status: "cancelled",
        decidedAt: new Date(),
        decidedByUserId: args.adminUserId,
        decisionComment: args.comment ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: args.adminUserId,
      action: BILLING_AUDIT_ACTIONS.REMINDER_CANCELLED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: { status: { old: from, new: "cancelled" } },
    });
    return { id: reminder.id, status: "cancelled" };
  }

  // send_now
  assertTransition(from, "sent");
  return sendClientReminder(tx, {
    reminderId: reminder.id,
    actorUserId: args.adminUserId,
  });
}

function assertTransition(from: string, to: string): void {
  if (!isAllowedReminderTransition(from as never, to as never)) {
    throw new ReminderTransitionError(
      `Reminder cannot transition from ${from} to ${to}`,
    );
  }
}

interface SendClientArgs {
  reminderId: string;
  /** Null when sent by the auto-send worker policy. */
  actorUserId: string | null;
}

/**
 * Render + send the client reminder email, then mark the reminder `sent` or
 * `send_failed` and notify admins of the outcome. Used by both `send_now`
 * (admin) and `autoSendEligibleReminders` (worker policy).
 */
export async function sendClientReminder(
  tx: Prisma.TransactionClient,
  args: SendClientArgs,
): Promise<{ id: string; status: string }> {
  const now = new Date();
  const reminder = await tx.paymentReminder.findUnique({
    where: { id: args.reminderId },
    select: {
      id: true,
      status: true,
      payment: {
        select: {
          id: true,
          reference: true,
          dueDate: true,
          amountPlaceholder: true,
          totalAmount: true,
          currency: true,
          client: {
            select: { id: true, companyName: true, email: true, phone: true },
          },
        },
      },
    },
  });
  if (!reminder) throw new ReminderNotFoundError("Reminder not found");

  const p = reminder.payment;
  const handle = paymentHandle(p);
  const amountMinor = paymentTotalMinorUnits(p);
  const isAutoSend = args.actorUserId === null;

  const [template, company, adminIds] = await Promise.all([
    tx.emailTemplate.findUnique({ where: { kind: "payment_reminder_client" } }),
    tx.companySettings.findFirst({
      select: { legalNameEn: true, legalNameHe: true, websiteUrl: true },
    }),
    getActiveAdminIds(tx),
  ]);

  const companyName = company?.legalNameEn || company?.legalNameHe || "Skyware";
  const contactUrl = company?.websiteUrl || "";

  // Client language is not modeled on Client; default to Hebrew (the IL norm
  // for client-facing email per the seeded templates) unless the company has
  // an English-only profile. We use Hebrew as the client default.
  const language: "en" | "he" = "he";

  const ctx: ReminderPaymentContext = {
    clientName: p.client.companyName,
    clientEmail: p.client.email,
    paymentPublicNumber: handle,
    amountMinor,
    currency: p.currency,
    dueDate: p.dueDate,
    language,
  };

  // No template or no client email -> record a failure outcome.
  if (!template || !p.client.email) {
    const reason = !template
      ? "missing_template:payment_reminder_client"
      : "client_has_no_email";
    await tx.paymentReminder.update({
      where: { id: reminder.id },
      data: { status: "send_failed", sentAt: now, failureReason: reason },
    });
    await writeAudit(tx, {
      actorUserId: args.actorUserId,
      action: BILLING_AUDIT_ACTIONS.REMINDER_SEND_FAILED,
      entityType: "PaymentReminder",
      entityId: reminder.id,
      diff: { status: { old: reminder.status, new: "send_failed" }, reason: { old: null, new: reason } },
    });
    await notifyAdminsReminderOutcome(tx, {
      adminUserIds: adminIds,
      reminderId: reminder.id,
      paymentId: p.id,
      clientName: p.client.companyName,
      paymentPublicNumber: handle,
      outcome: "send_failed",
      failureReason: reason,
    });
    return { id: reminder.id, status: "send_failed" };
  }

  const vars = buildReminderVars(ctx, companyName, contactUrl, now);
  const rendered = renderEmail(template, language, vars);

  let sendResult;
  let failureReason: string | null = null;
  try {
    sendResult = await sendEmail(tx, {
      kind: "payment_reminder_client",
      toEmail: p.client.email,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      language,
      links: { paymentId: p.id, paymentReminderId: reminder.id, clientId: p.client.id },
      triggeredByUserId: args.actorUserId,
    });
  } catch (err) {
    // The transport throws on the (unwired) real-send path; the EmailLog row
    // was already written as failed. Treat as a send failure here too.
    failureReason = err instanceof Error ? err.message : "send_error";
    sendResult = { emailLogId: "", testMode: false, status: "failed" as const };
  }

  const succeeded = sendResult.status === "queued" || sendResult.status === "sent";
  const newStatus = succeeded ? "sent" : "send_failed";

  const sentSnapshot: Prisma.InputJsonValue = {
    templateKind: "payment_reminder_client",
    language,
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    emailLogId: sendResult.emailLogId,
    testMode: sendResult.testMode,
  };

  await tx.paymentReminder.update({
    where: { id: reminder.id },
    data: {
      status: newStatus,
      sentAt: now,
      providerMessageId: sendResult.providerMessageId ?? null,
      failureReason: succeeded ? null : (failureReason ?? sendResult.failureReason ?? "send_failed"),
      sentSnapshot,
    },
  });

  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: isAutoSend
      ? BILLING_AUDIT_ACTIONS.REMINDER_AUTO_SENT
      : succeeded
        ? BILLING_AUDIT_ACTIONS.REMINDER_SENT
        : BILLING_AUDIT_ACTIONS.REMINDER_SEND_FAILED,
    entityType: "PaymentReminder",
    entityId: reminder.id,
    diff: {
      status: { old: reminder.status, new: newStatus },
      emailLogId: { old: null, new: sendResult.emailLogId },
      testMode: { old: null, new: sendResult.testMode },
    },
  });

  await notifyAdminsReminderOutcome(tx, {
    adminUserIds: adminIds,
    reminderId: reminder.id,
    paymentId: p.id,
    clientName: p.client.companyName,
    paymentPublicNumber: handle,
    outcome: isAutoSend ? "auto_sent" : succeeded ? "sent" : "send_failed",
    failureReason: succeeded ? null : failureReason,
  });

  return { id: reminder.id, status: newStatus };
}

interface AutoSendSummary extends Record<string, unknown> {
  autoSent: number;
  failed: number;
  skipped: number;
}

/**
 * Auto-send policy worker. For reminders still in `admin_notified` whose
 * payment carries an `autoSendAfterMinutes` and where that many minutes have
 * elapsed since `adminNotifiedAt` with no admin decision, send the client
 * reminder automatically.
 */
export async function autoSendEligibleReminders(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<AutoSendSummary> {
  const summary: AutoSendSummary = { autoSent: 0, failed: 0, skipped: 0 };

  const pending = await tx.paymentReminder.findMany({
    where: {
      status: "admin_notified",
      adminNotifiedAt: { not: null },
      decidedAt: null,
      payment: { autoSendAfterMinutes: { not: null } },
    },
    select: {
      id: true,
      adminNotifiedAt: true,
      payment: { select: { autoSendAfterMinutes: true } },
    },
  });

  for (const r of pending) {
    const mins = r.payment.autoSendAfterMinutes;
    if (mins == null || !r.adminNotifiedAt) {
      summary.skipped += 1;
      continue;
    }
    const elapsedMs = now.getTime() - r.adminNotifiedAt.getTime();
    if (elapsedMs < mins * 60 * 1000) {
      summary.skipped += 1;
      continue;
    }
    // admin_notified -> sent is a legal edge; send as the worker (actor null).
    const result = await sendClientReminder(tx, {
      reminderId: r.id,
      actorUserId: null,
    });
    if (result.status === "sent") summary.autoSent += 1;
    else summary.failed += 1;
  }

  return summary;
}

interface CronSummary extends Record<string, unknown> {
  scheduled: number;
  notified: number;
  autoSent: number;
  failed: number;
  skipped: number;
}

/**
 * Cron body: schedule due reminders then run the auto-send policy. Wrapped in
 * a single transaction so a partial failure rolls back cleanly. Exposed for
 * the cron route + manual admin trigger.
 */
export async function runBillingRemindersCron(
  now: Date = new Date(),
): Promise<CronSummary> {
  return prisma.$transaction(async (tx) => {
    const sched = await scheduleDueReminders(tx, now);
    const auto = await autoSendEligibleReminders(tx, now);
    return {
      scheduled: sched.scheduled,
      notified: sched.notified,
      autoSent: auto.autoSent,
      failed: auto.failed,
      skipped: sched.skipped + auto.skipped,
    };
  });
}
