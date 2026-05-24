import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  count?: number;
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Right-aligned action slot in the section header. */
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  count,
  seeAllHref,
  seeAllLabel = "View all",
  actions,
  className,
  bodyClassName,
  children,
}: Props) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-none flex items-center gap-2">
              <span className="truncate">{title}</span>
              {typeof count === "number" && count > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {count}
                </span>
              )}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {seeAllHref && typeof count === "number" && count > 0 && (
            <Link
              href={seeAllHref}
              className="text-xs font-medium text-brand hover:underline"
            >
              {seeAllLabel}
            </Link>
          )}
        </div>
      </header>
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
