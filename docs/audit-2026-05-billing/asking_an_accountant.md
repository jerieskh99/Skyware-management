# Asking an Accountant: Internal-Testing-Only Review of the Israel Billing/Receipts/Financial-Documents Plan

Reviewer: Senior Israeli Accountant Reviewer Agent (internal-testing-only).
Date: 2026-05-25.
Branch / HEAD: `claude/friendly-swanson-71ed53` at commit `18d880b` (Phase 3 post-pilot expansion).
Inputs: the six audit files plus the implementation plan under `docs/audit-2026-05-billing/`, the current `prisma/schema.prisma`, `prisma/fixtures/feature-flags.json`, and the receipts domain layer under `lib/receipts/`.

## Preface: scope of this review

This document is an **internal-testing-only** review, written by a senior-accountant-style reviewer agent. **It is not a real Israeli CPA opinion. It is not legal or tax advice.** It does not replace, attest to, or stand in for the sign-off of a licensed Israeli accountant or lawyer for any production-facing financial document, any real customer issuance of tax invoices/receipts/credit notes, or any real SHAAM (`חשבוניות ישראל`) API call.

The reviewer's authority here is intentionally bounded:

- The reviewer **may approve the proposed work to be built and tested internally**, schema migrations, API endpoints behind feature flags, PDF rendering with placeholder data, internal seed users issuing fake invoices into a test database, country-toggle architecture, and the bug fixes called out in the per-module audits.
- The reviewer **must keep all production-facing issuance locked**, real customer Cheshbonit Mas, real customer Kabbala, real customer Cheshbonit Zikkui, real SHAAM allocation requests against the production endpoint, removal of any "DRAFT - NOT FOR PRODUCTION" watermark, and any marketing/contract language that calls the system "compliant", until a real Israeli CPA plus the project owner sign off in writing.
- The reviewer **must not invent Israeli accounting rules**. Every claim is cross-checked against the citations in `israel_compliance_audit.md`. Items where the source list does not support a confident judgment are marked "UNRESOLVED - real accountant must confirm".

All section headings below match the eight required headings in order.

---

## 1. What was reviewed

The reviewer read the following inputs in full:

- `docs/audit-2026-05-billing/israel_compliance_audit.md`, authoritative compliance research with inline citations (VAT rate, allocation thresholds, six document types, numbering, cancellation, FX, language, retention, PCN874, SHAAM API). The hard regulatory facts come from this file.
- `docs/audit-2026-05-billing/implementation_plan.md`, the proposed phased plan (Wave 0 through Wave 5), country toggle architecture, tech-stack additions, the explicit "not in V1" list, and the compliance gates list.
- `docs/audit-2026-05-billing/billing_audit.md`, billing subsystem state: schema entities, 11 routes, domain layer (`lib/billing/queries.ts`), UI components, the missing VAT split on `Payment`, the missing overdue sweeper, currency mixing in aging totals, transition matrix only enforced client-side.
- `docs/audit-2026-05-billing/receipts_tax_documents_audit.md`, receipt subsystem state: `ReceiptDocument` model, the four mutating endpoints behind `receipt_finalize_enabled`, the missing CRUD endpoints, the missing PDF pipeline, the allocation stub, `MarkPaidSheet` inert info box, orphaned `CompanySettingsForm`, the bug list (`exchangeRate` not copied on credit note, double-credit-note unguarded, `reserveNumber` uses local TZ year, no VAT-rate consistency check).
- `docs/audit-2026-05-billing/financial_documents_audit.md`, financial documents subsystem state: 449-line decorative placeholder, no DB model, no API, the missing `attachments_enabled` flag, the proposed `FinancialDocument` and `FinancialDocumentAttachment` shape.
- `docs/audit-2026-05-billing/database_schema_audit.md`, schema state: missing FK on `receipt_documents.payment_id`, missing polymorphism check on `Payment`, `Payment` lacks `exchangeRate`, `CompanySettings` singleton not seeded, `reserveNumber` timezone bug, recommended indexes and check constraints.
- `docs/audit-2026-05-billing/ux_product_audit.md`, UX state: `/billing` mostly working, `/receipts` placeholder, `/financial-documents` decorative, Hebrew users seeing English chips and ISO codes, `ClientBillingTab.tsx` overloaded at 936 lines, cross-module dead ends.

The reviewer also sampled relevant code paths cited in the audits:

- `prisma/schema.prisma` lines 622-680 (`ReceiptDocument`, `ReceiptDocumentSequence`), 895-925 (`CompanySettings`), 586-620 (`Payment`).
- `prisma/fixtures/feature-flags.json` (16 flags listed; verified `attachments_enabled` is absent and `receipt_finalize_enabled` is default `false`).
- `lib/receipts/finalize.ts`, `lib/receipts/cancel.ts`, `lib/receipts/credit-note.ts`, `lib/receipts/allocation.ts` (the four files in the receipts domain layer).
- `prisma/migrations/20260524000600_receipt_invariants/migration.sql` (the `receipt_finalized_vat_sum_chk` and `receipt_finalized_exchange_rate_chk` constraints).

---

## 2. Which Israeli accounting / tax requirements were checked

Each topic below pairs a claim from `implementation_plan.md` with the supporting citation from `israel_compliance_audit.md` and a verdict.

### 2.1 VAT rate (2026)

- Plan claim: VAT 18 percent in 2026; `defaultVatBasisPoints = 1800` (Section 2 of the plan; schema default at `CompanySettings.defaultVatBasisPoints` and `ReceiptDocument.vatRateBasisPoints`).
- Citation: `israel_compliance_audit.md` §D.1 cites the 2025 increase from 17 to 18 percent and the 2026 budget vote that held the rate at 18 percent. Sources: VATcalc (`https://www.vatcalc.com/vat/israel-vat-rise-to-19-jan-2026-proposal/`) and VATupdate (`https://www.vatupdate.com/2025/12/10/israel-approves-2026-budget-vat-stays-at-18-expands-exemptions-eases-bank-entry-rules/`).
- Verdict: **Acceptable for internal testing.** 18 percent is well documented for 2026. Engineering should still store the rate per-line and per-row historically (never re-compute from "current rate") so that re-rendering an old document does not silently change the math. The plan already says so (§5.1, §5.2). Real CPA must reconfirm at production go-live.
- Reviewer note: the schema default of 1800 in `prisma/schema.prisma` is the right default but it is silent about its unit. A code-level comment "VAT rate stored as basis points; 1800 = 18.00%" is already on the `CompanySettings.defaultVatBasisPoints` field. The same comment should be replicated on `ReceiptDocument.vatRateBasisPoints` for consistency.

