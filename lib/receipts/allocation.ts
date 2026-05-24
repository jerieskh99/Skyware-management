import type { AllocationStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
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
 * Israeli Tax Authority allocation-number threshold, in ILS minor units
 * (agorot). Above this amount, tax invoices require a Tax Authority
 * allocation number ("mispar hakzaa"). 25,000 ILS = 2_500_000 agorot is a
 * placeholder until the accountant confirms the exact threshold.
 */
const THRESHOLD_ILS_MINOR = 2_500_000;

/**
 * Compute the allocation status for a receipt.
 *
 * Today this is a stub:
 *   - below threshold or non-ILS  -> { status: "not_required" }
 *   - at or above threshold       -> { status: "pending" } and the row's
 *                                    `allocationStatus` is set to `pending`
 *
 * The real Tax Authority API integration (issuing a `mispar hakzaa`) is a
 * follow-up PR. When implemented, this function will call the external API,
 * await the response, and set `allocationNumber` + transition to `issued`
 * (or `failed`).
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
      currency: true,
      totalAmount: true,
      allocationStatus: true,
    },
  });
  if (!row) throw new ReceiptStateError("receipt not found");

  const total = row.totalAmount ?? 0;
  const needsAllocation =
    row.currency === "ILS" && total >= THRESHOLD_ILS_MINOR;

  if (!needsAllocation) {
    return { status: "not_required" };
  }

  await tx.receiptDocument.update({
    where: { id: receiptId },
    data: { allocationStatus: "pending" },
  });

  await writeAudit(tx, {
    actorUserId,
    action: "receipt.allocation_requested",
    entityType: "ReceiptDocument",
    entityId: receiptId,
    diff: {
      allocationStatus: { old: row.allocationStatus, new: "pending" },
    },
  });

  return { status: "pending" };
}
