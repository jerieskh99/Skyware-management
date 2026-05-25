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
 * Tax-invoice variant (Hebrew "חשבונית מס"). Mandatory content per
 * `israel_compliance_audit.md` §A.2:
 *   - Hebrew title block ("חשבונית מס" + "עוסק מורשה")
 *   - Supplier legal name, address, VAT registration number
 *   - Buyer name and address (B2B also requires buyer VAT number)
 *   - Unique sequential invoice number + issue date
 *   - Specific description of goods/services per line
 *   - Per-line unit price ex-VAT, quantity, VAT rate, VAT amount, total
 *   - VAT amount on its own line
 *   - "מסמך ממוחשב" stamp (rendered by the footer helper)
 *
 * The same renderer covers `tax_invoice`, `tax_invoice_receipt`, and the
 * generic `invoice` enum value (rare; falls through here as a sane default).
 */
export const renderTaxInvoice: TemplateRenderer = (input) => {
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
