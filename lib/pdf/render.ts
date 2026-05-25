import { isCleanProductionIssuance } from "@/lib/compliance/gates";

export interface RenderInput {
  templateId:
    | "tax_invoice"
    | "tax_invoice_receipt"
    | "receipt"
    | "invoice"
    | "credit_note"
    | "proforma_invoice";
  data: Record<string, unknown>;
  locale: "he" | "en";
}

export interface RenderResult {
  /** raw PDF bytes once a real renderer lands. */
  pdf: Uint8Array;
  watermarked: boolean;
}

/**
 * Seam for the real PDF renderer (Wave 2: Puppeteer + Heebo + templates).
 * For now it returns a tiny placeholder Uint8Array but correctly reports
 * whether the watermark would be applied so callers can be tested.
 */
export async function renderDocument(input: RenderInput): Promise<RenderResult> {
  const clean = await isCleanProductionIssuance();
  // Real renderer lands in Wave 2. Until then, return placeholder bytes.
  const stub = new TextEncoder().encode(
    `%PDF-stub renderer not yet implemented. clean=${clean}; template=${input.templateId}; locale=${input.locale}`,
  );
  return { pdf: stub, watermarked: !clean };
}

/** Convenience for the watermark text used by the future renderer. */
export const WATERMARK_TEXT_BILINGUAL =
  "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה";
