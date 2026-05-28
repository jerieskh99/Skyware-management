import type { Prisma } from "@prisma/client";
import { getFeatureFlag } from "@/lib/feature-flags";

/**
 * Notification trigger helpers for the Wave-2 billing surface.
 *
 * Mirrors `lib/notifications/triggers.ts` and
 * `lib/knowledge/notification-triggers.ts`: each helper is a no-op when the
 * `notifications_enabled` feature flag is off, and writes go through the
 * caller-supplied transaction so the rows commit in lockstep with the
 * originating mutation.
 *
 * Three Wave-2 notification kinds (added to the `NotificationKind` enum in the
 * Wave-2 migration):
 *   - `payment_reminder_pending_review` -> one row per admin, links to the queue
 *   - `hourly_bank_low`                 -> one row per admin, links to the client
 *   - `manual_contact_sent`             -> one row to the acting admin
 *
 * Clients have no portal login, so the client-facing side of these flows is an
 * email (handled by `lib/email/transport.ts`), not a Notification row.
 */

const FLAG_KEY = "notifications_enabled";

interface ReminderPendingReviewArgs {
  /** Admins to notify. Fans out one row each. */
  adminUserIds: string[];
  reminderId: string;
  paymentId: string;
  clientName: string;
  paymentPublicNumber: string;
  daysOverdue: number;
}

/**
 * Fired when the reminder worker schedules a reminder and notifies admins to
 * review it before the client email goes out. One row per admin.
 */
export async function notifyAdminsReminderPendingReview(
  tx: Prisma.TransactionClient,
  args: ReminderPendingReviewArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  const recipients = Array.from(new Set(args.adminUserIds.filter(Boolean)));
  if (recipients.length === 0) return;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: "payment_reminder_pending_review" as const,
      payload: {
        reminderId: args.reminderId,
        paymentId: args.paymentId,
        clientName: args.clientName,
        paymentPublicNumber: args.paymentPublicNumber,
        daysOverdue: args.daysOverdue,
      } satisfies Prisma.InputJsonValue,
      link: `/billing/reminders/${args.reminderId}`,
    })),
  });
}

interface ReminderOutcomeArgs {
  adminUserIds: string[];
  reminderId: string;
  paymentId: string;
  clientName: string;
  paymentPublicNumber: string;
  /** "sent" | "send_failed" | "auto_sent" — drives the message the UI renders. */
  outcome: "sent" | "send_failed" | "auto_sent";
  failureReason?: string | null;
}

/**
 * Fired after a client reminder send attempt so admins see the outcome. Reuses
 * the `payment_reminder_pending_review` kind (the only billing-reminder kind on
 * the enum) with an `outcome` field in the payload; the UI narrows on it.
 */
export async function notifyAdminsReminderOutcome(
  tx: Prisma.TransactionClient,
  args: ReminderOutcomeArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  const recipients = Array.from(new Set(args.adminUserIds.filter(Boolean)));
  if (recipients.length === 0) return;

  const payload: Record<string, unknown> = {
    reminderId: args.reminderId,
    paymentId: args.paymentId,
    clientName: args.clientName,
    paymentPublicNumber: args.paymentPublicNumber,
    outcome: args.outcome,
  };
  if (args.failureReason) payload["failureReason"] = args.failureReason;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: "payment_reminder_pending_review" as const,
      payload: payload as Prisma.InputJsonValue,
      link: `/billing/reminders/${args.reminderId}`,
    })),
  });
}

interface HourlyBankLowArgs {
  adminUserIds: string[];
  hourlyBankId: string;
  clientId: string;
  clientName: string;
  consumedPercent: number;
}

/**
 * Fired when an hourly bank crosses its low-balance threshold. Admins get a
 * dashboard notification; the client gets an email (handled by the caller).
 */
export async function notifyAdminsHourlyBankLow(
  tx: Prisma.TransactionClient,
  args: HourlyBankLowArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  const recipients = Array.from(new Set(args.adminUserIds.filter(Boolean)));
  if (recipients.length === 0) return;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: "hourly_bank_low" as const,
      payload: {
        hourlyBankId: args.hourlyBankId,
        clientId: args.clientId,
        clientName: args.clientName,
        consumedPercent: args.consumedPercent,
      } satisfies Prisma.InputJsonValue,
      link: `/clients/${args.clientId}`,
    })),
  });
}

interface ManualContactSentArgs {
  /** The admin who sent the contact; receives the confirmation row. */
  actorUserId: string;
  clientId: string;
  clientName: string;
  emailLogId: string;
  testMode: boolean;
}

/** Fired to the acting admin after a manual contact email is queued/sent. */
export async function notifyManualContactSent(
  tx: Prisma.TransactionClient,
  args: ManualContactSentArgs,
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;

  await tx.notification.create({
    data: {
      userId: args.actorUserId,
      kind: "manual_contact_sent",
      payload: {
        clientId: args.clientId,
        clientName: args.clientName,
        emailLogId: args.emailLogId,
        testMode: args.testMode,
      } satisfies Prisma.InputJsonValue,
      link: `/clients/${args.clientId}`,
    },
  });
}
