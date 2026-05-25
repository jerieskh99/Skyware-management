import { NextResponse } from "next/server";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getReceipt } from "@/lib/receipts/queries";
import * as pdfRenderer from "@/lib/pdf/render";

interface Params {
  params: Promise<{ id: string }>;
}

interface ReceiptPdfRenderer {
  (receiptId: string): Promise<{ bytes: Uint8Array; cached: boolean }>;
}

/**
 * Resolve the receipt PDF renderer in a way that survives Agent PDF picking
 * a different export name (`renderReceiptPdf` is the agreed contract; we
 * fall back to the generic `renderDocument` seam shipped in Wave 1C if Agent
 * PDF has not yet renamed it).
 */
async function renderReceipt(
  receiptId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  receipt: any,
): Promise<{ bytes: Uint8Array; cached: boolean }> {
  const mod = pdfRenderer as Record<string, unknown>;
  const named = mod["renderReceiptPdf"] as ReceiptPdfRenderer | undefined;
  if (typeof named === "function") {
    return named(receiptId);
  }
  // Fall back to the Wave 1C seam.
  const fallback = mod["renderDocument"] as
    | ((input: {
        templateId:
          | "tax_invoice"
          | "tax_invoice_receipt"
          | "receipt"
          | "invoice"
          | "credit_note"
          | "proforma_invoice";
        data: Record<string, unknown>;
        locale: "he" | "en";
      }) => Promise<{ pdf: Uint8Array; watermarked: boolean }>)
    | undefined;
  if (!fallback) {
    throw new Error("No receipt PDF renderer is available");
  }
  const out = await fallback({
    templateId: receipt.type,
    data: { receiptId, receipt },
    locale: receipt.language === "en" ? "en" : "he",
  });
  return { bytes: out.pdf, cached: false };
}

/**
 * GET /api/receipts/[id]/pdf
 *
 * Admin only. Drafts render fresh on every request (the operator may have just
 * edited the row). Finalized rows are cached by Agent PDF when the schema
 * includes the cache column; this route asks the renderer for the cached
 * artifact and falls back to a fresh render when the cache is absent.
 *
 * Internal-testing only per docs/audit-2026-05-billing/asking_an_accountant.md
 * §3. The watermark is enforced inside the renderer (Wave 1C `lib/pdf/render.ts`).
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) return notFound("Receipt");

  const { bytes } = await renderReceipt(id, receipt);

  const filename = buildFilename(receipt);
  // NextResponse accepts BodyInit; Uint8Array (as a typed array) qualifies.
  // The Web Response type allows ArrayBuffer / TypedArray bodies in Next 15.
  const body = bytes as unknown as BodyInit;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function buildFilename(receipt: {
  id: string;
  documentNumber: number | null;
  documentNumberYear: number | null;
}): string {
  if (
    receipt.documentNumber !== null &&
    receipt.documentNumberYear !== null
  ) {
    return `receipt-${receipt.documentNumberYear}-${receipt.documentNumber}.pdf`;
  }
  return `receipt-${receipt.id}.pdf`;
}
