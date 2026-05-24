import en from "./en.json";
import he from "./he.json";

export type Locale = "en" | "he";
export type Translations = typeof en;

const translations: Record<Locale, Translations> = { en, he };

export function getTranslations(locale: Locale = "en"): Translations {
  return translations[locale] ?? translations.en;
}

export function isRtl(locale: Locale): boolean {
  return locale === "he";
}

export const SUPPORTED_LOCALES: Locale[] = ["en", "he"];
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  he: "עברית",
};
