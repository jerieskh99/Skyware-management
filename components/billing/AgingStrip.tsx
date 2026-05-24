import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AgingBuckets } from "@/lib/billing/queries";

interface Props {
  buckets: AgingBuckets;
  hrefFor: (bucket: "0-30" | "31-60" | "61-90" | "91+") => string;
  labels: {
    title: string;
    b0_30: string;
    b31_60: string;
    b61_90: string;
    b91_plus: string;
    count: string;
    amount: string;
    empty: string;
  };
  /** Optional: which bucket is currently active (for highlight). */
  active?: "0-30" | "31-60" | "61-90" | "91+";
}

const CARD_TONE: Record<"green" | "amber" | "orange" | "red", string> = {
  green: "border-border bg-card",
  amber: "border-warn/30 bg-warn-soft/40",
  orange: "border-warn/40 bg-warn-soft/60",
  red: "border-danger/30 bg-danger-soft/40",
};

export function AgingStrip({ buckets, hrefFor, labels, active }: Props) {
  const total =
    buckets.b0_30 + buckets.b31_60 + buckets.b61_90 + buckets.b91_plus;
  if (total === 0) {
    return (
      <section className="rounded-xl border bg-card px-4 py-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {labels.title}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{labels.empty}</p>
      </section>
    );
  }

  const cells: Array<{ key: "0-30" | "31-60" | "61-90" | "91+"; label: string; count: number; amount: number; tone: keyof typeof CARD_TONE }> = [
    { key: "0-30", label: labels.b0_30, count: buckets.b0_30, amount: buckets.b0_30Amount, tone: "green" },
    { key: "31-60", label: labels.b31_60, count: buckets.b31_60, amount: buckets.b31_60Amount, tone: "amber" },
    { key: "61-90", label: labels.b61_90, count: buckets.b61_90, amount: buckets.b61_90Amount, tone: "orange" },
    { key: "91+", label: labels.b91_plus, count: buckets.b91_plus, amount: buckets.b91_plusAmount, tone: "red" },
  ];

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {labels.title}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => {
          const isActive = active === c.key;
          return (
            <Link
              key={c.key}
              href={hrefFor(c.key)}
              className={cn(
                "block rounded-xl border p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.02)] transition-colors",
                CARD_TONE[c.tone],
                "hover:bg-accent/40",
                isActive && "ring-2 ring-ring",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {c.label}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className="text-2xl font-semibold leading-none">{c.count}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="sr-only">{labels.amount}: </span>
                  {c.amount > 0 ? c.amount.toLocaleString() : "—"}
                </p>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {labels.count}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
