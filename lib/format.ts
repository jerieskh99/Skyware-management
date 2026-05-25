import { formatInTimeZone } from "date-fns-tz";

/**
 * Display formatters in Asia/Jerusalem. Replaces the legacy `en-GB` shortcuts
 * spread across the billing surface (see docs/audit-2026-05-billing/ux_product_audit.md
 * and implementation_plan.md §5.5).
 *
 * `formatCurrencyILS` accepts minor units (agorot) and returns the localized
 * currency string. `getYearIL` is the year-boundary fix for `reserveNumber`
 * (docs/audit-2026-05-billing/receipts_tax_documents_audit.md §6, bug "year").
 */

const TZ = "Asia/Jerusalem";

/** Format ILS minor units (agorot) as a localized currency string. */
export function formatCurrencyILS(
  minorUnits: number,
  locale: "he" | "en" = "he",
): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Format any minor-unit value with currency code. */
export function formatCurrency(
  minorUnits: number,
  currency: string,
  locale: "he" | "en" = "he",
): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Date-only display in Asia/Jerusalem. */
export function formatDateIL(d: Date, locale: "he" | "en" = "he"): string {
  return formatInTimeZone(d, TZ, locale === "he" ? "dd/MM/yyyy" : "dd MMM yyyy");
}

/** Date + time display in Asia/Jerusalem. */
export function formatDateTimeIL(d: Date, locale: "he" | "en" = "he"): string {
  return formatInTimeZone(
    d,
    TZ,
    locale === "he" ? "dd/MM/yyyy HH:mm" : "dd MMM yyyy HH:mm",
  );
}

/**
 * Get the calendar year for `d` in Asia/Jerusalem.
 *
 * Used by `reserveNumber` so the year-component of a receipt number is the
 * tax-year the document is issued in (Israeli local time), not the host's
 * UTC year. Closes the timezone bug flagged in
 * docs/audit-2026-05-billing/receipts_tax_documents_audit.md.
 */
export function getYearIL(d: Date): number {
  return Number(formatInTimeZone(d, TZ, "yyyy"));
}
