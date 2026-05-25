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
 * Proforma / Cheshbon Iska (Hebrew "חשבון עסקה / חשבונית עסקה"). Per
 * `israel_compliance_audit.md` §A.5 a proforma is NOT a tax document; the
 * recipient cannot deduct input VAT against it. The template surfaces a
 * prominent "not a tax invoice" disclaimer per the same section.
 */
export const renderProforma: TemplateRenderer = (input) => {
  // israel_compliance_audit.md §A.5: proforma must clearly state it is not
  // a tax invoice. Disclaimer is bilingual regardless of `language` so a
  // Hebrew-speaking recipient cannot misinterpret an English-language
  // proforma and vice versa.
  const disclaimerHe =
    "מסמך זה אינו חשבונית מס ואינו מזכה בקיזוז מס תשומות";
  const disclaimerEn =
    "This document is NOT a tax invoice and does not entitle the recipient to deduct input VAT.";

  const disclaimer = `
    <div class="proforma-disclaimer">
      <div>${escapeHtml(disclaimerHe)}</div>
      <div>${escapeHtml(disclaimerEn)}</div>
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
