import type { Prisma, ReceiptDocument, ReceiptDocumentType } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getYearIL } from "@/lib/format";
import { composeSnapshot } from "@/lib/pdf/snapshot";
import { SINGLETON_ID as COMPANY_SETTINGS_ID } from "@/lib/company-settings/queries";
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

  // VAT rate consistency: vatAmount must equal round(before * rate / 10000)
  // within +/- one minor unit (agorot) for legitimate rounding. The DB-level
  // `receipt_finalized_vat_sum_chk` only verifies the additive identity; this
  // application-layer guard verifies the multiplicative one. See
  // docs/audit-2026-05-billing/receipts_tax_documents_audit.md §7.4 and
  // docs/audit-2026-05-billing/asking_an_accountant.md §2.7.
  if (
    row.amountBeforeVat != null &&
    row.vatAmount != null &&
    row.vatRateBasisPoints != null
  ) {
    const expectedVat = Math.round(
      (row.amountBeforeVat * row.vatRateBasisPoints) / 10000,
    );
    if (Math.abs(expectedVat - row.vatAmount) > 1) {
      throw new ReceiptValidationError(
        `vat amount inconsistent with rate: expected ${expectedVat} got ${row.vatAmount}`,
      );
    }
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

  // Snapshot the live CompanySettings into the receipt so future edits to
  // the company header do not rewrite historical PDFs. See
  // docs/audit-2026-05-billing/implementation_plan.md §5.2 and
  // docs/audit-2026-05-billing/asking_an_accountant.md §2.8.
  const companySettings = await tx.companySettings.findUnique({
    where: { id: COMPANY_SETTINGS_ID },
  });
  if (!companySettings) {
    throw new ReceiptValidationError(
      "company settings missing; configure under /admin?tab=company before finalizing",
    );
  }
  const snapshot = composeSnapshot(companySettings);

  const finalized = await tx.receiptDocument.update({
    where: { id },
    data: {
      status: "finalized",
      documentNumber: nextNumber,
      documentNumberYear: year,
      finalizedAt: new Date(),
      finalizedByUserId: actorUserId,
      headerSnapshot: snapshot as unknown as Prisma.InputJsonValue,
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
  // Read year in Asia/Jerusalem so a UTC-hosted server filing a finalize at
  // 01:30 IST on Jan 1 records the row under the new local year, not the
  // previous UTC year. See docs/audit-2026-05-billing/receipts_tax_documents_audit.md
  // (bug "reserveNumber uses local TZ year") and asking_an_accountant.md §2.4.
  const year = getYearIL(new Date());

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
