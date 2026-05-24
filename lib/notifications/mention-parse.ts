/**
 * Parse `@username` mentions out of free-form text.
 *
 * Rules:
 * - Username chars: letters (any unicode), digits, `.`, `_`, `-`.
 *   We restrict to ASCII letters to match the codebase's username constraints
 *   (e.g. `helpdesk.demo`, `emp.name.1`). Hebrew or other scripts in usernames
 *   are not supported; mentions of such names will not be parsed.
 * - Length: 3-50 characters.
 * - Must be preceded by start-of-string or a non-word character.
 *   This prevents email addresses (e.g. "foo@bar") from being parsed as mentions.
 * - Case-insensitive de-duplication; the first-occurrence casing is preserved
 *   in the returned array.
 * - No `@everyone` / `@here` magic.
 */

// Lookbehind for "start of string OR a non-word/non-@ char" so emails and
// in-word @ signs don't trigger. Capture is intentionally generous so we can
// post-validate length in JS — this lets us strip trailing punctuation without
// silently truncating an overflowing 60-char run to a 50-char match.
const MENTION_RE = /(?<=^|[^\w@.\-_])@([A-Za-z][A-Za-z0-9._-]{0,99})/g;

const MIN_LEN = 3;
const MAX_LEN = 50;

export function extractUsernames(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const raw = m[1];
    if (!raw) continue;
    // Strip trailing punctuation-only suffixes (e.g. "@user." → "user").
    const cleaned = raw.replace(/[._-]+$/, "");
    if (cleaned.length < MIN_LEN || cleaned.length > MAX_LEN) continue;
    // Reject if the original capture was bounded by another username char —
    // that means the source token actually exceeded MAX_LEN before truncation.
    const matchEnd = (m.index ?? 0) + 1 + raw.length; // +1 for the `@`
    const next = text[matchEnd];
    if (next && /[A-Za-z0-9._-]/.test(next)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}
