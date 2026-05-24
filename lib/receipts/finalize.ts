import type { Prisma, ReceiptDocument, ReceiptDocumentType } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { ReceiptStateError, ReceiptValidationError } from "./errors";

interface FinalizeInput {
  id: string;
  actorUserId: string;
}

/**
 * Finalize a draft receipt.
 *   - Status must be `draft`; otherwise `ReceiptStateError`.
 *   - Totals must satisfy `totalAmount = amountBeforeVat + vatAmount`.
 *   - Non-ILS currency requires `exchangeRate`.
 *   - A public number is reserved atomically via `ReceiptDocumentSequence`.
 *   - Writes an audit row `receipt.finalized`.
 *
 * The caller MUST pass a `Prisma.TransactionClient`. The DB check constraints
 * (`receipt_finalized_vat_sum_chk`, `receipt_finalized_exchange_rate_chk`)
 * back these invariants.
 */
export async function finalizeReceipt(
  tx: Prisma.TransactionClient,
  input: FinalizeInput,
): Promise<ReceiptDocument> {
  const { id, actorUserId } = input;

  const row = await tx.receiptDocument.findUnique({ where: { id } });
  if (!row) throw new ReceiptStateError("receipt not found");
  if (row.status !== "draft") {
    throw new ReceiptStateError("must be draft");
  }

  if (
    row.totalAmount === null ||
    row.amountBeforeVat === null ||
    row.vatAmount === null ||
    row.totalAmount !== row.amountBeforeVat + row.vatAmount
  ) {
    throw new ReceiptValidationError("vat sum mismatch");
  }

  if (row.currency !== "ILS" && row.exchangeRate === null) {
    throw new ReceiptValidationError("exchange rate required");
  }

  const { year, nextNumber } = await reserveNumber(tx, row.type);

  const finalized = await tx.receiptDocument.update({
    where: { id },
    data: {
      status: "finalized",
      documentNumber: nextNumber,
      documentNumberYear: year,
      finalizedAt: new Date(),
      finalizedByUserId: actorUserId,
    },
  });

  await writeAudit(tx, {
    actorUserId,
    action: "receipt.finalized",
    entityType: "ReceiptDocument",
    entityId: id,
    diff: {
      status: { old: "draft", new: "finalized" },
      documentNumber: { old: row.documentNumber, new: nextNumber },
      documentNumberYear: { old: row.documentNumberYear, new: year },
    },
  });

  return finalized;
}

/**
 * Reserve the next number for `(type, year)` inside the same transaction.
 * Uses an upsert + increment on the `ReceiptDocumentSequence` table; the row
 * lock from the increment is sufficient under READ COMMITTED to avoid races
 * because the surrounding transaction holds the row until commit.
 *
 * Per spec, finalized numbers must never have gaps. If finalize fails after
 * this point the surrounding tx rolls back and the sequence does not advance.
 */
async function reserveNumber(
  tx: Prisma.TransactionClient,
  type: ReceiptDocumentType,
): Promise<{ year: number; nextNumber: number }> {
  const year = new Date().getFullYear();

  const seq = await tx.receiptDocumentSequence.upsert({
    where: { type_year: { type, year } },
    create: { type, year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });

  // `nextNumber` after upsert holds the value AFTER the increment (or `2` on
  // create). The number we are issuing is `nextNumber - 1`.
  const issued = seq.nextNumber - 1;
  return { year, nextNumber: issued };
}
