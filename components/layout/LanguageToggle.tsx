"use client";

import { useRouter } from "next/navigation";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";

interface Props {
  currentLocale: Locale;
}

export function LanguageToggle({ currentLocale }: Props) {
  const router = useRouter();

  function handleChange(locale: Locale) {
    document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          onClick={() => handleChange(locale)}
          className={`rounded px-2 py-1 transition-colors hover:bg-accent ${
            locale === currentLocale
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground"
          }`}
          aria-label={`Switch to ${LOCALE_LABELS[locale]}`}
          aria-pressed={locale === currentLocale}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
