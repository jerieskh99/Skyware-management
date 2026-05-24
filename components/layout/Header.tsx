import { cookies } from "next/headers";
import type { Locale } from "@/lib/i18n";
import type { SessionUser } from "@/lib/permissions";
import { LanguageToggle } from "./LanguageToggle";
import { GlobalSearch } from "./GlobalSearch";

interface Props {
  user: SessionUser;
}

export async function Header({ user }: Props) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value ?? "en") as Locale;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm">
      <div className="max-w-xl flex-1">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LanguageToggle currentLocale={locale} />
        {user.isAdmin && (
          <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            Admin
          </span>
        )}
      </div>
    </header>
  );
}
