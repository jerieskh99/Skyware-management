import type { PaymentReminderStatus } from "@prisma/client";

/**
 * Payment-reminder state machine.
 *
 * Encodes the lifecycle of a single `PaymentReminder` row. Every mutation that
 * changes `PaymentReminder.status` must route through `isAllowedReminderTransition`.
 * The `who`/policy axis (admin vs worker) is enforced by callers in
 * `lib/billing/reminders.ts` + `lib/billing/permissions.ts`; this module only
 * asserts the legality of the `(from, to)` edge so it is trivially unit-testable
 * without a session or a database.
 *
 * Allowed transitions (Wave-2 brief §4):
 *   - scheduled       -> admin_notified   (worker fans the review notice out)
 *   - admin_notified  -> approved         (admin approves, worker/admin sends)
 *   - admin_notified  -> delayed          (admin pushes scheduledFor forward)
 *   - admin_notified  -> cancelled        (admin cancels)
 *   - admin_notified  -> sent             (admin "send now" OR auto-send policy)
 *   - approved        -> sent             (worker or admin sends the client email)
 *   - approved        -> cancelled        (admin cancels before send)
 *   - delayed         -> admin_notified   (worker re-notifies when the new date arrives)
 *   - delayed         -> cancelled        (admin escape hatch: cancel a delayed reminder
 *                                          without waiting for the re-notification cron)
 *
 * `send_failed` and `bounced` are terminal OUTCOMES recorded at send-attempt
 * time on the same row; they are NOT modeled as transitions here. A failed
 * send writes `status = send_failed` directly from the send path. `bounced`
 * is reserved for a future delivery-webhook integration.
 */

export interface ReminderTransitionRule {
  from: PaymentReminderStatus;
  to: PaymentReminderStatus;
}

export const ALLOWED_REMINDER_TRANSITIONS: ReadonlyArray<ReminderTransitionRule> =
  [
    { from: "scheduled", to: "admin_notified" },
    { from: "admin_notified", to: "approved" },
    { from: "admin_notified", to: "delayed" },
    { from: "admin_notified", to: "cancelled" },
    { from: "admin_notified", to: "sent" },
    { from: "approved", to: "sent" },
    { from: "approved", to: "cancelled" },
    { from: "delayed", to: "admin_notified" },
    { from: "delayed", to: "cancelled" },
  ];

const TRANSITION_INDEX: ReadonlySet<string> = new Set(
  ALLOWED_REMINDER_TRANSITIONS.map((r) => `${r.from}:${r.to}`),
);

function key(from: PaymentReminderStatus, to: PaymentReminderStatus): string {
  return `${from}:${to}`;
}

/** True iff `(from, to)` is an explicitly modeled reminder transition. */
export function isAllowedReminderTransition(
  from: PaymentReminderStatus,
  to: PaymentReminderStatus,
): boolean {
  return TRANSITION_INDEX.has(key(from, to));
}

/** All statuses reachable in one transition from `from`. Stable order. */
export function nextReminderStates(
  from: PaymentReminderStatus,
): PaymentReminderStatus[] {
  const out: PaymentReminderStatus[] = [];
  for (const rule of ALLOWED_REMINDER_TRANSITIONS) {
    if (rule.from === from) out.push(rule.to);
  }
  return out;
}

/** Terminal states — no outgoing transitions. */
export function isTerminalReminderState(
  status: PaymentReminderStatus,
): boolean {
  return nextReminderStates(status).length === 0;
}
