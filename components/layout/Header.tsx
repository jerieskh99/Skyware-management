import type { SessionUser } from "@/lib/permissions";
import { LanguageToggle } from "./LanguageToggle";
import { GlobalSearch } from "./GlobalSearch";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlags } from "@/lib/feature-flags";

interface Props {
  user: SessionUser;
  /** Nav feature flags, forwarded to the mobile drawer so it mirrors the sidebar. */
  statisticsMeEnabled?: boolean;
  knowledgeEnabled?: boolean;
  billingRemindersEnabled?: boolean;
}

export async function Header({
  user,
  statisticsMeEnabled = false,
  knowledgeEnabled = false,
  billingRemindersEnabled = false,
}: Props) {
  const [{ locale, t }, flags] = await Promise.all([
    getT(),
    getFeatureFlags(["fts_search_enabled", "notifications_enabled"]),
  ]);
  const ftsEnabled = flags["fts_search_enabled"] ?? false;
  const notificationsEnabled = flags["notifications_enabled"] ?? false;

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm">
      <MobileNav
        user={user}
        statisticsMeEnabled={statisticsMeEnabled}
        knowledgeEnabled={knowledgeEnabled}
        billingRemindersEnabled={billingRemindersEnabled}
      />

      <div className="min-w-0 max-w-xl flex-1">
        <GlobalSearch
          ftsEnabled={ftsEnabled}
          isAdmin={user.isAdmin}
          knowledgeEnabled={knowledgeEnabled}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell featureEnabled={notificationsEnabled} />
        <LanguageToggle currentLocale={locale} />
        {user.isAdmin && (
          <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            {t("nav.adminBadge")}
          </span>
        )}
      </div>
    </header>
  );
}
