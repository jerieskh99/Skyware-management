"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/permissions";
import { UserMenu } from "./UserMenu";
import { useT } from "@/lib/i18n/client";
import {
  LayoutDashboard,
  Briefcase,
  Globe,
  Inbox,
  Building2,
  MessageSquare,
  Receipt,
  BarChart2,
  BookOpen,
  Bot,
  Settings,
  CreditCard,
  FileText,
  Shield,
  Layers,
} from "lucide-react";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groupOverview",
    items: [{ href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "nav.groupWork",
    items: [
      { href: "/my-jobs", labelKey: "nav.myJobs", icon: Briefcase },
      { href: "/hub", labelKey: "nav.hub", icon: Inbox },
      { href: "/department-jobs", labelKey: "nav.departmentJobsShort", icon: Layers },
      { href: "/global-jobs", labelKey: "nav.globalJobs", icon: Globe },
    ],
  },
  {
    labelKey: "nav.groupCommunication",
    items: [
      { href: "/communication", labelKey: "nav.channels", icon: MessageSquare },
      { href: "/knowledge", labelKey: "nav.knowledge", icon: BookOpen },
    ],
  },
  {
    labelKey: "nav.groupClientsBilling",
    adminOnly: true,
    items: [
      { href: "/clients", labelKey: "nav.clients", icon: Building2, adminOnly: true },
      { href: "/billing", labelKey: "nav.billing", icon: CreditCard, adminOnly: true },
      { href: "/receipts", labelKey: "nav.receipts", icon: Receipt, adminOnly: true },
      { href: "/financial-documents", labelKey: "nav.financialDocumentsShort", icon: FileText, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.groupAdmin",
    adminOnly: true,
    items: [
      { href: "/statistics", labelKey: "nav.statistics", icon: BarChart2, adminOnly: true },
      { href: "/admin", labelKey: "nav.admin", icon: Shield, adminOnly: true },
      { href: "/agent", labelKey: "nav.agentShort", icon: Bot, adminOnly: true },
    ],
  },
];

interface Props {
  user: SessionUser;
  statisticsMeEnabled?: boolean;
  knowledgeEnabled?: boolean;
}

export function Sidebar({
  user,
  statisticsMeEnabled = false,
  knowledgeEnabled = false,
}: Props) {
  const pathname = usePathname();
  const { t } = useT();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Employees get a personal "My Statistics" entry under Overview when the
  // statistics_me_enabled flag is on. Admins already have /statistics in the
  // Admin group, so they do not see this duplicate.
  const groups: NavGroup[] = GROUPS.map((g) => {
    if (g.labelKey === "nav.groupOverview" && !user.isAdmin && statisticsMeEnabled) {
      return {
        ...g,
        items: [
          ...g.items,
          { href: "/statistics/me", labelKey: "nav.myStatistics", icon: BarChart2 },
        ],
      };
    }
    if (g.labelKey === "nav.groupCommunication" && !knowledgeEnabled) {
      return {
        ...g,
        items: g.items.filter((it) => it.href !== "/knowledge"),
      };
    }
    return g;
  });

  const visibleGroups = groups.filter((g) => !g.adminOnly || user.isAdmin);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-e bg-card/80">
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
      <nav className="scrollbar-thin flex-1 overflow-y-auto py-3">
        {visibleGroups.map((group, idx) => (
          <div key={group.labelKey} className={cn("px-2", idx > 0 && "mt-3")}>
            {idx > 0 && (
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {t(group.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items
                .filter((it) => !it.adminOnly || user.isAdmin)
                .map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(item.href)} />
                  </li>
                ))}
            </ul>
          </div>
        ))}

        <div className="mt-3 px-2">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            {t("nav.groupSystem")}
          </p>
          <ul className="space-y-0.5">
            <li>
              <NavLink
                item={{ href: "/settings", labelKey: "nav.settings", icon: Settings }}
                active={isActive("/settings")}
              />
            </li>
          </ul>
        </div>
      </nav>

      {/* User tile */}
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const { t } = useT();
  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-brand-soft text-brand font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute start-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "")} />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}
