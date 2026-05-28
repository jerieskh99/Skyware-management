/**
 * Stable audit action codes for the Wave-2 billing reminders + email +
 * hourly-bank-alert + manual-contact surface.
 *
 * Centralized so:
 *   1. Route handlers and lib functions import the constant rather than
 *      typing a string literal (and risking a typo).
 *   2. Search tools (`grep "billing\\."` over the audit log table) have a
 *      single, exhaustive list to grep against.
 *
 * The action keys are stable forever; existing rows reference them. Adding a
 * new action is fine; renaming or removing one is a migration concern.
 */

export const BILLING_AUDIT_ACTIONS = {
  REMINDER_SCHEDULED: "billing.reminder.scheduled",
  REMINDER_ADMIN_NOTIFIED: "billing.reminder.admin_notified",
  REMINDER_APPROVED: "billing.reminder.approved",
  REMINDER_DELAYED: "billing.reminder.delayed",
  REMINDER_CANCELLED: "billing.reminder.cancelled",
  REMINDER_SENT: "billing.reminder.sent",
  REMINDER_SEND_FAILED: "billing.reminder.send_failed",
  REMINDER_AUTO_SENT: "billing.reminder.auto_sent",
  MANUAL_CONTACT_SENT: "billing.manual_contact.sent",
  HOURLY_BANK_ALERT_FIRED: "billing.hourly_bank.alert_fired",
  EMAIL_TEMPLATE_UPDATED: "billing.email_template.updated",
  PAYMENT_LATENESS_RULE_SET: "billing.payment.lateness_rule_set",
} as const;

export type BillingAuditAction =
  (typeof BILLING_AUDIT_ACTIONS)[keyof typeof BILLING_AUDIT_ACTIONS];
