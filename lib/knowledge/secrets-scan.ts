/**
 * Knowledge article secrets scanner.
 *
 * Pattern set per `docs/knowledge-sprint-2026-05/knowledge_quality_control_plan.md`
 * §4.6 and `docs/knowledge-sprint-2026-05/knowledge_security_permissions_audit.md`
 * §6. Pure function: no I/O, no side effects, no logging.
 *
 * The findings are surfaced to the reviewer, never to the author. Authors
 * are not told what patterns the scanner uses so they cannot reliably skirt
 * it; reviewers must still read the body for context.
 *
 * Findings are capped at `MAX_FINDINGS` to keep response shapes bounded
 * even for pathological inputs (e.g. a body that is one giant base64
 * blob).
 */

export type SecretPattern =
  | "ipv4"
  | "iban"
  | "jwt"
  | "aws_access_key"
  | "aws_secret"
  | "password_phrase"
  | "bearer_token"
  | "ssh_private_key"
  | "internal_hostname";

export interface SecretFinding {
  pattern: SecretPattern;
  /** First 8 chars of the match for display; never the full match. */
  preview: string;
  /** Character offset in the source string. */
  index: number;
}

const MAX_FINDINGS = 200;
const PREVIEW_LENGTH = 8;

/** Make every pattern global so `.matchAll` returns iteration positions. */
const PATTERN_MATCHERS: ReadonlyArray<{
  pattern: SecretPattern;
  regex: RegExp;
}> = [
  {
    pattern: "ssh_private_key",
    // BEGIN line of common private-key formats.
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    pattern: "jwt",
    // Three base64url segments separated by dots, starting with the eyJ header.
    regex: /eyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g,
  },
  {
    pattern: "aws_access_key",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    pattern: "aws_secret",
    // Conservative: only flag when the literal substring "aws_secret" appears
    // within 64 chars before the candidate blob. This avoids the well-known
    // false-positive storm of naive 40-char base64 matches.
    regex: /aws_secret[^\n]{0,64}?[A-Za-z0-9/+=]{40}/g,
  },
  {
    pattern: "bearer_token",
    // The leading "Bearer" is case-sensitive in RFC 6750, but humans paste
    // it any which way; allow common variants.
    regex: /\b[Bb]earer\s+[A-Za-z0-9._-]{20,}/g,
  },
  {
    pattern: "password_phrase",
    // "password:", "password =", and Hebrew "סיסמה:" / "סיסמה=".
    regex: /(?:password|passwd|pwd|סיסמה|סִיסְמָה)\s*[:=]/giu,
  },
  {
    pattern: "iban",
    // IL plus 21 digits, with optional spaces every 4 chars.
    regex: /\bIL\d{2}(?:\s?\d){19}\b/g,
  },
  {
    pattern: "ipv4",
    // Classic dotted quad; we deliberately do not constrain to private ranges
    // because the reviewer cares about any IP that escaped into a public doc.
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  },
  {
    pattern: "internal_hostname",
    // Placeholder for the Skyware-internal DNS suffixes. The audit doc owns
    // the canonical list; this is the V1 starter pack.
    regex: /\b[A-Za-z0-9_-]+\.skyware(?:-it)?\.(?:local|internal)\b/g,
  },
];

/** Slice up to `PREVIEW_LENGTH` chars from `match` without throwing. */
function preview(match: string): string {
  if (match.length <= PREVIEW_LENGTH) return match;
  return match.slice(0, PREVIEW_LENGTH);
}

/**
 * Scan a string for known secret patterns. Returns at most `MAX_FINDINGS`
 * findings. Order is grouped by pattern (in declaration order) and within
 * each pattern by index ascending; callers wanting strict-index order can
 * `Array.prototype.sort` the result.
 */
export function scanSecrets(input: string): SecretFinding[] {
  if (!input) return [];
  const findings: SecretFinding[] = [];
  for (const { pattern, regex } of PATTERN_MATCHERS) {
    // Reset lastIndex by re-instantiating the matcher to keep `scanSecrets`
    // idempotent across calls (regex literals with `g` are stateful).
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(input)) !== null) {
      if (findings.length >= MAX_FINDINGS) return findings;
      findings.push({
        pattern,
        preview: preview(match[0]),
        index: match.index,
      });
      // Guard against zero-width matches sending us into an infinite loop;
      // none of the patterns above can match empty, but defense in depth.
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  return findings;
}

/**
 * Build a redacted copy of `input` where every finding is replaced by a
 * tagged placeholder. Used by the AI-structuring dry-run so the model
 * (in V2; V1 is dry-run only) never sees raw secrets.
 *
 * Returns the redacted string AND the original findings so the caller can
 * log redaction counts without re-scanning.
 */
export function redactSecrets(
  input: string,
): { redacted: string; findings: SecretFinding[] } {
  if (!input) return { redacted: input, findings: [] };

  // Walk every pattern once and record (index, length, pattern). We need
  // length here too (scanSecrets exposes only previews) so we can splice
  // the source string by exact match boundaries.
  const fullMatches: Array<{
    index: number;
    length: number;
    pattern: SecretPattern;
  }> = [];
  for (const { pattern, regex } of PATTERN_MATCHERS) {
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      fullMatches.push({ index: m.index, length: m[0].length, pattern });
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  if (fullMatches.length === 0) {
    return { redacted: input, findings: [] };
  }

  // Sort by index ascending; resolve overlaps by keeping the first match.
  fullMatches.sort((a, b) => a.index - b.index);
  let cursor = 0;
  const pieces: string[] = [];
  const findings: SecretFinding[] = [];
  for (const f of fullMatches) {
    if (f.index < cursor) continue;
    pieces.push(input.slice(cursor, f.index));
    pieces.push(`[REDACTED:${f.pattern}]`);
    cursor = f.index + f.length;
    findings.push({
      pattern: f.pattern,
      preview: preview(input.slice(f.index, f.index + f.length)),
      index: f.index,
    });
    if (findings.length >= MAX_FINDINGS) break;
  }
  pieces.push(input.slice(cursor));
  return { redacted: pieces.join(""), findings };
}
