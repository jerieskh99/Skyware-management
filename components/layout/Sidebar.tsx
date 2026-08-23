"use client";

import type { SessionUser } from "@/lib/permissions";
import { UserMenu } from "./UserMenu";
import { SidebarNav } from "./SidebarNav";
import { useT } from "@/lib/i18n/client";

interface Props {
  user: SessionUser;
  statisticsMeEnabled?: boolean;
  knowledgeEnabled?: boolean;
  billingRemindersEnabled?: boolean;
}

/**
 * Persistent left sidebar. Hidden below the `lg` breakpoint (the Header's
 * hamburger opens the same nav as an overlay drawer there); shown as a fixed
 * column at `lg+`. The nav list itself lives in {@link SidebarNav} so the
 * desktop rail and the mobile drawer render one shared source.
 */
export function Sidebar({
  user,
  statisticsMeEnabled = false,
  knowledgeEnabled = false,
  billingRemindersEnabled = false,
}: Props) {
  const { t } = useT();

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-e bg-card/80 lg:flex">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-foreground font-semibold text-[13px] tracking-tight">
          S
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-none">Skyware</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("nav.brandTagline")}
          </p>
        </div>
      </div>

      {/* Nav */}
      <SidebarNav
        user={user}
        statisticsMeEnabled={statisticsMeEnabled}
        knowledgeEnabled={knowledgeEnabled}
        billingRemindersEnabled={billingRemindersEnabled}
      />

      {/* User tile */}
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
