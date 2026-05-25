# PDF render notes

Operational notes for the receipts PDF render pipeline shipped in Wave 2A-PDF
of the Israel Billing/Receipts/FinDocs plan (`docs/audit-2026-05-billing/`).

## Components

- `lib/pdf/render.ts` — the public seam. Exports `renderReceiptPdf(id)`
  which returns `{ bytes, cached, watermarked }`. Also re-exports
  `WATERMARK_TEXT_BILINGUAL` for the unit tests, and keeps a legacy
  `renderDocument` adapter so the Wave 1C route fallback still resolves.
- `lib/pdf/snapshot.ts` — `composeSnapshot(companySettings)` and
  `readSnapshotForReceipt(receipt)`. The snapshot is persisted on
  `ReceiptDocument.headerSnapshot` at finalize time so historical PDFs
  never drift if `CompanySettings` is later edited.
- `lib/pdf/templates/` — one renderer per receipt document type
  (`tax-invoice.ts`, `receipt.ts`, `credit-note.ts`, `proforma.ts`) plus
  `base.ts` (HTML wrapper, fonts, watermark CSS, page numbering) and
  `index.ts` (`selectTemplate(type)`).
- `public/fonts/heebo/` — the OFL-licensed Heebo font in Hebrew and Latin
  subsets (`Heebo-Regular-{hebrew,latin}.woff2`, `Heebo-Medium-{hebrew,
  latin}.woff2`, `Heebo-Bold-{hebrew,latin}.woff2`). Canonical
  `Heebo-{Regular,Medium,Bold}.woff2` aliases point at the Latin subset so
  any caller that expects the simple file name keeps working.

## Puppeteer

- The dependency is plain `puppeteer` (not `puppeteer-core`). `pnpm install`
  downloads the matching Chromium under `node_modules/puppeteer/.cache/`
  (~150 MB on macOS, ~300 MB on Linux). The download is skipped if the
  build-script approval prompt is declined; run `pnpm approve-builds` then
  reinstall if Chromium is missing.
- On Linux CI add the env var `PUPPETEER_SKIP_DOWNLOAD=false` (default) and
  ensure the host has the runtime libraries Chromium needs
  (`libnss3`, `libatk-bridge2.0-0`, `libdrm2`, `libxkbcommon0`, etc. — see
  Puppeteer's troubleshooting page for the full list).
- The renderer launches Chromium once per Node process and reuses the
  instance across requests; `shutdownPdfRenderer()` is exposed for tests.
- Process args: `["--no-sandbox", "--disable-setuid-sandbox"]`. Required on
  most Linux CI hosts; harmless on macOS dev.

## Page setup

- Page size: A4. Margins: 20mm top/bottom, 15mm left/right (standard
  Israeli business document trim).
- `printBackground: true` so the diagonal watermark and any colored
  disclaimer blocks render.
- `setContent(html, { waitUntil: "load" })` followed by an
  `await page.evaluate(() => document.fonts.ready)` so embedded Heebo
  webfonts are fully loaded before `page.pdf()` snapshots.

## Watermark

- Bilingual text constant: `"DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה"`,
  exported from both `lib/compliance/gates.ts` (canonical) and
  `lib/pdf/render.ts` (re-export for backwards compatibility).
- Stamped on every page with a fixed-position rotated `<div class="watermark">`
  at `rgba(180,40,40,0.18)` plus a red bottom "internal testing only" footer.
- Off only when `isCleanProductionIssuance()` returns true: requires ALL of
  - `receipt_finalize_enabled` feature flag = true
  - `pdf_watermark_disabled` feature flag = true
  - `ALLOW_PRODUCTION_ISSUANCE` env var = "true"
  Any one false keeps the watermark on. See
  `docs/audit-2026-05-billing/asking_an_accountant.md` §7.

## Snapshot lifecycle

- Drafts: `ReceiptDocument.headerSnapshot` is null; the renderer composes a
  fresh snapshot from the live `CompanySettings` row on every request so a
  preview always shows the current header.
- Finalize: `lib/receipts/finalize.ts` reads `CompanySettings`, runs
  `composeSnapshot(...)`, and stores the JSON on `headerSnapshot`. If the
  singleton row is missing the finalize throws `ReceiptValidationError`
  with a pointer to `/admin?tab=company`.
- Finalized rows: the renderer reads `headerSnapshot` first; falls back to
  a fresh `CompanySettings` read if a legacy row has no snapshot.

## Cached PDF (planned, schema only)

- `ReceiptDocument.cachedPdfAttachmentId` is a nullable FK to `Attachment`
  reserved for the cache writer (deferred to a small follow-up). Today the
  renderer always re-renders; `cached` is always `false` in the result.
- The follow-up will: on finalize, render once, upload to S3 via the
  existing `presignUpload` flow, write an `Attachment` row, set
  `cachedPdfAttachmentId`. The GET handler can then serve from the cached
  attachment for finalized rows (drafts still re-render).

## Serverless caveat

- The deployment target today is a regular Node host. If the team moves to
  Vercel-style serverless, swap `puppeteer` → `puppeteer-core` +
  `@sparticuz/chromium` behind the same `lib/pdf/render.ts` seam. No other
  caller change is required because the renderer interface (`{ bytes,
  cached, watermarked }`) stays stable.

## Fallback when fonts are unavailable

- The template references fonts via `/fonts/heebo/*.woff2`. In tests (where
  the dev/prod static handler is not reachable) the WOFF2 fetches fail
  silently and the cascade falls back to `"Arial Hebrew"` / `"Arial"` /
  `sans-serif`. Hebrew kerning is slightly worse but the PDF still renders
  and tests still pass.
