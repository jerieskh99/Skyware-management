import type { PaymentStatus } from "@prisma/client";

/**
 * Payment status transition matrix per the billing audit
 * (docs/audit-2026-05-billing/billing_audit.md) and the matrix already used
 * client-side in MarkPaidSheet. The map is the single source of truth that
 * the PATCH /api/billing/payments/[id] route consults; mirror any future
 * change in the UI.
 *
 * Pattern mirrors lib/jobs/lifecycle.ts: terminal states resolve to an
 * empty array of legal next states.
 */
const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  draft:               ["sent_to_client", "cancelled"],
  sent_to_client:      ["waiting_for_payment", "cancelled", "draft"],
  waiting_for_payment: ["partially_paid", "paid", "overdue", "cancelled"],
  partially_paid:      ["paid", "overdue", "cancelled"],
  paid:                [], // terminal
  cancelled:           [], // terminal
  overdue:             ["partially_paid", "paid", "cancelled"],
};

/**
 * True when `to` is the same as `from` (no-op) or when `to` is one of the
 * legal next states for `from`. Terminal states reject every outgoing
 * transition except the no-op.
 */
export function isAllowedTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

/**
 * The current status plus every legal next status. Useful for UI surfaces
 * that need to render a select of legal targets.
 */
export function nextStates(from: PaymentStatus): PaymentStatus[] {
  return [from, ...(ALLOWED[from] ?? [])];
}
