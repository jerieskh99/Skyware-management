import "server-only";
import { cookies } from "next/headers";
import en from "./en.json";
import he from "./he.json";
import type { Locale, Translations } from "./index";

const dictionaries: Record<Locale, Translations> = { en, he };

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get("locale")?.value;
  return v === "he" ? "he" : "en";
}

export async function getT(): Promise<{
  locale: Locale;
  t: (key: string) => string;
  isRtl: boolean;
  dict: Translations;
}> {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return {
    locale,
    isRtl: locale === "he",
    dict,
    t: (key: string) => resolve(dict, key) ?? resolve(dictionaries.en, key) ?? key,
  };
}

function resolve(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}
