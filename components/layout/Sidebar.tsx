"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/permissions";
import { UserMenu } from "./UserMenu";
import {
  LayoutDashboard,
  Briefcase,
  Globe,
  Inbox,
  Building2,
  MessageSquare,
  Receipt,
  BarChart2,
  Bot,
  Settings,
  CreditCard,
  FileText,
  Shield,
  Layers,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Work",
    items: [
      { href: "/my-jobs", label: "My Jobs", icon: Briefcase },
      { href: "/hub", label: "Task Hub", icon: Inbox },
      { href: "/department-jobs", label: "Department", icon: Layers },
      { href: "/global-jobs", label: "Global Jobs", icon: Globe },
    ],
  },
  {
    label: "Communication",
    items: [{ href: "/communication", label: "Channels", icon: MessageSquare }],
  },
  {
    label: "Clients & Billing",
    adminOnly: true,
    items: [
      { href: "/clients", label: "Clients", icon: Building2, adminOnly: true },
      { href: "/billing", label: "Billing", icon: CreditCard, adminOnly: true },
      { href: "/receipts", label: "Receipts", icon: Receipt, adminOnly: true },
      { href: "/financial-documents", label: "Financial Docs", icon: FileText, adminOnly: true },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { href: "/statistics", label: "Statistics", icon: BarChart2, adminOnly: true },
      { href: "/admin", label: "Admin Panel", icon: Shield, adminOnly: true },
      { href: "/agent", label: "Agent Center", icon: Bot, adminOnly: true },
    ],
  },
];

interface Props {
  user: SessionUser;
}

export function Sidebar({ user }: Props) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleGroups = GROUPS.filter((g) => !g.adminOnly || user.isAdmin);

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
            Operations
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto py-3">
        {visibleGroups.map((group, idx) => (
          <div key={group.label} className={cn("px-2", idx > 0 && "mt-3")}>
            {idx > 0 && (
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {group.label}
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
            System
          </p>
          <ul className="space-y-0.5">
            <li>
              <NavLink
                item={{ href: "/settings", label: "Settings", icon: Settings }}
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
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
