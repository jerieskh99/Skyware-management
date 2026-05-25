import type { AllocationStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import {
  getActiveCountryCode,
  getCountryProfile,
} from "@/lib/compliance/country";
import { ReceiptStateError } from "./errors";

interface RequestAllocationInput {
  receiptId: string;
  actorUserId: string;
}

interface RequestAllocationResult {
  status: AllocationStatus;
  allocationNumber?: string;
}

/**
 * Compute the allocation status for a receipt against the active country
 * profile's threshold schedule.
 *
 * Israel-specific rules (see docs/audit-2026-05-billing/israel_compliance_audit.md §C
 * and docs/audit-2026-05-billing/asking_an_accountant.md §2.2):
 *   - Threshold applies ONLY to `tax_invoice` and `tax_invoice_receipt`.
 *     Generic receipts, plain invoices, credit notes, and proformas always
 *     resolve to `not_required`.
 *   - Threshold compares against the PRE-VAT amount (`amountBeforeVat`),
 *     not the gross total.
 *   - Threshold value depends on the receipt's `issueDate`: NIS 10,000 from
 *     2026-01-01 Asia/Jerusalem, NIS 5,000 from 2026-06-01 Asia/Jerusalem.
 *
 * Today this is still a state-marking stub:
 *   - `not_required` -> persisted with no further side-effects.
 *   - `pending`      -> persisted; the real SHAAM HTTP call is Phase 5.
 *
 * The function is idempotent on rows already in `issued`.
 */
export async function requestAllocationNumber(
  tx: Prisma.TransactionClient,
  input: RequestAllocationInput,
): Promise<RequestAllocationResult> {
  const { receiptId, actorUserId } = input;

  const row = await tx.receiptDocument.findUnique({
    where: { id: receiptId },
    select: {
      id: true,
      type: true,
      amountBeforeVat: true,
      issueDate: true,
      allocationStatus: true,
    },
  });
  if (!row) throw new ReceiptStateError("receipt not found");

  if (row.allocationStatus === "issued") {
    return { status: "issued" };
  }

  const settings = await tx.companySettings.findFirst({
    select: { country: true },
  });
  const profile = getCountryProfile(getActiveCountryCode(settings?.country));

  const threshold = profile.getAllocationThreshold(row.issueDate, row.type);
  // null -> document type is not subject to allocation in this country.
  if (threshold === null) {
    await markStatus(tx, {
      receiptId,
      actorUserId,
      oldStatus: row.allocationStatus,
      newStatus: "not_required",
    });
    return { status: "not_required" };
  }

  const preVat = row.amountBeforeVat ?? 0;
  if (preVat < threshold) {
    await markStatus(tx, {
      receiptId,
      actorUserId,
      oldStatus: row.allocationStatus,
      newStatus: "not_required",
    });
    return { status: "not_required" };
  }

  // Threshold reached - mark pending. Real SHAAM API call is Phase 5
  // (israel_compliance_audit.md §C; production endpoint stays locked behind
  // ALLOW_PRODUCTION_ISSUANCE per asking_an_accountant.md §7).
  await markStatus(tx, {
    receiptId,
    actorUserId,
    oldStatus: row.allocationStatus,
    newStatus: "pending",
  });
  return { status: "pending" };
}

interface MarkStatusInput {
  receiptId: string;
  actorUserId: string;
  oldStatus: AllocationStatus;
  newStatus: AllocationStatus;
}

/**
 * Persist a transition on `allocationStatus` and write the audit row only when
 * the value actually changes. Avoids audit churn for idempotent re-checks.
 */
async function markStatus(
  tx: Prisma.TransactionClient,
  { receiptId, actorUserId, oldStatus, newStatus }: MarkStatusInput,
): Promise<void> {
  if (oldStatus === newStatus) return;
  await tx.receiptDocument.update({
    where: { id: receiptId },
    data: { allocationStatus: newStatus },
  });
  await writeAudit(tx, {
    actorUserId,
    action: "receipt.allocation_requested",
    entityType: "ReceiptDocument",
    entityId: receiptId,
    diff: {
      allocationStatus: { old: oldStatus, new: newStatus },
    },
  });
}
