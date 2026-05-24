import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "default" | "warn" | "danger" | "success" | "brand";

interface Props {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}

const TONE: Record<Tone, { wrap: string; value: string; icon: string; chip: string }> = {
  default: {
    wrap: "border-border bg-card",
    value: "text-foreground",
    icon: "bg-muted text-muted-foreground",
    chip: "text-muted-foreground",
  },
  brand: {
    wrap: "border-border bg-card",
    value: "text-foreground",
    icon: "bg-brand-soft text-brand",
    chip: "text-brand",
  },
  warn: {
    wrap: "border-warn/30 bg-warn-soft/60",
    value: "text-foreground",
    icon: "bg-warn/15 text-warn",
    chip: "text-warn",
  },
  danger: {
    wrap: "border-danger/30 bg-danger-soft/60",
    value: "text-foreground",
    icon: "bg-danger/15 text-danger",
    chip: "text-danger",
  },
  success: {
    wrap: "border-success/25 bg-success-soft/60",
    value: "text-foreground",
    icon: "bg-success/15 text-success",
    chip: "text-success",
  },
};

export function KpiCard({ label, value, note, href, icon: Icon, tone = "default", className }: Props) {
  const t = TONE[tone];

  const inner = (
    <div
      className={cn(
        "group relative flex items-center gap-4 rounded-xl border p-4 shadow-[0_1px_0_0_rgba(0,0,0,0.02)] transition-colors",
        t.wrap,
        href && "hover:bg-accent/40",
        className
      )}
    >
      {Icon && (
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", t.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight leading-none", t.value)}>
          {value}
        </p>
        {note && <p className={cn("mt-1 text-xs", t.chip)}>{note}</p>}
      </div>
    </div>
  );

  if (href) return <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">{inner}</Link>;
  return inner;
}