### 2.2 Allocation number thresholds (NIS 10K / NIS 5K schedule)

- Plan claim: NIS 10,000 from 2026-01-01, NIS 5,000 from 2026-06-01, per VAT Implementation Order 01/2025.
- Citations: Sovos (`https://sovos.com/regulatory-updates/vat/israel-tax-authority-confirms-accelerated-timeline-for-ctc-invoice-allocation-number/`), Bloomberg Tax (`https://news.bloombergtax.com/daily-tax-report-international/israel-tax-agency-clarifies-requirements-for-allocating-taxpayer-vat-invoice-numbers`), Herzog Fox & Neeman 2026 update (`https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/`), KPMG TaxNewsFlash (`https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html`). All four agree.
- Verdict: **Acceptable for internal testing.** The plan correctly stores the threshold in the country profile, not hardcoded. One sharp observation: `implementation_plan.md` §2 says "NIS 10,000 (incl. VAT) from 2026-01-01". The cited sources actually describe the threshold as **pre-VAT** (e.g. Herzog: "before VAT"; Sovos: "for invoices of NIS 10,000... or more" implicitly pre-VAT under VAT Implementation Order 01/2025). Engineering should treat the threshold as **pre-VAT** and tighten the plan wording. Real CPA must confirm the exact base (pre-VAT vs inclusive) before any production call.
- Reviewer note: the current placeholder threshold in `lib/receipts/allocation.ts:21` is `THRESHOLD_ILS_MINOR = 2_500_000` (NIS 25,000), which was the 2024-05 starting threshold. This must be replaced in Wave 1 by a country-profile function `getAllocationThreshold(date: Date, type: ReceiptDocumentType): bigint | null`, returning NIS 10,000 minor units for dates between 2026-01-01 and 2026-05-31, NIS 5,000 minor units from 2026-06-01, and `null` for non-applicable document types. The function must also restrict applicability to `tax_invoice` and `tax_invoice_receipt` types only, not `receipt` or `invoice` (the receipts audit §10.2 flagged the current code as over-broad).

### 2.3 Six document types and required fields

- Plan claim: model at least Tax Invoice, Tax Invoice/Receipt, Receipt, Proforma, Credit Note as first-class types; current schema enum is `invoice`, `receipt`, `tax_invoice`, `tax_invoice_receipt`, `credit_note`, `proforma_invoice` (six values per the receipts audit §2.1).
- Citation: `israel_compliance_audit.md` §A.1 inventory, §A.2-A.7 field rules. Source: InvoiceDataExtraction VAT requirements (`https://invoicedataextraction.com/blog/israel-vat-invoice-requirements`), Grant Thornton indirect tax guide (`https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/`), CPA-Dray Osek Patur guide (`https://cpa-dray.com/en/blog/osek-patur-guide/`).
- Verdict: **Acceptable for internal testing** for the chosen six-type enum. The schema does not yet enforce per-type required-field sets (e.g. that a `tax_invoice` row carries the issuer VAT number, the "חשבונית מס" Hebrew label, etc.). This is OK at the schema level as long as the PDF renderer (Wave 2 §5.2) and a draft-stage validation in `POST /api/receipts` enforce it per type. The exact stand-alone receipt field list (Kabbala) is the largest remaining ambiguity (`israel_compliance_audit.md` §A.3, "Unverified - needs accountant review"); UNRESOLVED until real CPA confirms.
- Reviewer note on debit notes: the existing enum does not include "Cheshbonit Hiyuv Nosaf" (חשבונית חיוב נוסף) as a separate type. `israel_compliance_audit.md` §A.7 marks this as "Unverified" and notes the common Israeli pattern is to simply issue a second full Cheshbonit Mas for the incremental amount. The reviewer accepts the current six-type enum for internal testing; the seventh type can be added later if real CPA requires it.
- Reviewer note on Osek Patur: the current schema has no concept of seller-side regime (Osek Murshe vs Osek Patur). Skyware IT LTD is presumed to be Osek Murshe (it issues Cheshbonit Mas). The country profile should expose a `getDocumentTypesForRegime(regime: "osek_murshe" | "osek_patur"): ReceiptDocumentType[]` function. For internal testing the only supported regime is `osek_murshe`; `osek_patur` throws "not yet supported".

### 2.4 Sequential numbering (atomicity, per-type per-year, year boundary)

- Plan claim: gap-free sequential numbering per type per year, transactional reservation. Wave 1 fixes `reserveNumber` to read the year in Asia/Jerusalem.
- Citation: `israel_compliance_audit.md` §B "Each tax invoice must have a unique sequential number... The Israel Tax Authority uses sequential numbering to detect gaps or duplicates during audits, so maintaining an unbroken sequence matters." Source: InvoiceDataExtraction. Also §B explicit "Unverified": annual reset vs continuous numbering.
- Verdict: **Acceptable for internal testing** for the upsert-increment pattern (`lib/receipts/finalize.ts:84-100`); the receipts audit §6.1 and the database audit §2.10 confirm the row lock from `update: { nextNumber: { increment: 1 } }` serializes correctly under READ COMMITTED. **Wave 1 must add a real-Postgres concurrency integration test** (parallel `$transaction` finalize calls on the same `(type, year)`) before any production claim. Annual-reset-vs-continuous is UNRESOLVED, keep the current "do not reset, per-type per-year monotonic" default until real CPA confirms.

### 2.5 Cancellation vs credit-note rule

- Plan claim: cancel a draft; never cancel a finalized row; the only correction is a credit note. Wave 1 adds a DB trigger or row-level check blocking `finalized -> cancelled`.
- Citation: `israel_compliance_audit.md` §J.1 "A finalized tax invoice cannot be deleted or silently cancelled. The legal mechanism is issuing a credit note (חשבונית זיכוי) that nets out the original." Source: Alfasi Israel (`https://www.alfasiisrael.com/post/what-you-need-to-know-about-self-invoices-in-israel-and-implementing-tax-decision-6369-18`).
- Verdict: **Acceptable for internal testing.** The current code blocks at the route layer (`lib/receipts/cancel.ts:18-51`). The plan correctly calls out the DB-trigger gap (currently route-only enforcement). The DB trigger must land in Wave 1 before any real-data testing, even internal, a raw SQL `UPDATE` from a misbehaving admin script could otherwise produce a non-compliant void.
- Reviewer note: a `db.delete` on a finalized receipt is currently blocked only by `ON DELETE RESTRICT` from the referencing tables (e.g. `Payment.linkedReceiptId` is SET NULL, not RESTRICT). Wave 1 should add a row-level trigger or a `CHECK` constraint that hard-blocks DELETE of any row whose `status = 'finalized'`, regardless of references. Treat this as a defense-in-depth measure: the route layer already blocks the action, but a misbehaving script should not be able to bypass it via raw SQL.

