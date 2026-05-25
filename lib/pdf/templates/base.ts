import { WATERMARK_TEXT_BILINGUAL } from "@/lib/compliance/gates";
import type { TemplateInput } from "./types";

/**
 * Minimal HTML-escape for inserting user data into the template. The
 * template is server-rendered to a Chromium page that does NOT execute
 * scripts (Puppeteer's `setContent` with `networkidle0`), but escaping is
 * still required so a description containing `<` does not break layout.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format an Asia/Jerusalem-local dd/MM/yyyy date string. */
export function formatDateIL(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Currency symbol map used in template totals; falls back to ISO code. */
const CURRENCY_SYMBOL: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
};

/** Format an integer minor-unit amount (e.g. agorot) with the given currency. */
export function formatMoney(
  minorUnits: number | null,
  currency: string,
): string {
  if (minorUnits == null) return "";
  const major = minorUnits / 100;
  const formatted = new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  return `${sym}${formatted}`;
}

/** Format vatRateBasisPoints as a percentage string e.g. "18%". */
export function formatVatRate(basisPoints: number): string {
  const pct = basisPoints / 100;
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(2)}%`;
}

/**
 * Bilingual title labels for every receipt document type. Hebrew first
 * (legally mandatory header phrase per israel_compliance_audit.md §F),
 * English second for accessibility.
 */
export const TYPE_LABELS_HE_EN: Record<
  TemplateInput["doc"]["type"],
  { he: string; en: string }
> = {
  invoice: { he: "חשבונית", en: "Invoice" },
  receipt: { he: "קבלה", en: "Receipt" },
  tax_invoice: {
    he: "חשבונית מס",
    en: "Tax Invoice",
  },
  tax_invoice_receipt: {
    he: "חשבונית מס/קבלה",
    en: "Tax Invoice / Receipt",
  },
  credit_note: {
    he: "חשבונית זיכוי",
    en: "Credit Note",
  },
  proforma_invoice: {
    he: "חשבון עסקה",
    en: "Proforma Invoice",
  },
};

/**
 * Wrap a body fragment in the surrounding HTML document. Owns the
 * @font-face declarations, the watermark CSS, the page-numbering footer,
 * and the document-direction attribute (RTL for Hebrew, LTR for English).
 */
export function wrapInHtml(input: TemplateInput, body: string): string {
  const dir = input.doc.language === "he" ? "rtl" : "ltr";
  const lang = input.doc.language;

  const watermarkBlock = input.watermark
    ? `<div class="watermark" aria-hidden="true">${escapeHtml(WATERMARK_TEXT_BILINGUAL)}</div>`
    : "";

  // Heebo @font-face: two URLs per weight (Hebrew + Latin subsets). The
  // browser picks the right glyph subset based on the `unicode-range` hint.
  // If the WOFF2 files are missing the font cascade falls back to system
  // fonts at the cost of less reliable Hebrew kerning.
  const fontFace = `
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 400;
      src: url("/fonts/heebo/Heebo-Regular-hebrew.woff2") format("woff2");
      unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
    }
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 400;
      src: url("/fonts/heebo/Heebo-Regular-latin.woff2") format("woff2");
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 500;
      src: url("/fonts/heebo/Heebo-Medium-hebrew.woff2") format("woff2");
      unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
    }
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 500;
      src: url("/fonts/heebo/Heebo-Medium-latin.woff2") format("woff2");
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 700;
      src: url("/fonts/heebo/Heebo-Bold-hebrew.woff2") format("woff2");
      unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
    }
    @font-face {
      font-family: "Heebo";
      font-style: normal;
      font-weight: 700;
      src: url("/fonts/heebo/Heebo-Bold-latin.woff2") format("woff2");
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
  `;

  // Footer line per asking_an_accountant.md §7: red Hebrew "internal
  // testing only" message stays under the watermark for extra emphasis.
  const internalTestingFooter = input.watermark
    ? `<div class="internal-testing-footer">מסמך לא חוקי — למטרות בדיקה פנימית בלבד / Not legally valid — internal testing only</div>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(TYPE_LABELS_HE_EN[input.doc.type].he)} ${escapeHtml(formatDocumentLabel(input.doc))}</title>
  <style>
    ${fontFace}
    @page {
      size: A4;
      margin: 20mm 15mm;
      @bottom-right {
        content: counter(page) " / " counter(pages);
        font-family: "Heebo", "Arial Hebrew", "Arial", sans-serif;
        font-size: 9pt;
        color: #666;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Heebo", "Arial Hebrew", "Arial", sans-serif;
      font-size: 10pt;
      color: #111;
      line-height: 1.4;
    }
    body { position: relative; }
    .doc { padding: 0; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      border-bottom: 2px solid #111;
      padding-bottom: 8mm;
      margin-bottom: 6mm;
    }
    .header .company { flex: 1 1 auto; }
    .header .title-block {
      text-align: ${dir === "rtl" ? "left" : "right"};
      flex: 0 0 auto;
    }
    .company-name { font-size: 16pt; font-weight: 700; margin-bottom: 2mm; }
    .company-meta { font-size: 9pt; color: #444; }
    .company-meta div { margin-bottom: 1mm; }
    .title-he { font-size: 18pt; font-weight: 700; margin-bottom: 1mm; }
    .title-en { font-size: 11pt; font-weight: 500; color: #555; }
    .number-block {
      margin-top: 4mm;
      font-size: 12pt;
      font-weight: 500;
    }
    .original-marker {
      margin-top: 2mm;
      font-size: 9pt;
      color: #555;
      font-weight: 500;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6mm;
      margin-bottom: 6mm;
    }
    .meta-card {
      border: 1px solid #ddd;
      border-radius: 2mm;
      padding: 4mm;
      background: #fafafa;
    }
    .meta-card h3 {
      margin: 0 0 2mm 0;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      color: #555;
    }
    .meta-card .pair {
      font-size: 10pt;
      margin-bottom: 1mm;
    }
    .meta-card .pair .label {
      font-weight: 500;
      color: #555;
      margin-${dir === "rtl" ? "left" : "right"}: 4pt;
    }
    .lines-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6mm;
      font-size: 10pt;
    }
    .lines-table th, .lines-table td {
      padding: 3mm 2mm;
      border-bottom: 1px solid #eee;
      text-align: ${dir === "rtl" ? "right" : "left"};
    }
    .lines-table th {
      background: #f3f3f3;
      font-weight: 700;
      border-bottom: 2px solid #111;
    }
    .lines-table td.num, .lines-table th.num {
      text-align: ${dir === "rtl" ? "left" : "right"};
      white-space: nowrap;
    }
    .totals {
      display: flex;
      justify-content: ${dir === "rtl" ? "flex-start" : "flex-end"};
      margin-bottom: 6mm;
    }
    .totals table {
      border-collapse: collapse;
      min-width: 60mm;
    }
    .totals td {
      padding: 1.5mm 4mm;
      font-size: 10pt;
    }
    .totals td.label { color: #555; font-weight: 500; }
    .totals td.value { text-align: ${dir === "rtl" ? "left" : "right"}; white-space: nowrap; }
    .totals tr.grand td {
      font-size: 12pt;
      font-weight: 700;
      border-top: 2px solid #111;
      padding-top: 3mm;
    }
    .footer-block {
      margin-top: 8mm;
      padding-top: 4mm;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #555;
      white-space: pre-line;
    }
    .computerized-stamp {
      margin-top: 6mm;
      font-size: 8pt;
      color: #666;
      text-align: center;
    }
    .credit-note-disclaimer {
      background: #fff3cd;
      border: 1px solid #d4a017;
      padding: 3mm 4mm;
      margin-bottom: 6mm;
      font-size: 10pt;
      font-weight: 500;
      color: #5a3c00;
    }
    .proforma-disclaimer {
      background: #e2ecf9;
      border: 1px solid #5c7eb3;
      padding: 3mm 4mm;
      margin-bottom: 6mm;
      font-size: 10pt;
      color: #1c3a6b;
    }
    /* Permanent diagonal watermark stamped on every page until all three
       production gates pass. Position fixed so it appears on every page. */
    .watermark {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 9999;
      transform: rotate(-30deg);
      transform-origin: 50% 50%;
      font-size: 72pt;
      font-weight: 700;
      color: rgba(180, 40, 40, 0.18);
      text-align: center;
      white-space: nowrap;
    }
    .internal-testing-footer {
      position: fixed;
      bottom: 5mm;
      left: 0;
      right: 0;
      text-align: center;
      color: rgba(180, 40, 40, 0.85);
      font-size: 9pt;
      font-weight: 500;
      z-index: 9999;
    }
  </style>
</head>
<body>
  ${watermarkBlock}
  ${internalTestingFooter}
  <div class="doc">
    ${body}
  </div>
</body>
</html>`;
}

/**
 * Format the document label used in title/header.
 *   - finalized -> "documentNumberYear-documentNumber" (e.g. "2026-0042")
 *   - draft / cancelled -> "DRAFT" / "טיוטה" placeholder
 */
export function formatDocumentLabel(doc: TemplateInput["doc"]): string {
  if (doc.status === "draft") {
    return doc.language === "he" ? "טיוטה" : "DRAFT";
  }
  if (doc.status === "cancelled") {
    return doc.language === "he"
      ? "מבוטל"
      : "CANCELLED";
  }
  if (doc.documentNumber != null && doc.documentNumberYear != null) {
    const padded = String(doc.documentNumber).padStart(4, "0");
    return `${doc.documentNumberYear}-${padded}`;
  }
  return doc.publicNumber ?? "";
}

/** Render the company-header (left) block. */
export function renderCompanyBlock(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const c = input.snapshot.company;
  const name = isHe
    ? c.legalNameHe ?? c.legalNameEn ?? ""
    : c.legalNameEn ?? c.legalNameHe ?? "";

  const lines: string[] = [];
  if (c.vatNumber) {
    const label = isHe ? "עוסק מורשה" : "Authorized Dealer";
    lines.push(`${label}: ${escapeHtml(c.vatNumber)}`);
  }
  if (c.companyNumber) {
    const label = isHe ? "מספר חברה" : "Company Number";
    lines.push(`${label}: ${escapeHtml(c.companyNumber)}`);
  }
  const addr = [c.addressLine1, c.addressLine2, c.city, c.postalCode]
    .filter(Boolean)
    .join(", ");
  if (addr) lines.push(escapeHtml(addr));
  if (c.phone) lines.push(escapeHtml(c.phone));
  if (c.email) lines.push(escapeHtml(c.email));
  if (c.websiteUrl) lines.push(escapeHtml(c.websiteUrl));

  return `
    <div class="company">
      <div class="company-name">${escapeHtml(name)}</div>
      <div class="company-meta">
        ${lines.map((l) => `<div>${l}</div>`).join("")}
      </div>
    </div>
  `;
}

/**
 * Render the title block on the opposite side of the header. Shows the
 * bilingual document type label, the document number, the issue date,
 * and the "Original" marker per israel_compliance_audit.md §A.2.
 */
export function renderTitleBlock(input: TemplateInput): string {
  const titleHe = TYPE_LABELS_HE_EN[input.doc.type].he;
  const titleEn = TYPE_LABELS_HE_EN[input.doc.type].en;
  const label = formatDocumentLabel(input.doc);
  const isFinalized = input.doc.status === "finalized";
  const numLabel = input.doc.language === "he"
    ? "מספר"
    : "Number";
  const dateLabel = input.doc.language === "he"
    ? "תאריך הנפקה"
    : "Issue Date";
  const originalLabel = input.doc.language === "he"
    ? "מקור / Original"
    : "Original";

  return `
    <div class="title-block">
      <div class="title-he">${escapeHtml(titleHe)}</div>
      <div class="title-en">${escapeHtml(titleEn)}</div>
      <div class="number-block">
        ${escapeHtml(numLabel)}: ${escapeHtml(label)}
      </div>
      <div class="number-block">
        ${escapeHtml(dateLabel)}: ${escapeHtml(formatDateIL(input.doc.issueDate))}
      </div>
      ${isFinalized ? `<div class="original-marker">${escapeHtml(originalLabel)}</div>` : ""}
    </div>
  `;
}

/** Render the bilingual "Bill To" client block. */
export function renderClientBlock(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const heading = isHe
    ? "לכבוד / Bill To"
    : "Bill To";
  const vatLabel = isHe ? "מספר מעמ" : "VAT ID";

  const lines: string[] = [`<div class="pair">${escapeHtml(input.doc.client.companyName)}</div>`];
  if (input.doc.client.israeliTaxId) {
    lines.push(
      `<div class="pair"><span class="label">${escapeHtml(vatLabel)}:</span>${escapeHtml(input.doc.client.israeliTaxId)}</div>`,
    );
  }
  if (input.doc.client.address) {
    lines.push(`<div class="pair">${escapeHtml(input.doc.client.address)}</div>`);
  }
  return `
    <div class="meta-card">
      <h3>${escapeHtml(heading)}</h3>
      ${lines.join("")}
    </div>
  `;
}

/** Render the document-meta card (payment date, allocation, reference). */
export function renderDocMetaBlock(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const heading = isHe
    ? "פרטי מסמך / Document Details"
    : "Document Details";
  const pairs: string[] = [];
  if (input.doc.paymentDate) {
    const label = isHe ? "תאריך תשלום" : "Payment Date";
    pairs.push(
      `<div class="pair"><span class="label">${escapeHtml(label)}:</span>${escapeHtml(formatDateIL(input.doc.paymentDate))}</div>`,
    );
  }
  if (input.doc.allocationNumber) {
    const label = isHe ? "מספר הקצאה" : "Allocation Number";
    pairs.push(
      `<div class="pair"><span class="label">${escapeHtml(label)}:</span>${escapeHtml(input.doc.allocationNumber)}</div>`,
    );
  }
  if (input.doc.paymentMethod) {
    const label = isHe ? "אמצעי תשלום" : "Payment Method";
    pairs.push(
      `<div class="pair"><span class="label">${escapeHtml(label)}:</span>${escapeHtml(input.doc.paymentMethod)}</div>`,
    );
  }
  if (input.doc.reference) {
    const label = isHe ? "אסמכתא" : "Reference";
    pairs.push(
      `<div class="pair"><span class="label">${escapeHtml(label)}:</span>${escapeHtml(input.doc.reference)}</div>`,
    );
  }
  if (input.doc.currency !== "ILS" && input.doc.exchangeRate) {
    const label = isHe ? "שער חליפין" : "Exchange Rate";
    pairs.push(
      `<div class="pair"><span class="label">${escapeHtml(label)}:</span>${escapeHtml(input.doc.currency)} -> ILS @ ${escapeHtml(input.doc.exchangeRate)}</div>`,
    );
  }
  if (pairs.length === 0) {
    pairs.push(
      `<div class="pair" style="color:#999">${isHe ? "—" : "(none)"}</div>`,
    );
  }
  return `
    <div class="meta-card">
      <h3>${escapeHtml(heading)}</h3>
      ${pairs.join("")}
    </div>
  `;
}

/** Render the line items table with per-line totals. */
export function renderLinesTable(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const headers = isHe
    ? {
        desc: "תיאור",
        qty: "כמות",
        unit: "מחיר יחידה",
        total: "סך הכל",
      }
    : { desc: "Description", qty: "Qty", unit: "Unit Price", total: "Line Total" };

  const rows = input.doc.descriptionLines
    .map((line) => {
      const qty = line.quantity != null ? escapeHtml(String(line.quantity)) : "";
      const unit = line.unitPrice != null
        ? escapeHtml(formatMoney(line.unitPrice, input.doc.currency))
        : "";
      return `
        <tr>
          <td>${escapeHtml(line.description)}</td>
          <td class="num">${qty}</td>
          <td class="num">${unit}</td>
          <td class="num">${escapeHtml(formatMoney(line.lineTotal, input.doc.currency))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="lines-table">
      <thead>
        <tr>
          <th>${escapeHtml(headers.desc)}</th>
          <th class="num">${escapeHtml(headers.qty)}</th>
          <th class="num">${escapeHtml(headers.unit)}</th>
          <th class="num">${escapeHtml(headers.total)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/** Render the totals block (subtotal, VAT, grand total). */
export function renderTotalsBlock(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const labels = isHe
    ? {
        sub: "סך לפני מעמ",
        vat: "מעמ",
        total: "סך כולל",
      }
    : { sub: "Subtotal", vat: "VAT", total: "Total" };

  const vatLabel = `${labels.vat} (${formatVatRate(input.doc.vatRateBasisPoints)})`;

  return `
    <div class="totals">
      <table>
        <tr>
          <td class="label">${escapeHtml(labels.sub)}</td>
          <td class="value">${escapeHtml(formatMoney(input.doc.amountBeforeVat, input.doc.currency))}</td>
        </tr>
        <tr>
          <td class="label">${escapeHtml(vatLabel)}</td>
          <td class="value">${escapeHtml(formatMoney(input.doc.vatAmount, input.doc.currency))}</td>
        </tr>
        <tr class="grand">
          <td class="label">${escapeHtml(labels.total)}</td>
          <td class="value">${escapeHtml(formatMoney(input.doc.totalAmount, input.doc.currency))}</td>
        </tr>
      </table>
    </div>
  `;
}

/** Render the footer (snapshot footer text + computerized-document stamp). */
export function renderFooterBlock(input: TemplateInput): string {
  const isHe = input.doc.language === "he";
  const footerText = isHe
    ? input.snapshot.company.receiptFooterHe ?? ""
    : input.snapshot.company.receiptFooterEn ?? "";
  // israel_compliance_audit.md §A.2 + §G.1 mandate the "computerized
  // document" stamp on every system-generated document.
  const stamp = "מסמך ממוחשב / Computerized Document";
  const notes = input.doc.notes ? `<div class="footer-block">${escapeHtml(input.doc.notes)}</div>` : "";
  const footer = footerText ? `<div class="footer-block">${escapeHtml(footerText)}</div>` : "";
  return `
    ${notes}
    ${footer}
    <div class="computerized-stamp">${escapeHtml(stamp)}</div>
  `;
}
