import type { ReceiptDocumentType } from "@prisma/client";
import { renderCreditNote } from "./credit-note";
import { renderProforma } from "./proforma";
import { renderReceipt } from "./receipt";
import { renderTaxInvoice } from "./tax-invoice";
import type { TemplateRenderer } from "./types";

/**
 * Select the renderer for a given receipt document type. Every value of
 * `ReceiptDocumentType` is covered; the switch is exhaustive so adding a
 * new type to the Prisma enum will surface as a typecheck error here.
 */
export function selectTemplate(type: ReceiptDocumentType): TemplateRenderer {
  switch (type) {
    case "tax_invoice":
    case "tax_invoice_receipt":
    case "invoice":
      return renderTaxInvoice;
    case "receipt":
      return renderReceipt;
    case "credit_note":
      return renderCreditNote;
    case "proforma_invoice":
      return renderProforma;
    default: {
      // Exhaustiveness check: TypeScript narrows `type` to `never` here.
      const _exhaustive: never = type;
      throw new Error(`Unsupported receipt document type: ${String(_exhaustive)}`);
    }
  }
}

export type { TemplateInput, TemplateRenderer } from "./types";
