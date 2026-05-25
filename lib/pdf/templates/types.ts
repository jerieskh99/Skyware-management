import type { ReceiptDocumentType } from "@prisma/client";
import type { ReceiptSnapshot } from "../snapshot";

/**
 * Shape consumed by every template renderer. Composed by `lib/pdf/render.ts`
 * from a `ReceiptDocument` row plus a snapshot (live or historical).
 */
export interface TemplateInput {
  doc: {
    id: string;
    type: ReceiptDocumentType;
    status: "draft" | "finalized" | "cancelled";
    publicNumber: string | null;
    documentNumber: number | null;
    documentNumberYear: number | null;
    issueDate: Date;
    paymentDate: Date | null;
    descriptionLines: Array<{
      description: string;
      quantity?: number;
      unitPrice?: number;
      lineTotal: number;
    }>;
    amountBeforeVat: number | null;
    vatAmount: number | null;
    vatRateBasisPoints: number;
    totalAmount: number | null;
    currency: "ILS" | "USD" | "EUR";
    /** Foreign-currency exchange rate as a string (Prisma Decimal). */
    exchangeRate: string | null;
    allocationNumber: string | null;
    paymentMethod: string | null;
    reference: string | null;
    notes: string | null;
    language: "he" | "en";
    /** Client header block (denormalized so the template stays pure). */
    client: {
      companyName: string;
      israeliTaxId: string | null;
      address: string | null;
    };
    /**
     * For credit notes: the public/display number of the original receipt
     * being credited. Null on non-credit-note types.
     */
    creditedPublicNumber: string | null;
  };
  snapshot: ReceiptSnapshot;
  /** When true, render the bilingual DRAFT watermark on every page. */
  watermark: boolean;
}

export type TemplateRenderer = (input: TemplateInput) => string;
