import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned slot for buttons (e.g. New job, filters). */
  actions?: React.ReactNode;
  /** Optional sub-row rendered below the title row (e.g. tabs, filter chips). */
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, actions, meta, className }: Props) {
  return (
    <header className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon className="h-[18px] w-[18px]" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {meta && <div>{meta}</div>}
    </header>
  );
}
