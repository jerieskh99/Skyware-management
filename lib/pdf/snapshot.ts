import type { CompanySettings, ReceiptDocument } from "@prisma/client";

/**
 * Snapshot of the data required to render a receipt PDF. Captured at the
 * FINALIZE step so subsequent edits to `CompanySettings` (e.g. an admin
 * fixing a typo in the legal name) do NOT rewrite historical documents.
 * Per docs/audit-2026-05-billing/implementation_plan.md §5.2 and
 * docs/audit-2026-05-billing/asking_an_accountant.md §2.8.
 *
 * Drafts do NOT carry a snapshot; the renderer composes one on the fly so a
 * preview always shows the current company header.
 */
export interface ReceiptSnapshot {
  /** ISO datetime when the snapshot was captured (i.e. finalize moment). */
  capturedAt: string;
  company: {
    legalNameEn: string | null;
    legalNameHe: string | null;
    companyNumber: string | null;
    vatNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    /** ISO 3166-1 alpha-2 country code from CompanySettings (e.g. "IL"). */
    country: string;
    email: string | null;
    phone: string | null;
    websiteUrl: string | null;
    receiptFooterEn: string | null;
    receiptFooterHe: string | null;
  };
}

/**
 * Compose a snapshot from the live CompanySettings row. Called at finalize
 * time and as a fallback for drafts that have not yet been finalized.
 */
export function composeSnapshot(company: CompanySettings): ReceiptSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    company: {
      legalNameEn: company.legalNameEn,
      legalNameHe: company.legalNameHe,
      companyNumber: company.companyNumber,
      vatNumber: company.vatNumber,
      addressLine1: company.addressLine1,
      addressLine2: company.addressLine2,
      city: company.city,
      postalCode: company.postalCode,
      country: company.country,
      email: company.email,
      phone: company.phone,
      websiteUrl: company.websiteUrl,
      receiptFooterEn: company.receiptFooterEn,
      receiptFooterHe: company.receiptFooterHe,
    },
  };
}

/**
 * Read the persisted snapshot from a finalized row, or return null if the
 * row has never been finalized (drafts). The caller composes a fresh one on
 * the fly for drafts.
 */
export async function readSnapshotForReceipt(
  receipt: ReceiptDocument,
): Promise<ReceiptSnapshot | null> {
  if (receipt.headerSnapshot) {
    return receipt.headerSnapshot as unknown as ReceiptSnapshot;
  }
  return null;
}
