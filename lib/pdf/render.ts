// Puppeteer is loaded via a dynamic import inside `getBrowser()` so the
// Next.js webpack server bundler never tries to walk its Node-only dep tree
// (fs, child_process, ws). The `import type` is erased at compile time and
// only the type information survives.
import type { Browser } from "puppeteer";
import {
  WATERMARK_TEXT_BILINGUAL,
  isCleanProductionIssuance,
} from "@/lib/compliance/gates";
import { getCompanySettings } from "@/lib/company-settings/queries";
import { prisma } from "@/lib/prisma";
import {
  composeSnapshot,
  readSnapshotForReceipt,
  type ReceiptSnapshot,
} from "./snapshot";
import { selectTemplate } from "./templates";
import type { TemplateInput } from "./templates/types";

/**
 * Per-process Puppeteer browser. Re-used across requests to avoid the
 * ~2s cold-start cost of launching Chromium on every render. Tests can
 * forcibly close it via `shutdownPdfRenderer`.
 */
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  // Dynamic import so webpack does not attempt to bundle puppeteer at build
  // time. Combined with `serverExternalPackages` in next.config.ts this
  // double-locks the avoidance: even if a future Next.js version stops
  // honoring the externals list, the dynamic import still defers resolution
  // to Node runtime, where the symlink at node_modules/puppeteer works.
  const puppeteerModule = await import("puppeteer");
  const launch = puppeteerModule.default?.launch ?? puppeteerModule.launch;
  _browser = await launch({
    headless: true,
    // `--no-sandbox` is required on most Linux CI hosts where the calling
    // user does not have CAP_SYS_ADMIN; harmless on macOS dev.
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return _browser;
}

export interface RenderReceiptResult {
  bytes: Uint8Array;
  /** True when this render was served from a cached attachment row. */
  cached: boolean;
  /** True when the bilingual DRAFT watermark was stamped on every page. */
  watermarked: boolean;
}

/**
 * Render a receipt PDF.
 *
 * Drafts always re-render fresh (the operator may have just edited the row);
 * finalized rows would normally reuse a cached attachment but the cache write
 * path is wired in a follow-up (the schema column exists; the writer comes in
 * Wave 2C). Until then the function renders on every call and returns
 * `cached: false`.
 *
 * The watermark is on unless ALL THREE production gates pass per
 * docs/audit-2026-05-billing/asking_an_accountant.md §7:
 *   feature flag `receipt_finalize_enabled`   = true
 *   env `ALLOW_PRODUCTION_ISSUANCE`           = "true"
 *   feature flag `pdf_watermark_disabled`     = true
 * Any single false keeps the watermark on.
 */
export async function renderReceiptPdf(
  receiptId: string,
): Promise<RenderReceiptResult> {
  const doc = await prisma.receiptDocument.findUnique({
    where: { id: receiptId },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          israeliTaxId: true,
          address: true,
        },
      },
      creditedReceipt: {
        select: {
          id: true,
          documentNumber: true,
          documentNumberYear: true,
        },
      },
    },
  });
  if (!doc) {
    throw new Error(`Receipt ${receiptId} not found`);
  }

  // Snapshot resolution: finalized rows MUST have a headerSnapshot. If one
  // is missing (legacy data; should not happen post-Wave 2 finalize), fall
  // back to a fresh CompanySettings read so the renderer never throws on
  // historical rows. Drafts always use a fresh read so the preview always
  // reflects the current header.
  let snapshot: ReceiptSnapshot | null = await readSnapshotForReceipt(doc);
  if (!snapshot) {
    const settings = await getCompanySettings();
    if (!settings) {
      throw new Error(
        "Company settings missing; configure under /admin?tab=company before rendering",
      );
    }
    snapshot = composeSnapshot(settings);
  }

  const clean = await isCleanProductionIssuance();
  const watermarked = !clean;

  // Compose the template input. The client snapshot here is read live; if
  // the snapshot ever needs to also freeze the client name, the right place
  // to do that is `composeSnapshot` plus a `snapshot.client` shape.
  const templateInput: TemplateInput = {
    doc: {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      publicNumber: documentNumber(doc.documentNumber, doc.documentNumberYear),
      documentNumber: doc.documentNumber,
      documentNumberYear: doc.documentNumberYear,
      issueDate: doc.issueDate,
      paymentDate: doc.paymentDate,
      descriptionLines:
        (doc.descriptionLines as unknown as TemplateInput["doc"]["descriptionLines"]) ??
        [],
      amountBeforeVat: doc.amountBeforeVat,
      vatAmount: doc.vatAmount,
      vatRateBasisPoints: doc.vatRateBasisPoints,
      totalAmount: doc.totalAmount,
      currency: doc.currency,
      exchangeRate: doc.exchangeRate?.toString() ?? null,
      allocationNumber: doc.allocationNumber,
      paymentMethod: doc.paymentMethod,
      reference: doc.reference,
      notes: doc.notes,
      language: doc.language === "en" ? "en" : "he",
      client: {
        companyName: doc.client.companyName,
        israeliTaxId: doc.client.israeliTaxId,
        address: doc.client.address,
      },
      creditedPublicNumber: doc.creditedReceipt
        ? documentNumber(
            doc.creditedReceipt.documentNumber,
            doc.creditedReceipt.documentNumberYear,
          )
        : null,
    },
    snapshot,
    watermark: watermarked,
  };

  const render = selectTemplate(doc.type);
  const html = render(templateInput);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // `setContent` in Puppeteer >= 22 does not accept `networkidle*` (those
    // are only valid for `goto`). `load` waits for the document's `load`
    // event, which is sufficient because the template is fully inlined.
    // Fonts are referenced by relative URL (/fonts/heebo/*.woff2); when the
    // Next.js static handler is not reachable the cascade falls back to
    // system fonts (Hebrew kerning is slightly worse but the PDF renders).
    await page.setContent(html, { waitUntil: "load" });
    // Wait for embedded webfonts to be ready. document.fonts.ready resolves
    // once all @font-face fetches complete (or fail), so the rendered PDF
    // uses Heebo when available and the system fallback otherwise.
    await page.evaluate(async () => {
      const doc = document as Document & { fonts?: { ready: Promise<unknown> } };
      if (doc.fonts?.ready) {
        await doc.fonts.ready;
      }
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      // 20mm top/bottom and 15mm left/right is standard Israeli business
      // document trim. Tighter than this and the watermark clips.
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    return {
      bytes: new Uint8Array(pdfBuffer),
      cached: false,
      watermarked,
    };
  } finally {
    await page.close();
  }
}

