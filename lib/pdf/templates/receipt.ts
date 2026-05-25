import {
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
 * Stand-alone receipt (Hebrew "קבלה"). Confirms money was received.
 * Per `israel_compliance_audit.md` §A.3 the exact mandatory field list for
 * a stand-alone receipt is unverified pending a real CPA; the template
 * therefore renders the same shape as the tax invoice but de-emphasizes
 * allocation number (not applicable) and emphasizes the payment date.
 *
 * Section A.3: "A receipt does not by itself entitle the recipient to
 * deduct input VAT. Only a Cheshbonit Mas does." The watermark plus the
 * absence of "חשבונית מס" in the title prevents confusion at preview time.
 */
export const renderReceipt: TemplateRenderer = (input) => {
  const body = `
    <header class="header">
      ${renderCompanyBlock(input)}
      ${renderTitleBlock(input)}
    </header>
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
