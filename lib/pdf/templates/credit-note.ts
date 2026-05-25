import {
  escapeHtml,
  renderClientBlock,
  renderCompanyBlock,
  renderDocMetaBlock,
  renderFooterBlock,
  renderLinesTable,
  renderTitleBlock,
  renderTotalsBlock,
  wrapInHtml,
} from "./base";
import type { TemplateRenderer } from "./types";

/**
 * Credit-note (Hebrew "חשבונית זיכוי"). Per `israel_compliance_audit.md`
 * §A.6 + §J: a credit note must independently meet all tax-invoice required
 * fields AND reference the original invoice number it cancels/corrects.
 *
 * The amounts on the credit-note row are stored as positive integers in the
 * DB (the same shape as a tax invoice). The "credit" semantics are expressed
 * by the type alone plus the prominent reference to the credited row at the
 * top of the body. Renderer keeps the totals block positive; downstream
 * book-keeping reverses them.
 */
export const renderCreditNote: TemplateRenderer = (input) => {
  const isHe = input.doc.language === "he";
  const disclaimerHe = "מסמך זיכוי";
  const disclaimerEn = "Credit note";

  const refLabel = isHe ? "מתייחס למסמך" : "Credits document";
  const refValue = input.doc.creditedPublicNumber ?? "—";

  const disclaimer = `
    <div class="credit-note-disclaimer">
      ${escapeHtml(disclaimerHe)} / ${escapeHtml(disclaimerEn)} —
      ${escapeHtml(refLabel)}: <strong>${escapeHtml(refValue)}</strong>
    </div>
  `;

  const body = `
    <header class="header">
      ${renderCompanyBlock(input)}
      ${renderTitleBlock(input)}
    </header>
    ${disclaimer}
    <section class="meta-grid">
      ${renderClientBlock(input)}
      ${renderDocMetaBlock(input)}
    </section>
    ${renderLinesTable(input)}
    ${renderTotalsBlock(input)}
    ${renderFooterBlock(input)}
  `;
  return wrapInHtml(input, body);
};
