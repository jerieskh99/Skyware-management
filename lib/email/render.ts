import type { EmailTemplate } from "@prisma/client";

/**
 * Email template rendering.
 *
 * Templates use a mustache-like `{{variable}}` syntax. Two render paths:
 *   - HTML body: values are HTML-escaped to prevent injection when the
 *     rendered string is dropped into an HTML email.
 *   - Plain-text body: values are inserted verbatim (no markup to escape).
 *
 * Unknown variables render as an empty string (never the literal `{{x}}`),
 * so a typo in a template never leaks a placeholder into a client email.
 *
 * The subject line is always plain text (HTML in a subject is meaningless),
 * so it uses the non-escaping substitution.
 */

export interface RenderVars {
  [k: string]: string | number | null | undefined;
}

/** `{{ name }}` with optional surrounding whitespace, captured group = name. */
const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escape the five HTML-significant characters. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Coerce a render var to its string form. Null/undefined become "". */
function coerce(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Substitute `{{var}}` placeholders in `tpl`. Unknown vars render empty.
 * Values are NOT HTML-escaped — use for plain-text and subject paths.
 */
export function renderTemplate(tpl: string, vars: RenderVars): string {
  return tpl.replace(VAR_PATTERN, (_match, name: string) =>
    coerce(vars[name]),
  );
}

/**
 * Substitute `{{var}}` placeholders, HTML-escaping each value. Use for the
 * HTML body path. The template literal text itself is NOT escaped (so a
 * template author can include real markup); only the interpolated values are.
 */
export function renderTemplateHtml(tpl: string, vars: RenderVars): string {
  return tpl.replace(VAR_PATTERN, (_match, name: string) =>
    escapeHtml(coerce(vars[name])),
  );
}

/**
 * Convert a plain-text body (with newlines) into a minimal HTML body. Each
 * source line is HTML-escaped at interpolation time by `renderTemplateHtml`;
 * here we only translate newlines to <br> and wrap in a paragraph container.
 *
 * The seeded templates are plain text with `\n` separators, so this gives a
 * readable HTML rendering without requiring template authors to write markup.
 */
function textToHtml(text: string): string {
  // The text has already had its variable values escaped. We must still escape
  // the literal template text that surrounds the variables, but the variable
  // values themselves are double-escape-safe only if we DON'T re-escape here.
  // To keep it simple and correct, the HTML body is produced from the raw
  // template via renderTemplateHtml (escapes values) then newline->br on the
  // whole string. The literal template text is author-controlled and trusted.
  return text
    .split(/\r?\n/)
    .map((line) => line)
    .join("<br>\n");
}

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/**
 * Render a template row for the given language. Picks the En or He subject +
 * body, interpolates `vars`, and produces:
 *   - `subject`: plain-text, interpolated.
 *   - `bodyText`: plain-text, interpolated (verbatim values).
 *   - `bodyHtml`: HTML, interpolated with escaped values and newlines as <br>.
 */
export function renderEmail(
  template: EmailTemplate,
  language: "en" | "he",
  vars: RenderVars,
): RenderedEmail {
  const subjectTpl = language === "he" ? template.subjectHe : template.subjectEn;
  const bodyTpl = language === "he" ? template.bodyHe : template.bodyEn;

  const subject = renderTemplate(subjectTpl, vars);
  const bodyText = renderTemplate(bodyTpl, vars);
  const bodyHtml = textToHtml(renderTemplateHtml(bodyTpl, vars));

  return { subject, bodyHtml, bodyText };
}

/**
 * Render an ad-hoc subject/body pair (used by manual contact when the admin
 * supplies their own subject+body rather than picking a stored template).
 */
export function renderAdHoc(
  subjectTpl: string,
  bodyTpl: string,
  vars: RenderVars,
): RenderedEmail {
  const subject = renderTemplate(subjectTpl, vars);
  const bodyText = renderTemplate(bodyTpl, vars);
  const bodyHtml = textToHtml(renderTemplateHtml(bodyTpl, vars));
  return { subject, bodyHtml, bodyText };
}
