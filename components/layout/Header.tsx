import type { SessionUser } from "@/lib/permissions";
import { LanguageToggle } from "./LanguageToggle";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlags } from "@/lib/feature-flags";

interface Props {
  user: SessionUser;
}

export async function Header({ user }: Props) {
  const [{ locale, t }, flags] = await Promise.all([
    getT(),
    getFeatureFlags([
      "fts_search_enabled",
      "notifications_enabled",
      "knowledge_articles_enabled",
    ]),
  ]);
  const ftsEnabled = flags["fts_search_enabled"] ?? false;
  const notificationsEnabled = flags["notifications_enabled"] ?? false;
  const knowledgeEnabled = flags["knowledge_articles_enabled"] ?? false;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm">
      <div className="max-w-xl flex-1">
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
