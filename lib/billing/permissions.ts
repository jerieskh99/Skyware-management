import { isAdmin, type SessionUser } from "@/lib/permissions";

/**
 * Wave-2 billing permission predicates.
 *
 * All three Wave-2 capabilities (reminder management, manual client contact,
 * email-template editing) are admin-only per the implementation rules. Kept
 * as pure predicates so the API route guards and any UI hint share a single
 * source of truth, and so they are unit-testable without a session.
 *
 * UI that hides a control when the user lacks the capability MUST still call
 * the same predicate server-side; the UI is a hint, not a guarantee.
 */

/** Approve / delay / cancel / send reminders. Admin-only. */
export function canManageReminders(user: SessionUser): boolean {
  return isAdmin(user);
}

/** Compose + send an ad-hoc client email. Admin-only. */
export function canSendManualContact(user: SessionUser): boolean {
  return isAdmin(user);
}

/** Edit the bilingual email templates. Admin-only. */
export function canEditEmailTemplates(user: SessionUser): boolean {
  return isAdmin(user);
}
