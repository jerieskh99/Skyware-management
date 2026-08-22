import type { Locale } from "@/lib/i18n";
import { formatCurrency, formatCurrencyILS, formatDateIL } from "@/lib/format";
import type { MonthlyBillingStatus } from "@prisma/client";

export function fmtDate(d: string | Date | null, locale: Locale) {
  if (!d) return "—";
  return formatDateIL(new Date(d), locale);
}

export function fmtAmount(amount: number | null, currency: string, locale: Locale) {
  if (amount === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(amount, locale);
  return formatCurrency(amount, currency, locale);
}

export const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const statusBadge: Record<MonthlyBillingStatus, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  none: "bg-muted text-muted-foreground border-border",
};