/**
 * Legacy seam preserved so the existing route fallback and the unit test
 * import surface keep working until Agent ARCH switches over fully to
 * `renderReceiptPdf`. The body delegates to the new renderer when a
 * `receiptId` is present in `data`; otherwise it returns a stub.
 */
export async function renderDocument(input: {
  templateId: string;
  data: Record<string, unknown>;
  locale: "he" | "en";
}): Promise<{ pdf: Uint8Array; watermarked: boolean }> {
  const receiptId = typeof input.data.receiptId === "string"
    ? input.data.receiptId
    : null;
  if (receiptId) {
    const res = await renderReceiptPdf(receiptId);
    return { pdf: res.bytes, watermarked: res.watermarked };
  }
  // No receipt id supplied: return a tiny stub plus the watermark verdict so
  // tests of the gate logic still pass without spinning up Chromium.
  const clean = await isCleanProductionIssuance();
  const stub = new TextEncoder().encode(
    `%PDF-stub template=${input.templateId}; locale=${input.locale}; clean=${clean}`,
  );
  return { pdf: stub, watermarked: !clean };
}

/**
 * Test seam: close and reset the cached browser. Tests that mock
 * `puppeteer.launch` should call this in `afterEach` so the next test
 * starts from a clean slate.
 */
export async function shutdownPdfRenderer(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

function documentNumber(num: number | null, year: number | null): string | null {
  if (num == null || year == null) return null;
  const padded = String(num).padStart(4, "0");
  return `${year}-${padded}`;
}

export { WATERMARK_TEXT_BILINGUAL };
