import { formatCurrency, formatCurrencyILS } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

interface Props {
  totalMinutes: number | null;
  usedMinutes: number;
  alertThresholdPercent: number;
  currency: string;
  pricePerHour: number | null;
  /** Optional locale for currency formatting. Defaults to "he". */
  locale?: Locale;
  /**
   * Optional burn-rate projection. When present, an additional one-line row is
   * appended showing avg minutes/month and projected months remaining. Pass
   * `null` for `projectedMonthsRemaining` when avg is zero. Labels are passed
   * in to keep the component i18n-agnostic.
   */
  burn?: {
    avgMonthlyMinutes: number;
    projectedMonthsRemaining: number | null;
    labels: {
      avgMonthly: string;
      monthsRemaining: string;
      monthsRemainingNa: string;
    };
  };
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtMonths(m: number | null, naLabel: string): string {
  if (m === null) return naLabel;
  if (m < 0.1) return "< 0.1";
  return m.toFixed(1);
}

export function BurnRateBar({
  totalMinutes,
  usedMinutes,
  alertThresholdPercent,
  currency,
  pricePerHour,
  burn,
  locale = "he",
}: Props) {
  if (totalMinutes === null) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Used: {fmt(usedMinutes)} · Total purchased: TBD</p>
        {burn && (
          <p className="text-[11px] text-muted-foreground">
            {burn.labels.avgMonthly}: {fmt(Math.round(burn.avgMonthlyMinutes))}
            {" · "}
            {burn.labels.monthsRemaining}: {fmtMonths(burn.projectedMonthsRemaining, burn.labels.monthsRemainingNa)}
          </p>
        )}
      </div>
    );
  }

  const remaining = Math.max(0, totalMinutes - usedMinutes);
  const pct = totalMinutes > 0 ? Math.round((remaining / totalMinutes) * 100) : 0;
  const isLow = pct <= alertThresholdPercent;

  const barColor = isLow
    ? "bg-red-500"
    : pct <= 50
    ? "bg-amber-500"
    : "bg-green-500";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {fmt(remaining)} remaining of {fmt(totalMinutes)}
        </span>
        <span className={isLow ? "font-semibold text-red-600" : ""}>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>Used: {fmt(usedMinutes)}</span>
        {pricePerHour !== null && (
          <span>
            ~{
              currency === "ILS"
                ? formatCurrencyILS(Math.round((usedMinutes / 60) * pricePerHour), locale)
                : formatCurrency(Math.round((usedMinutes / 60) * pricePerHour), currency, locale)
            } used
          </span>
        )}
        {isLow && (
          <span className="font-medium text-red-600">Low balance</span>
        )}
      </div>
      {burn && (
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {burn.labels.avgMonthly}: {fmt(Math.round(burn.avgMonthlyMinutes))}
          </span>
          <span>
            {burn.labels.monthsRemaining}: {fmtMonths(burn.projectedMonthsRemaining, burn.labels.monthsRemainingNa)}
          </span>
        </div>
      )}
    </div>
  );
}
