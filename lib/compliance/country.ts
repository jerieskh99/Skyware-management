import type { CountryCode } from "@prisma/client";

/**
 * Country profile selector for the receipts/billing compliance layer.
 *
 * V1 ships only the Israel ("IL") profile. The `_OTHER` placeholder in the
 * Prisma `CountryCode` enum exists so the schema is forward-compatible; the
 * profile loader throws on it so accidental cross-country use crashes loudly
 * rather than silently issuing non-compliant documents.
 *
 * Sources:
 *   docs/audit-2026-05-billing/israel_compliance_audit.md
 *   docs/audit-2026-05-billing/asking_an_accountant.md
 *   docs/audit-2026-05-billing/implementation_plan.md (Section 2)
 */

export type SupportedCountry = "IL";

export interface AllocationThresholdEntry {
  /** Effective from (inclusive), Asia/Jerusalem midnight expressed as UTC. */
  from: Date;
  /** Threshold value in ILS MINOR UNITS (agorot), PRE-VAT. */
  amountMinorUnitsPreVat: number;
}

export interface CountryProfile {
  code: "IL";
  /** Default VAT rate in basis points (e.g. 1800 = 18.00%). */
  defaultVatBasisPoints: number;
  defaultCurrency: "ILS";
  documentLanguageDefault: "he" | "en";
  /** True if `ReceiptDocumentSequence` should reset to 1 each tax year. */
  numberingResetAnnually: boolean;
  /** Required archive retention in years for issued documents. */
  retentionYears: number;
  /** Time-scheduled allocation thresholds (pre-VAT, ILS minor units). */
  allocationThresholdSchedule: AllocationThresholdEntry[];
  /** Document types subject to the allocation threshold at all. */
  allocationAppliesTo: ReadonlyArray<"tax_invoice" | "tax_invoice_receipt">;
  /**
   * Return the active allocation threshold at `at` for `documentType`.
   *   - null when `documentType` is not in `allocationAppliesTo`.
   *   - null when no schedule entry has taken effect yet.
   *   - otherwise the threshold value in ILS minor units, PRE-VAT.
   */
  getAllocationThreshold(at: Date, documentType: string): number | null;
}

export function getCountryProfile(code: CountryCode): CountryProfile {
  if (code === "IL") return IL_PROFILE;
  throw new Error(
    `Country ${code} is not yet supported. Only IL is live in V1; ` +
      "extend lib/compliance/country.ts and provide a full profile to add a new country.",
  );
}

/**
 * Israeli (IL) country profile.
 *
 * VAT rate: 18% in 2026 per `israel_compliance_audit.md` §D.1.
 *
 * Allocation-number thresholds per VAT Implementation Order 01/2025:
 *   - NIS 10,000 (pre-VAT) effective 2026-01-01 Asia/Jerusalem
 *   - NIS 5,000  (pre-VAT) effective 2026-06-01 Asia/Jerusalem
 * Sources cited in `israel_compliance_audit.md` §C and confirmed in
 * `asking_an_accountant.md` §2.2 (threshold base is PRE-VAT, applies only
 * to `tax_invoice` and `tax_invoice_receipt`).
 *
 * Numbering reset and retention duration are flagged "Unverified" in
 * `israel_compliance_audit.md` §B and §G. The conservative defaults below
 * (continuous numbering, 7-year retention) match common Israeli SMB practice
 * and must be reconfirmed by a real CPA before flipping
 * `receipt_finalize_enabled` to true in production.
 */
const IL_PROFILE: CountryProfile = {
  code: "IL",
  // 1800 = 18.00%. israel_compliance_audit.md §D.1.
  defaultVatBasisPoints: 1800,
  defaultCurrency: "ILS",
  documentLanguageDefault: "he",
  // Unverified per asking_an_accountant.md §5 question 1.
  // Defaulting to continuous (per-type, monotonic) numbering is the safer
  // choice until a licensed Israeli CPA confirms annual reset is acceptable.
  numberingResetAnnually: false,
  // Unverified per asking_an_accountant.md §5 question 9; common Israeli
  // SMB retention is 7 years (israel_compliance_audit.md §G).
  retentionYears: 7,
  // VAT Implementation Order 01/2025; see israel_compliance_audit.md §C.
  // Thresholds are PRE-VAT (amountBeforeVat) and apply ONLY to
  // tax_invoice + tax_invoice_receipt; see asking_an_accountant.md §2.2.
  allocationThresholdSchedule: [
    {
      // 2026-01-01 00:00 Asia/Jerusalem (IST, UTC+02:00) -> 2025-12-31 22:00 UTC.
      from: new Date(Date.UTC(2025, 11, 31, 22, 0, 0)),
      amountMinorUnitsPreVat: 10_000_00,
    },
    {
      // 2026-06-01 00:00 Asia/Jerusalem (IDT, UTC+03:00) -> 2026-05-31 21:00 UTC.
      from: new Date(Date.UTC(2026, 4, 31, 21, 0, 0)),
      amountMinorUnitsPreVat: 5_000_00,
    },
  ],
  allocationAppliesTo: ["tax_invoice", "tax_invoice_receipt"] as const,
  getAllocationThreshold(at: Date, documentType: string): number | null {
    if (!this.allocationAppliesTo.includes(documentType as never)) return null;
    let active: number | null = null;
    for (const entry of this.allocationThresholdSchedule) {
      if (at >= entry.from) active = entry.amountMinorUnitsPreVat;
    }
    return active;
  },
};

/**
 * Convenience: resolve the active CompanySettings country, fall back to IL
 * if the singleton row is absent (fresh dev DB before seed runs) or holds
 * an unsupported value. V1 only supports IL.
 */
export function getActiveCountryCode(
  country: CountryCode | null | undefined,
): "IL" {
  if (!country || country !== "IL") return "IL";
  return "IL";
}
