import type { Prisma, ReceiptDocument } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { ReceiptStateError } from "./errors";

interface CreditNoteInput {
  sourceReceiptId: string;
  actorUserId: string;
}

/**
 * Issue a credit note against a finalized receipt.
 *   - The source must exist and be `finalized` (credit-noting drafts is
 *     a state error; cancel the draft instead).
 *   - The new row is a `credit_note` in `draft` status with totals negated.
 *   - `creditedReceiptId` links back to the source for audit/reporting.
 *   - Numbering, exchange-rate, and finalize happen via `finalizeReceipt`
 *     as a separate step.
 */
export async function issueCreditNote(
  tx: Prisma.TransactionClient,
  input: CreditNoteInput,
): Promise<ReceiptDocument> {
  const { sourceReceiptId, actorUserId } = input;

  const source = await tx.receiptDocument.findUnique({
    where: { id: sourceReceiptId },
  });
  if (!source) throw new ReceiptStateError("source receipt not found");
  if (source.status !== "finalized") {
    throw new ReceiptStateError("can only credit-note a finalized receipt");
  }

  const negate = (n: number | null) => (n === null ? null : -n);

  const created = await tx.receiptDocument.create({
    data: {
      type: "credit_note",
      clientId: source.clientId,
      paymentId: source.paymentId,
      issueDate: new Date(),
      descriptionLines: source.descriptionLines as Prisma.InputJsonValue,
      amountBeforeVat: negate(source.amountBeforeVat),
      vatRateBasisPoints: source.vatRateBasisPoints,
      vatAmount: negate(source.vatAmount),
      totalAmount: negate(source.totalAmount),
      currency: source.currency,
      language: source.language,
      creditedReceiptId: source.id,
    },
  });

  await writeAudit(tx, {
    actorUserId,
    action: "receipt.credit_note_issued",
    entityType: "ReceiptDocument",
    entityId: created.id,
    diff: {
      sourceReceiptId: { old: null, new: source.id },
    },
  });

  return created;
}
