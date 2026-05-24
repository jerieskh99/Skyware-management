import type { Prisma, ReceiptDocument } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { ReceiptStateError } from "./errors";

interface CancelInput {
  id: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Cancel a receipt.
 *   - draft       -> cancelled (with audit)
 *   - cancelled   -> idempotent no-op (returns the existing row)
 *   - finalized   -> ReceiptStateError; per Israeli tax law issue a credit
 *                    note instead.
 */
export async function cancelReceipt(
  tx: Prisma.TransactionClient,
  input: CancelInput,
): Promise<ReceiptDocument> {
  const { id, actorUserId, reason } = input;

  const row = await tx.receiptDocument.findUnique({ where: { id } });
  if (!row) throw new ReceiptStateError("receipt not found");

  if (row.status === "finalized") {
    throw new ReceiptStateError(
      "cannot cancel finalized; issue a credit note instead",
    );
  }
  if (row.status === "cancelled") return row;

  const updated = await tx.receiptDocument.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await writeAudit(tx, {
    actorUserId,
    action: "receipt.cancelled",
    entityType: "ReceiptDocument",
    entityId: id,
    diff: {
      status: { old: row.status, new: "cancelled" },
      ...(reason ? { reason: { old: null, new: reason } } : {}),
    },
  });

  return updated;
}
