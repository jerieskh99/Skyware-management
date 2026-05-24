interface Props {
  totalMinutes: number | null;
  usedMinutes: number;
  alertThresholdPercent: number;
  currency: string;
  pricePerHour: number | null;
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function BurnRateBar({
  totalMinutes,
  usedMinutes,
  alertThresholdPercent,
  currency,
  pricePerHour,
}: Props) {
  if (totalMinutes === null) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Used: {fmt(usedMinutes)} · Total purchased: TBD</p>
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
            ~{currency} {Math.round((usedMinutes / 60) * pricePerHour).toLocaleString()} used
          </span>
        )}
        {isLow && (
          <span className="font-medium text-red-600">Low balance</span>
        )}
      </div>
    </div>
  );
}