### 2.6 Exchange rate requirement for non-ILS

- Plan claim: `exchangeRate Decimal? @db.Decimal(18,6)` exists on `ReceiptDocument` (Phase 3 already shipped). Wave 1 adds the column to `Payment` for symmetry; Wave 1 also fixes `issueCreditNote` to copy `exchangeRate` from source.
- Citation: `israel_compliance_audit.md` §E.2: foreign-currency invoices must show "Transaction amount in foreign currency; Equivalent amount in NIS at transaction date; Exchange rate used (Bank of Israel representative rate); VAT is always calculated on the NIS equivalent, not on the foreign currency amount." Source: InvoiceDataExtraction. Also §E.2 Bank of Israel explanatory notes (`https://www.boi.org.il/en/economic-roles/financial-markets/explanatory-notes-to-the-representative-exchange-rates/`) showing that the BoI rate is the standard reference but not legally binding by default.
- Verdict: **Acceptable for internal testing.** The `receipt_finalized_exchange_rate_chk` constraint (`prisma/migrations/20260524000600_receipt_invariants/migration.sql`) is solid. The plan correctly identifies the credit-note copy bug. Real CPA must confirm the FX-source policy (BoI representative rate as default, with operator override) before production. For internal testing, defaulting to BoI is sane.

### 2.7 VAT sum invariant (totalAmount = amountBeforeVat + vatAmount)

- Plan claim: enforced at the DB level by `receipt_finalized_vat_sum_chk`; Wave 1 adds an application check that `vatAmount = round(amountBeforeVat * vatRateBasisPoints / 10000)` within +/- one minor unit.
- Citation: `israel_compliance_audit.md` §A.2 "VAT amount must appear as a distinct, separate line, not bundled into the total." Source: InvoiceDataExtraction.
- Verdict: **Acceptable for internal testing.** The sum invariant is enforced. The rate-consistency check is the right Wave 1 addition; the receipts audit §7.4 flagged that the current sum check accepts a wrong-rate row as long as the arithmetic adds up.

### 2.8 Hebrew rendering / RTL on documents

- Plan claim: Heebo font embedded; PDF template supports RTL; Hebrew designations "חשבונית מס" and "עוסק מורשה" (and "חשבונית זיכוי", "חשבון עסקה") required in the header.
- Citation: `israel_compliance_audit.md` §F: "These Hebrew terms are non-negotiable, they must appear on the invoice even if every other field is written in English, Arabic, or any other language." Source: InvoiceDataExtraction. Also `israel_compliance_audit.md` §A.2 "מסמך ממוחשב" stamp for computerized documents. Source: dddinvoices (`https://dddinvoices.com/learn/e-invoicing-israel`).
- Verdict: **Acceptable for internal testing.** Heebo is OFL-licensed and renders Hebrew + Latin glyphs. The "מסמך ממוחשב" stamp is mandatory and the plan should explicitly require it on every PDF (the receipts audit §11 lists it as a separate template item; reinforce here). The renderer must also produce the "Original" marker on the original copy per Grant Thornton (`https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Israel/`).

### 2.9 Retention period

- Plan claim: archive originals for 7 years (or whatever `CompanySettings.retentionYears` reads from the country profile); use hash-locked storage (S3 Object Lock or equivalent); the retention sweeper is deferred to V1.5.
- Citation: `israel_compliance_audit.md` §G: "All invoices and supporting documentation must be retained for a minimum of 7 years from the end of the tax year in which they were issued." Source: InvoiceDataExtraction. Cross-confirmed at EDICOM (`https://edicomgroup.com/blog/israel-electronic-invoice-clearance-model`).
- Verdict: **Acceptable for internal testing** for the 7-year posture and the planned S3 Object Lock equivalent. The Bookkeeping Order may have nuances (e.g. some source documents have longer retention). Archive-abroad conditions are UNRESOLVED, real CPA must confirm whether the chosen S3 region (likely outside Israel) qualifies under the "archiving abroad allowed under conditions" rule from Thomson Reuters (`https://europe.thomsonreuters.com/compliance/regulatory-updates/israel`).
- Reviewer note: even for internal testing, the team should set the S3 bucket's Object Lock retention to at least 30 days (so a test PDF cannot be deleted while a QA cycle is running) and use a separate bucket from any production bucket. Internal test PDFs carry the "DRAFT - NOT FOR PRODUCTION" watermark per Section 7 and are not legally-binding documents, but the team should still practice the retention discipline now so it does not appear as a foreign concept at production go-live.

### 2.10 PCN874 readiness

- Plan claim: the data model must be PCN874-export-ready (supplier VAT ID, recipient VAT ID, invoice number, allocation number, date, amount excluding VAT, VAT amount, VAT rate) even though the export generator is deferred.
- Citation: `israel_compliance_audit.md` §H.1, Tzer (`https://tzer.co.il/en/vat-pcn-report-in-israel/`). Mandatory from January 2026 above NIS 500K turnover.
- Verdict: **Acceptable for internal testing.** The current `ReceiptDocument` model carries enough fields if `clientId` joins through `Client.israeliTaxId` (already partial-unique-indexed) for the recipient VAT ID, and `CompanySettings.vatNumber` supplies the supplier VAT ID. The plan correctly defers the export generator.

### 2.11 SHAAM API auth + 3-month expiry

- Plan claim: OAuth2 user-restricted, JSON, sandbox URL `https://ita-api.taxes.gov.il/shaam/tsandbox/MultiApprovals/v2`, production URL `https://ita-api.taxes.gov.il/shaam/production/MultiApprovals/v2`; the 3-month authorization expires and must be renewed; build a "valid until" indicator and a reminder notification.
- Citation: `israel_compliance_audit.md` §C.4, §C.5. Source: ITA Open API service page PDF (`https://www.gov.il/BlobFolder/service/connect-to-shaam/he/Service_Pages_shaam_Tax-Authority-Open-API.pdf`, returns 403 to programmatic fetchers but is the public spec), Sovos OpenAPI User Guide PDF (`https://developer-guide.sovos.com/wp-content/uploads/2023/10/ENG-official-OpenApiUserGuide.pdf`), and Green Invoice (`https://www.greeninvoice.co.il/magazine/israel-invoice/`) for the 3-month re-auth interval.
- Verdict: **Acceptable for internal testing of the skeleton against sandbox only.** The current `lib/receipts/allocation.ts` is a state-marking stub with a placeholder threshold (25,000 ILS minor units). The plan correctly says the real SHAAM call is documented but not wired in V1, and the company must enroll in the Tax Authority portal before enabling. **Production call is BLOCKED until real CPA + project owner explicitly sign off.**
- Reviewer note on the four rejection outcomes: per `israel_compliance_audit.md` §C.3, the SHAAM rejection flow ("Error 460" effective from 2025-01-01) requires the supplier to choose between Cancel, Continue (the invoice carries a "no input tax should be deducted" notice), Reversal (zero-VAT invoice plus customer self-invoice), or Request Hearing. The current schema's `AllocationStatus` enum has four values (`not_required`, `pending`, `issued`, `failed`) which does not map 1-to-1 onto the four rejection outcomes. For internal testing the four-value enum is fine; before any production call the enum likely needs to expand to capture which rejection-flow choice was made (e.g. `rejected_continue`, `rejected_reversal`, `rejected_hearing`). UNRESOLVED, real CPA + the ITA technical-spec v2.0 must confirm the exact state machine.
- Reviewer note on credentials: store SHAAM credentials only in env vars, never in DB. The connection authorization expiry must be tracked in a small dedicated table (e.g. `ShaamConnectionAuth { issuedAt, expiresAt, scope, lastRefreshedAt }`) or in `CompanySettings` so the "valid until" indicator and the reminder cron have a single source of truth.

