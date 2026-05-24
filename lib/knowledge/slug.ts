const MAX_LEN = 80;

const HEBREW_RE = /[֐-׿]/;

const ASCII_FOLD: Record<string, string> = {
  à: "a", á: "a", â: "a", ä: "a", ã: "a", å: "a", ā: "a",
  ç: "c", č: "c", ć: "c",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ě: "e",
  ì: "i", í: "i", î: "i", ï: "i", ī: "i",
  ñ: "n", ń: "n",
  ò: "o", ó: "o", ô: "o", ö: "o", õ: "o", ō: "o", ø: "o",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u",
  ý: "y", ÿ: "y",
  ž: "z", ź: "z", ż: "z",
  ß: "ss",
};

function fold(ch: string): string {
  const lower = ch.toLowerCase();
  return ASCII_FOLD[lower] ?? lower;
}

/**
 * Slugify a title for URL use.
 * - Lowercases ASCII.
 * - Folds common diacritics (é -> e).
 * - Preserves Hebrew letters (the portal is bilingual).
 * - Replaces every other character class (whitespace, punctuation) with `-`.
 * - Collapses repeated dashes.
 * - Trims leading/trailing dashes.
 * - Truncates to 80 chars without splitting a dash run.
 *
 * Returns an empty string if no allowed characters survive; callers should
 * fall back to a synthetic id (e.g. `article-<uuid8>`) in that case.
 */
export function slugify(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else if (HEBREW_RE.test(ch)) {
      out += ch;
    } else if (/[À-ɏ]/.test(ch)) {
      out += fold(ch);
    } else {
      out += "-";
    }
  }
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (out.length > MAX_LEN) {
    out = out.slice(0, MAX_LEN).replace(/-+$/g, "");
  }
  return out;
}
