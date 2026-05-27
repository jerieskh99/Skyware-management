"use client";

import { useT } from "@/lib/i18n/client";

/**
 * Green/amber/red dot + label based on staleness of `lastVerifiedAt`.
 *
 * Thresholds (V1):
 *   - null              => muted ("never verified")
 *   - 0..90 days        => ok    (green)
 *   - 91..180 days      => warn  (amber)
 *   - 181+ days         => stale (red)
 *
 * `thresholdDays` overrides the warn boundary; the stale boundary is 2x.
 */
interface Props {
  lastVerifiedAt: Date | string | null;
  thresholdDays?: number;
  className?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
}

export function VerifiedFreshnessPill({
  lastVerifiedAt,
  thresholdDays = 90,
  className = "",
}: Props) {
  const { t } = useT();

  if (lastVerifiedAt === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ${className}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
        {t("knowledge.detail.summary.neverVerified")}
      </span>
    );
  }

  const dt = typeof lastVerifiedAt === "string" ? new Date(lastVerifiedAt) : lastVerifiedAt;
  const days = daysSince(dt);

  let tone: "ok" | "warn" | "stale" = "ok";
  if (days > 2 * thresholdDays) tone = "stale";
  else if (days > thresholdDays) tone = "warn";

  const STYLES: Record<typeof tone, string> = {
    ok:    "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn:  "border-amber-200 bg-amber-50 text-amber-700",
    stale: "border-red-200 bg-red-50 text-red-700",
  };
  const DOTS: Record<typeof tone, string> = {
    ok:    "bg-emerald-500",
    warn:  "bg-amber-500",
    stale: "bg-red-500",
  };

  const label = t("knowledge.detail.summary.verifiedAgo").replace(
    "{days}",
    String(days),
  );

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STYLES[tone]} ${className}`}
      title={dt.toISOString()}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />
      {label}
    </span>
  );
}