---

## 3. Which requirements are acceptable for INTERNAL TESTING

The following work items are safe to build, ship into the worktree, and exercise against internal seed data while `receipt_finalize_enabled` stays default false in production and the env gate `ALLOW_PRODUCTION_ISSUANCE` stays unset. Each item is paired with a one-line reason it is internal-safe.

DB / schema work:

- Add `CountryCode` enum (`IL`, `_OTHER`) and migrate `CompanySettings.country` to it.
  - Internal-safe: schema-only change with a single supported profile; `_OTHER` throws so accidental cross-country use crashes loudly.
- Add Payment FK from `receipt_documents.payment_id -> payments.id` with `ON DELETE SET NULL`.
  - Internal-safe: closes a documented orphan-risk bug (database audit §3.1) with no behavior change.
- Add Payment polymorphism check constraint (`Payment.sourceType` matches the populated source FK).
  - Internal-safe: tightens an existing column with no new fields; matches the May-24 audit §3.4 recommendation.
- Add Payment VAT split fields migration (`amountBeforeVat`, `vatAmount`, `totalAmount`, `vatRateBasisPoints`, `currencyExchangeRate`).
  - Internal-safe: new nullable columns; old payments remain valid; new code path uses them for correct VAT reconciliation against receipts.
- Add new `FinancialDocument` and `FinancialDocumentAttachment` models per the financial-documents audit §3.
  - Internal-safe: new tables; no production migration risk; inbound-only data so no outbound regulatory exposure.
- Add partial unique index for "one credit note per source" (`creditedReceiptId WHERE type = 'credit_note'`).
  - Internal-safe: closes a real double-refund bug; accountant should confirm policy but the constraint can be added behind a "you may need to drop it for legitimate re-issue" comment.
- Add receipt VAT-rate consistency check at finalize (application-layer, +/- one minor unit tolerance).
  - Internal-safe: tightens existing math; complements the existing `receipt_finalized_vat_sum_chk` constraint.
- Add the DB-level trigger blocking `finalized -> cancelled` direct UPDATE.
  - Internal-safe: closes the route-only gap called out in `prisma/migrations/20260524000600_receipt_invariants/migration.sql:29-32`.
- Add the DB-level trigger blocking DELETE of any row whose `status = 'finalized'`.
  - Internal-safe: belt-and-braces guard so a misbehaving admin script cannot bypass the route layer.
- Seed the singleton `CompanySettings` row with placeholder Israeli values.
  - Internal-safe: avoids the "fresh DB renders empty receipts" footgun; placeholder VAT number flagged as "TEST" so it cannot accidentally appear on a real document.
- Add (optional) `companyHeaderJson Json?` snapshot column on `ReceiptDocument` (receipts audit §3.1 recommendation 5).
  - Internal-safe: closes the "stale company header on old receipt" bug by snapshotting at finalize time.

API / endpoints (all behind `receipt_finalize_enabled` and the new `ALLOW_PRODUCTION_ISSUANCE` env gate):

- `POST /api/receipts` (admin create draft) with Zod validation of `descriptionLines`.
  - Internal-safe: the draft path is necessary to even exercise the finalize/cancel/credit-note routes; flag-gated.
- `GET /api/receipts` (list), `GET /api/receipts/[id]` (detail).
  - Internal-safe: read endpoints; admin-only.
- `PATCH /api/receipts/[id]` (edit draft fields).
  - Internal-safe: drafts are pre-finalize; no compliance weight; PATCH must reject the field set on finalized rows (only `notes` or similar non-numeric metadata can be edited if at all, and even that should be discussed with the real CPA).
- `GET /api/receipts/[id]/pdf` (signed-link rendered on demand) with the **DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה** watermark always on.
  - Internal-safe: the watermark is hard-coded ON until all three gates pass per Section 7.
- `POST /api/payments/[id]/issue-receipt` (create draft from paid Payment).
  - Internal-safe: pre-fills, still a draft; also writes `Payment.linkedReceiptId` (the missing-writer bug per the receipts audit §15 recommendation 16).
- `POST /api/financial-documents` plus list/detail/patch/delete.
  - Internal-safe: inbound documents only, no outbound issuance; supports the input-VAT capture data model for future PCN874 export.
- The four existing mutating receipts endpoints (finalize, cancel, credit-note, allocation).
  - Internal-safe **only while the flag stays off in production** and only against seed users in the test DB.
- `POST /api/admin/feature-flags/:key` already exists; no changes required for testing. Continue using the Radix confirmation dialog for `receipt_finalize_enabled`.

PDF template development:

- Build the HTML template with the mandatory Hebrew header block ("חשבונית מס" / "חשבונית זיכוי" / "חשבון עסקה" / "קבלה" / "חשבונית מס/קבלה"), the "עוסק מורשה" line with `CompanySettings.vatNumber`, the "מסמך ממוחשב" stamp, and the "Original" marker.
  - Internal-safe with placeholder company values; the watermark prevents accidental real use.
- Embed Heebo (OFL) for Hebrew + Latin glyph coverage.
  - Internal-safe; OFL permits redistribution in PDFs.
- Snapshot the company header into the receipt row at finalize time (the receipts audit §3.1 and DB audit §2.9 recommend `companyHeaderJson Json?`).
  - Internal-safe: closes the "stale header on old receipt" bug.
- Render bilingual layouts and per-line VAT rate columns.
  - Internal-safe.
- Bake a permanent watermark into every PDF page until the `pdf_watermark_disabled` flag and the env gate both pass.
  - Internal-safe and mandatory; the watermark is the most important UX guardrail in the system.
- Render the allocation number prefix "מספר הקצאה:" when `allocationStatus = "issued"` and `allocationNumber` is set (per `israel_compliance_audit.md` Implementation gate #8 and §C).
  - Internal-safe: until real SHAAM is wired, this line stays empty; renderer code should be ready.

Bug fixes (all from the receipts audit §15 and database audit):

- `issueCreditNote` copies `exchangeRate` and `currency` from source.
  - Internal-safe: closes a latent bug where non-ILS credit notes cannot be finalized.
- `reserveNumber` reads the year in Asia/Jerusalem.
  - Internal-safe: closes a year-boundary bug; without this fix a UTC-hosted server filing a finalize at 01:30 IST on Jan 1 would put the row under the previous year.
- DB trigger blocking `finalized -> cancelled` direct UPDATE (already listed above).
- DB trigger blocking DELETE on `status = 'finalized'` rows (already listed above).
- Block double credit-noting via partial unique index (already listed above).
- `Payment.linkedReceiptId` writer added inside the new create-from-payment endpoint.
  - Internal-safe: closes the dead-column bug; allows reverse lookup "which payment generated this receipt".
- Add the `attachments_enabled` flag to `prisma/fixtures/feature-flags.json` (currently absent; financial-documents audit §6).
  - Internal-safe and necessary for the financial-documents module to even upload.
- Refactor the "not found" detection in the receipts route layer to use `ReceiptNotFoundError extends ReceiptStateError` (receipts audit §15 recommendation 14).
  - Internal-safe: brittle string comparison today (`err.message === "receipt not found"`).

Country-toggle architecture:

- `lib/compliance/country.ts` with the single `IL` profile and an explicit throw on `_OTHER`. Internal-safe: prevents accidental cross-country use.
- Country badge in the admin header. Internal-safe.

UI work:

- `/receipts` list page with filter chips (status, type, year, client). Internal-safe.
- `/receipts/[id]` detail page (PDF preview, edit draft, finalize button with Hebrew accountant warning, credit-note button, allocation pill). Internal-safe under the flag.
- Replace the inert "Create receipt" copy in `MarkPaidSheet` with a real button that routes to `/receipts/[id]` after creating the draft. Internal-safe.
- Working upload widget for `/financial-documents` reusing `AttachmentUploader` with a new `parentKind='financial_document'`. Internal-safe.
- Split `ClientBillingTab.tsx` (936 lines) into four files (`MonthlySection`, `HourlyBanksSection`, `OneTimeSection`, `PaymentsSection`). Internal-safe refactor.
- Add edit dialogs for monthly items, hourly banks, one-time charges (PATCH routes already exist). Internal-safe.

i18n / RTL / format work:

- Replace `toLocaleDateString("en-GB", ...)` with `Asia/Jerusalem`-aware Hebrew/English formatters. Internal-safe.
- `Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" })` for amounts. Internal-safe.
- `PaymentStatusChip`, `BillingPageActions`, `BurnRateBar`, `ClientBillingTab` section headers all consume `useT(...)`. Internal-safe.

Internal demo data + seed:

- Seed a small set of fake clients with Israeli-shaped tax IDs marked clearly as test rows. Internal-safe: necessary for QA.
- Seed `CompanySettings` with placeholder Skyware values flagged as "TEST". Internal-safe.

Internal test users issuing fake invoices in a test DB:

- The four flag-gated endpoints may be exercised by internal admins, in a non-production environment, against seeded test clients. The PDFs produced bear the permanent "DRAFT - NOT FOR PRODUCTION" watermark. Internal-safe.

---

## 4. Which requirements are BLOCKED FOR PRODUCTION

The following items must NOT go live without an explicit, dated, written sign-off from a real Israeli CPA plus the project owner (Jeries Khoury) plus, where relevant, a lawyer. Each is paired with the specific production-only risk.

- Real customer issuance of any finalized Cheshbonit Mas (tax invoice).
  - Risk: issuing an out-of-spec tax invoice creates a "tax accident" (`israel_compliance_audit.md` §A.2 and Top-5 risk #1) with interest, penalty, and reputational exposure with the ITA. The customer would also be unable to deduct input VAT if any mandatory field is missing.
- Real customer issuance of any finalized Cheshbonit Mas/Kabbala (combined tax invoice + receipt).
  - Risk: same as above, plus the cash-basis/accrual tax-point question (UNRESOLVED, see §5 item 5).
- Real customer issuance of any finalized Kabbala (stand-alone receipt).
  - Risk: the exact mandatory field list is UNRESOLVED (`israel_compliance_audit.md` §A.3); issuing an under-specified receipt is non-compliant under the Income Tax Rules (Bookkeeping) 5733-1973.
- Real customer issuance of any finalized Cheshbonit Zikkui (credit note).
  - Risk: a credit note must independently meet tax-invoice mandatory-field rules (`israel_compliance_audit.md` §A.6); issuing one without real-CPA template review risks invalidating the reversal and leaving the original invoice on the books.
- Real SHAAM allocation API calls against the production endpoint (`https://ita-api.taxes.gov.il/shaam/production/MultiApprovals/v2`).
  - Risk: the company must first enroll in the ITA personal area, authorize personnel (representative authorization requires a lawyer's letter), and maintain a non-expired 3-month connection authorization (`israel_compliance_audit.md` §C.5). Calling production without these gates open will fail and may produce audit signals.
- Real-world PCN874 reporting.
  - Risk: out of V1 scope; if the firm crosses the NIS 500K turnover threshold (`israel_compliance_audit.md` §H.1), an unbuilt filer means a missed filing with penalty exposure (NIS 239 per two-week period of delay).
- Marketing, contract, sales-deck, or website language claiming the system is "compliant", "approved", "ITA-certified", or "Tax-Authority-ready".
  - Risk: misrepresentation; legal and reputational exposure. Internal-only documents may say "internal testing" but never "compliant".
- Removal of the "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה" watermark from any rendered PDF.
  - Risk: without the watermark, an internal test document could be mistaken for a real tax invoice; this is the most important UX guardrail. Removal must be gated by both a feature flag (`pdf_watermark_disabled` default false) AND the env gate `ALLOW_PRODUCTION_ISSUANCE`.
- Flipping `receipt_finalize_enabled` to true in any production environment.
  - Risk: enables the finalize / cancel / credit-note / allocation endpoints; even if PDFs still carry watermarks, finalize writes immutable rows with an assigned `documentNumber` and `documentNumberYear` from the gap-free sequence. Burning numbers on test data in production would force a real-CPA-coordinated reset of the sequence (which itself is non-trivial because the ITA expects gap-free numbering).
- Any default-on for `receipt_finalize_enabled` in `prisma/fixtures/feature-flags.json`.
  - Risk: a fresh-DB deploy would auto-enable; the flag must stay `false` in the fixture and the description text must keep the "MUST remain false" framing already in place.
- Any default-on for `ALLOW_PRODUCTION_ISSUANCE` env (recommended new gate; see Section 7).
  - Risk: bypasses the env gate and re-enables the regulatory event paths.
- Any wiring of the real SHAAM production credentials into a production env file before sandbox-first end-to-end success has been logged and reviewed.
  - Risk: a misconfigured client could call the production endpoint with test payloads.
- Hard-deletion or "void" UI affordance on any finalized receipt.
  - Risk: cited `israel_compliance_audit.md` §J.1, only credit notes correct a finalized tax invoice; building such a button at all is non-compliant.
- Any export of receipts to a real bookkeeping system (Hashavshevet, Green Invoice, iCount, Powerlink) before real-CPA-approved templates and numbering policy are in place.
  - Risk: cross-contamination of test rows with the firm's real books; reconciliation nightmare and potential ITA exposure.
- Real "email this receipt to the client" send path on any finalized document.
  - Risk: outbound delivery is itself a regulatory event, the customer holds the document for input-VAT-deduction purposes; sending an out-of-spec document risks the customer's own filing.
- Any internal demo to a real customer or prospect that shows a non-watermarked, non-test-flagged PDF.
  - Risk: customer mistakes the demo for a live system; expectation drift.

---

## 5. Which assumptions still need REAL ACCOUNTANT CONFIRMATION

Pulled from `israel_compliance_audit.md` (every "Unverified - needs accountant review" callout) plus items the reviewer identified in the per-module audits. Each is phrased as one direct question the project owner should put to a licensed Israeli CPA.

1. Annual reset vs continuous numbering: should `ReceiptDocumentSequence` reset to 1 at the start of each tax year for each document type, or remain continuous across years for our books regime? (`israel_compliance_audit.md` §B "Unverified")
2. Exact stand-alone Kabbala (receipt) field list: which fields are mandatory on a stand-alone receipt under the Income Tax Rules (Bookkeeping) 5733-1973, number, date, payer name, payment-method, currency, our VAT ID, the payer's VAT ID, a signature line, anything else? (`israel_compliance_audit.md` §A.3 "Unverified")
3. Eilat zone services scope: does the Eilat 0% VAT exemption apply to IT services billed to an Eilat-zone client, or only to goods? If services qualify, which conditions must we document on the invoice? (`israel_compliance_audit.md` §D.4 "Unverified")
4. Credit-note time limit: is there a binding time limit (e.g. "within the open VAT period" vs "up to one year") on issuing a credit note against a finalized tax invoice for Skyware's books? (`israel_compliance_audit.md` §J.4 "Unverified")
5. Cash-basis vs accrual choice: should Skyware IT LTD's books be cash-basis or accrual-basis for VAT? This determines whether the tax-point is the supply date or the cash-receipt date, and which document we issue at which step. (`israel_compliance_audit.md` §A.4, §I.3 "Unverified"; §K.1 "Unverified")
6. Debit-note workflow: do we need a separate "Cheshbonit Hiyuv Nosaf" (חשבונית חיוב נוסף) document type for incremental charges against an existing invoice, or is the common Israeli pattern (issue a second full Cheshbonit Mas for the incremental amount) sufficient for our scenarios? (`israel_compliance_audit.md` §A.7 "Unverified")
7. Equipment-vs-services per-line VAT: when a single invoice mixes equipment lines (taxable in Israel) and zero-rated services to a foreign resident, do we need any documentation beyond per-line VAT rate, or are there additional substantiation rules? (`israel_compliance_audit.md` §K.4)
8. Archive-abroad conditions: under what specific conditions may we archive PDFs in S3 in a non-Israeli region (e.g. AWS eu-central-1 or Cloudflare R2 EU) under the Bookkeeping Order? Do we need a written notification to the ITA? (`israel_compliance_audit.md` §G "Unverified")
9. PDF/A vs any non-mutable PDF: is the digital archive required to be PDF/A (ISO 19005), or is any non-mutable PDF (hash-locked S3 object) acceptable for the 7-year retention bar? (`israel_compliance_audit.md` §G "Unverified")
10. Date format conventions: must the rendered invoice display Gregorian dates in DD/MM/YYYY format, or is ISO YYYY-MM-DD acceptable? Do we also need to display the Hebrew-calendar equivalent? (`israel_compliance_audit.md` §E.3 "Unverified")
11. Osek Patur vs Osek Murshe: Skyware IT LTD is presumed to be Osek Murshe (it issues Cheshbonit Mas). Please confirm in writing, and confirm whether the receipt module needs to also support an Osek Patur tenant model now (for future clients) or later. (`israel_compliance_audit.md` §A "What this means for the implementation")
12. Reverse-charge on foreign clients: do any of Skyware's current foreign clients trigger reverse-charge VAT (the buyer self-assesses)? If yes, which invoice annotation is required on our side? (`israel_compliance_audit.md` §D.3)
13. Withholding-tax certificate posture: is the firm's `אישור ניכוי מס במקור` current; if not, our customers must withhold 30% at source. Does the receipt module need a "withholding applied" line? (`israel_compliance_audit.md` §M.1)
14. The 14-day issuance rule: should we enforce the 14-day "issue tax invoice within 14 days of supply or payment, whichever comes first" rule as a hard block, a soft warning, or no UI signal? (`israel_compliance_audit.md` §I.2)
15. Allocation threshold base (pre-VAT vs inclusive): per Section 2.2 above, confirm the NIS 10,000 / NIS 5,000 thresholds apply to the pre-VAT amount (not VAT-inclusive). Plan wording currently says "incl. VAT" which contradicts the cited sources.
16. SHAAM company enrollment timeline: when will Skyware IT LTD complete the ITA personal-area enrollment, the authorized-personnel filing (representative-letter / SMS confirm), and the first 3-month connection authorization? This is a hard prerequisite for any production call.
17. Computerized-document notification: who files the "מסמך ממוחשב" prior notification to the ITA, and when? (`israel_compliance_audit.md` §A.2, §G.1)
18. Accountant template review: who is the accountant of record who will visually review the rendered Cheshbonit Mas, Cheshbonit Zikkui, and Cheshbonit Mas/Kabbala templates against a real specimen, and when? (`israel_compliance_audit.md` §M.1)
19. Numbering starting point: do we begin every (type, year) sequence at 1, or are there vendor-mandated starting numbers (e.g. continuing a series imported from prior software)? (`receipts_tax_documents_audit.md` §6.6)
20. Section 30(a)(5) zero-rating: which standard contract template, if any, supports zero-rating under Section 30(a)(5) for foreign-resident clients given the narrowing caselaw? (`israel_compliance_audit.md` §D.2)

---

## 6. Which implementation items are ALLOWED TO PROCEED NOW

This is the work queue for the engineering team. Items are taken from `implementation_plan.md` Wave 0 and Wave 1, reordered to land DB integrity and bug fixes before broader scope, and marked GO or DEFER. Anything not on this list is not authorized.

Wave 0 (operational):

- GO: Hand the printed `israel_compliance_audit.md` plus the receipt template mock to the accountant. (Plan Wave 0 item 1.)
- GO: Open the Section 5 questions list above to the accountant for written answers. (New item, supersedes the Wave 0 "Receive sign-off on items 1-9" line, which is too broad; reduce to "Receive written answers on Section 5 questions".)
- GO: Confirm SHAAM portal enrollment timeline. (Plan Wave 0 item 3.)
- DEFER: any framing of Wave 0 as "the accountant signs off on items 1-9 of §7" of the plan. That sign-off cannot happen before the real CPA reviews the open questions; treat Wave 0 as "kick off the conversation", not "close the conversation".

Wave 1 (code):

- GO: Add missing `attachments_enabled` flag to `prisma/fixtures/feature-flags.json`. (Plan Wave 1 item "Add missing `attachments_enabled` flag to fixtures".)
- GO: Seed `CompanySettings` singleton with placeholder Israeli values, marked clearly as TEST values in `legalNameHe`, `vatNumber`, etc. (Plan Wave 1 item "Seed `CompanySettings`".)
- GO: Re-link `CompanySettingsForm` into the admin tab. (Plan Wave 1 item "Re-link `CompanySettingsForm`".)
- GO: Add `CountryCode` enum + `CompanySettings.country` migration to the enum. (Plan Wave 1 item "Add `CountryCode` enum".)
- GO: Add `lib/compliance/country.ts` with the Israel profile (default VAT basis points, allocation-threshold function with the 2026-01-01 / 2026-06-01 schedule, numbering rule = "continuous by default", retention = 7 years). (Plan Wave 1 item "Add `lib/compliance/country.ts`".)
- GO: Add `lib/format.ts` with `Asia/Jerusalem`-aware currency and date formatters. (Plan Wave 1 item "Add `lib/format.ts`".)
- GO: Apply i18n + format fixes across the billing surface (status chips, source-type labels, date display, currency symbol). (Plan Wave 1 item "Apply i18n + format fixes".)
- GO: Fix `reserveNumber` to read the year in `Asia/Jerusalem` via `Intl.DateTimeFormat`. (Plan Wave 1 item "Fix `reserveNumber` Asia/Jerusalem".)
- GO: Fix `issueCreditNote` to copy `exchangeRate` and `currency` from the source. (Plan Wave 1 item.)
- GO: Add partial unique index for "one credit note per source" (`creditedReceiptId WHERE type = 'credit_note'`). (Plan Wave 1 item.)
- GO: Add receipt VAT rate consistency check at finalize (`vatAmount = round(amountBeforeVat * vatRateBasisPoints / 10000)` within +/- one minor unit). (Plan Wave 1 item.)
- GO: Add a DB trigger blocking `finalized -> cancelled` UPDATE at the row level. (Plan Wave 1 item.)
- GO: Add Payment FK on `receipt_documents.payment_id -> payments.id` with `ON DELETE SET NULL`. (Database audit §3.1, this is the missing FK; the plan calls it out under "Add Payment FK + polymorphism check constraint".)
- GO: Add Payment polymorphism check constraint (`sourceType = 'monthly'` requires `source_monthly_id IS NOT NULL` and others NULL; analogous for `hourly_bank`; one-time linkage via the reverse FK on `OneTimeJobCharge.paymentId`).
- GO: Add Payment VAT split fields migration (`amount_before_vat`, `vat_amount`, `total_amount`, `vat_rate_basis_points`, `currency_exchange_rate`).
- GO: Enforce Payment status transition matrix at PATCH (server-side). (Plan Wave 1 item.)
- GO: Add the new env-driven boolean `ALLOW_PRODUCTION_ISSUANCE` (default false) and the new `pdf_watermark_disabled` feature flag (default false). (New item; see Section 7.)
- GO: Make the PDF renderer (when it lands in Wave 2) always render the "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה" watermark unless BOTH `pdf_watermark_disabled = true` AND `ALLOW_PRODUCTION_ISSUANCE = true`. Implement the gate plumbing in Wave 1 even though the watermark itself lands with the renderer. (New item; see Section 7.)
- DEFER to Wave 2: any new receipts CRUD endpoint (`POST /api/receipts`, `GET /api/receipts`, `GET /api/receipts/[id]`, `PATCH /api/receipts/[id]`, `GET /api/receipts/[id]/pdf`, `POST /api/payments/[id]/issue-receipt`). These are part of the Receipts V1 deliverable and depend on the country profile + format + flag plumbing landing first.
- DEFER to Wave 2: the PDF render pipeline (Puppeteer + Heebo + template + header snapshot on finalize). Requires the country profile.
- DEFER to Wave 3: the `FinancialDocument` schema + endpoints + UI. Inbound documents are not blocking for the receipts work.
- DEFER to Wave 4: country chip badge in the admin header, cross-module deep links, `ClientBillingTab.tsx` split. Polish, not blocking.
- DEFER to Wave 5: real SHAAM API integration (sandbox call first), accountant flip, pilot real-money invoice.

---

## 7. Which implementation items must stay FEATURE-FLAGGED OR LOCKED

This is the required lock posture for the duration of internal testing. The team must not relax any of these without explicit, dated, written sign-off from a real Israeli CPA plus the project owner.

Existing flags (defaults must not change):

- `receipt_finalize_enabled` stays `false` in `prisma/fixtures/feature-flags.json`. The description text "MUST remain false until accountant verifies templates, VAT rate, numbering, and any Tax Authority requirements" must remain. The Radix confirmation dialog in `FeatureFlagSection.tsx` (lines 108-143) must remain.
- `financial_documents_module` stays `false` in `prisma/fixtures/feature-flags.json`. Acceptable to flip on in a non-production environment for internal QA of the upload widget.
- `attachments_enabled` must be added to `prisma/fixtures/feature-flags.json` with default `false` and description "Allow S3 attachments and the upload widget". Currently missing entirely; blocks the financial-documents module from working at all (financial-documents audit §6).

New env gate (must be added):

- `ALLOW_PRODUCTION_ISSUANCE` (env var). Default false. Wraps every call to the real SHAAM production endpoint, every code path that would remove the PDF watermark, and any "Email this finalized receipt to the client" send. Even if `receipt_finalize_enabled = true` in a production database, this env gate blocks real-world issuance unless the env var is explicitly set on the production server.
- Rationale: a feature flag is per-DB and can be flipped from the admin UI in seconds. An env var is per-environment and requires a deploy. The combination prevents a UI mistake from triggering a production-side regulatory event.

New feature flag (must be added):

- `pdf_watermark_disabled` (flag). Default false. Controls only the PDF watermark; never controls finalize or SHAAM. Must be flipped on AND `ALLOW_PRODUCTION_ISSUANCE=true` must be set AND `receipt_finalize_enabled = true` for a clean-of-watermark PDF to render. Three gates in series. None of the three should default to true.

New watermark requirement:

- Every PDF rendered by `GET /api/receipts/[id]/pdf` must include a diagonal watermark "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה" across every page, plus a footer line in red Hebrew "מסמך לא חוקי - למטרות בדיקה פנימית בלבד" (this document is not legally valid, for internal testing only). The watermark renders unless all three gates pass: `receipt_finalize_enabled = true` AND `pdf_watermark_disabled = true` AND `process.env.ALLOW_PRODUCTION_ISSUANCE === "true"`. Any single gate failing keeps the watermark on.
- The renderer must not have a code path that bypasses the watermark for a "preview" mode. If someone needs a watermark-free preview during internal testing, the answer is "no preview; the watermark is always on until production sign-off".

Additional locks the team should add:

- A boot-time assertion in `lib/receipts/allocation.ts` that the SHAAM client base URL contains the substring `tsandbox` whenever `ALLOW_PRODUCTION_ISSUANCE !== "true"`. If the prod URL is loaded in a non-production env, fail fast.
- A boot-time assertion that `CompanySettings.vatNumber` either starts with "TEST" or matches the real Skyware IT LTD VAT number registered in the env var `SKYWARE_REAL_VAT_NUMBER`, when `ALLOW_PRODUCTION_ISSUANCE = true`. Prevents a test row leaking into a production issuance.
- A unit test that asserts the three flags / gates above all default to off in `prisma/fixtures/feature-flags.json`, in `.env.example`, and in the fresh-DB seed. The test must fail loudly if any default flips to true.
- Audit log entries on every change to `receipt_finalize_enabled`, `pdf_watermark_disabled`, and (where observable) `ALLOW_PRODUCTION_ISSUANCE`. Capture actor user id and timestamp.
- A `compliance_gates` admin-screen card (per `israel_compliance_audit.md` §M.2 / Implementation gate #1) listing every open question from Section 5 of this document, with a manual "real CPA initialled this" checkbox per row. The "Finalize" button on `/receipts/[id]` should be disabled at the UI level while any of these checkboxes is unchecked, regardless of the underlying flag state.
- A red banner across the top of `/receipts` and `/receipts/[id]` while either `receipt_finalize_enabled = false` or `ALLOW_PRODUCTION_ISSUANCE !== "true"`, reading "Internal testing only. No real customer issuance is enabled." (English + Hebrew). The banner stays even after the flag flips to true, until the env gate is also set.

Three-gate model summary (this is the load-bearing safety pattern):

- Gate 1: `receipt_finalize_enabled` feature flag (per-DB, admin-toggleable). Default false.
- Gate 2: `ALLOW_PRODUCTION_ISSUANCE` env var (per-environment, requires deploy). Default unset.
- Gate 3: `pdf_watermark_disabled` feature flag (per-DB, admin-toggleable). Default false.

For a clean, production-grade rendered PDF (no watermark, no "internal testing" banner, eligible for real customer delivery and real SHAAM allocation calls), ALL THREE gates must pass. Any single gate failing keeps the watermark on, keeps the banner on, and forces SHAAM to the sandbox endpoint. The three gates are layered intentionally: flipping a flag in the admin UI is fast but reversible; setting an env var requires a deploy; the watermark is a visual cross-check on the PDF itself. A real customer issuance event therefore requires three independent human actions in three independent surfaces. That is the boundary this reviewer is approving for internal-testing-only use.

---

## 8. Final status

```
Internal testing      : APPROVED  (with conditions in Sections 3 + 6 + 7)
Production issuance   : NOT APPROVED  (real CPA + legal + project owner sign-off required)
Reviewer              : Senior Israeli Accountant Agent (internal-only reviewer; NOT a real CPA)
Date                  : 2026-05-25
Conditions            : Sections 3, 4, 6, 7 above MUST be honored throughout development.
                        The watermark + env gate stay in place until explicit production sign-off.
                        Section 5 questions MUST be answered in writing by a real Israeli CPA
                        before any flip of `receipt_finalize_enabled` in a production DB.
```

Implementation may proceed internally per Sections 3 and 6 only. The engineering team is cleared to build and test the schema migrations, API endpoints behind `receipt_finalize_enabled = false`, PDF templates with placeholder values, country-toggle architecture, bug fixes, and i18n/format/RTL work, provided every rendered PDF carries the "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה" watermark, every SHAAM call goes to the sandbox endpoint only, the `ALLOW_PRODUCTION_ISSUANCE` env gate stays unset, and no marketing or contract language calls the system "compliant" or "approved". Real customer issuance, finalized tax invoices, receipts, credit notes, and any production SHAAM allocation call, stays locked until a real Israeli CPA and the project owner provide written sign-off after answering the open questions in Section 5.

Rollback note: if the engineering team needs to roll back from an attempted internal flip of `receipt_finalize_enabled`, the procedure is (a) flip the flag back to false in the admin UI, (b) verify no real-customer document was issued by querying `ReceiptDocument WHERE status = 'finalized' AND createdAt >= flag-flipped-at`, (c) for any finalized rows that exist, issue credit notes immediately rather than attempting cancellation, (d) snapshot the audit log and notify the project owner. Engineering must not attempt to delete or "fix" the sequence rows; the gap-free numbering rule means any wrong issuance must be reversed by credit note, not erased.

Re-review cadence: this internal-only approval is valid until either (a) the project owner schedules a real-CPA review, (b) the Israeli VAT or Bookkeeping Order changes materially (e.g. a new threshold from the ITA, a new SHAAM API version, or a 2026-06-01 schedule update), or (c) the worktree commits a change that touches one of the three gates listed in Section 7. Any of those events requires a fresh review by this agent or by a real CPA before further internal testing.

Signed-off-by (advisory only, NOT a CPA opinion): Senior Israeli Accountant Reviewer Agent.

End of document.
