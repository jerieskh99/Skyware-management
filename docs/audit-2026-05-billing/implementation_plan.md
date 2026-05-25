# Implementation Plan: Billing, Receipts, Financial Documents (Israel V1)

Project: Skyware Internal Management Portal
Date: 2026-05-25
Owner: Project Manager
Status: **Internal testing approved.** Production issuance locked. Wave 0
ops + Wave 1 code authorized per `asking_an_accountant.md`.

This plan turns the six audits under `docs/audit-2026-05-billing/` into a
phased, sized implementation program. Read the per-module audits first:

- `israel_compliance_audit.md` (authoritative compliance research, cited)
- `asking_an_accountant.md` (**internal-testing-only** approval; production
  stays locked behind a three-gate lock model. Engineering reads this for
  the work queue.)
- `billing_audit.md`
- `receipts_tax_documents_audit.md`
- `financial_documents_audit.md`
- `database_schema_audit.md`
- `ux_product_audit.md`

The plan keeps the MVP skeleton. Improvements harden, redesign, and extend
the three modules into production-ready workflows for Israel first, with a
country-toggle architecture in place for future countries.

---

## 1. Country posture

Israel is the only active country in V1.

- All compliance rules implemented inline reference Israeli law and Tax
  Authority circulars cited in `israel_compliance_audit.md`.
- A `CountryCode` enum is added (`IL`, plus `_OTHER` placeholder). The
  `CompanySettings.country` field becomes this enum.
- A `lib/compliance/country.ts` module exposes a small interface
  `getCountryProfile(code)` returning: default VAT basis points,
  receipt language defaults, allocation-number requirement function,
  numbering rules (annual reset yes/no), retention years.
- Only an `IL` profile is implemented. `_OTHER` throws "country not yet
  supported." This prevents accidental cross-country use without crashing
  the app.
- A small Country badge appears in the admin header and on Company
  Settings.

---

## 2. Authoritative facts driving the plan (from `israel_compliance_audit.md`)

These are cited research findings, not interpretations:

- **VAT rate (2026)**: 18 percent.
- **Allocation number thresholds**: NIS 10,000 (**pre-VAT**) from
  2026-01-01; NIS 5,000 (pre-VAT) from 2026-06-01 per VAT Implementation
  Order 01/2025. Applies to **`tax_invoice` and `tax_invoice_receipt`
  document types only** (not generic receipts or proformas). The check
  must compare `amountBeforeVat` (not `totalAmount`) against the
  threshold. Accountant agent flagged this in `asking_an_accountant.md`
  as a correction to the earlier draft wording.
- **SHAAM allocation API**: OAuth2 user-restricted, JSON, sandbox at
  `https://ita-api.taxes.gov.il/shaam/tsandbox/MultiApprovals/v2`,
  production at the analogous path. Auth expires every 3 months and
  must be renewed.
- **Document deletion is illegal**: only credit notes correct a
  finalized tax invoice. The system must block deletion at the DB
  and route layer, not just at the UI.
- **PCN874 reporting** threshold drops to NIS 500K turnover from 2026.
  Build the data model PCN874-ready now; the filer can come later.
- **Retention**: archive originals for the period specified by the
  Bookkeeping Order. The audit calls out items the accountant must
  confirm (PDF/A vs any non-mutable PDF, archive-abroad conditions).

Items the audit could not confirm (flagged "unverified, needs accountant
review") include: annual reset vs continuous numbering, exact stand-alone
receipt field list, Eilat zone services scope, credit-note time limit,
cash-basis vs accrual choice, debit-note workflow, equipment-vs-services
line VAT, archive-abroad conditions, exact PDF format rule.

The accountant gate (Section 12) consolidates these into one checklist.

---

## 3. What exists now (one-page summary)

### 3.1 Billing module (`/billing`, `lib/billing/`)
- API surface is uniform and audit-clean. 11 routes covering payments,
  monthly items, hourly banks + usages, one-time charges.
- Aging buckets (Phase 2 §4.3), hourly-bank burn-rate (Phase 2 §4.4),
  saved views (Phase 2 §4.2), skeleton loaders, toast surface all live.
- Bug list (from `billing_audit.md`): `Payment.linkedReceiptId` never
  written; no VAT split fields on Payment; no overdue sweeper;
  `getAgingBuckets` does not group by currency; status transitions not
  enforced at PATCH; English-hardcoded chips and `en-GB` date helpers
  remain.

### 3.2 Receipts and tax documents (`/receipts`, `lib/receipts/`)
- Schema and domain layer are solid. Phase 3 §5.4 shipped invariants,
  finalize, cancel, credit-note, and an allocation skeleton.
- Only 4 mutation endpoints exist. Create, list, get, PDF, from-payment
  endpoints are missing.
- `/receipts` page is a compliance-hold placeholder.
- `CompanySettingsForm` exists but is orphaned (zero callers).
- Bugs (`receipts_tax_documents_audit.md`): `issueCreditNote` does not
  copy `exchangeRate` for non-ILS source; no guard against double credit
  notes; `reserveNumber` uses local TZ year; VAT rate consistency not
  validated; no PDF render pipeline at all.

### 3.3 Financial documents (`/financial-documents`)
- 449-line decorative placeholder page. No data model, no API, no lib,
  no tests beyond a permission unit assertion.
- Critical cross-finding (`financial_documents_audit.md`):
  `attachments_enabled` feature flag is referenced by every attachment
  API route but is NOT present in `prisma/fixtures/feature-flags.json`.
  Blocks any future Financial Documents V1 build.

### 3.4 Database schema (`database_schema_audit.md`)
- `receipt_documents.payment_id` has no FK constraint (orphan risk).
- `Payment` polymorphism lacks a check constraint.
- No `FinancialDocument` model.
- `CompanySettings` row never seeded; fresh DB renders empty receipts.
- `finalize.ts` `new Date().getFullYear()` is timezone-dependent.
- `Payment` lacks `exchangeRate` (asymmetric with `ReceiptDocument`).

### 3.5 UX (`ux_product_audit.md`)
- Only `/billing` is functional. `/receipts` and `/financial-documents`
  are placeholders.
- Hebrew users see English status chips and raw enums, ISO codes instead
  of `₪`, and `en-GB` formatted dates.
- `ClientBillingTab.tsx` is 936 lines and overloaded.
- Cross-module dead-ends: no link from Payment row to Receipt, no link
  from one-time charge to its Job, no deep-link to a specific bank.
- Country toggle absent from the visible UI.

---

## 4. What stays (MVP skeleton preserved)

Per the user's preservation rule. Nothing here changes shape; pieces only
get harder, faster, or polished:

- Three billing categories: Monthly, Hourly Bank, One-Time Job.
- Payment workflow with seven statuses.
- Mark-paid handoff with create-receipt step (currently inert; we wire it).
- Six receipt document types and three statuses.
- Allocation status enum.
- Sequential numbering via `ReceiptDocumentSequence`.
- Per-document `currency` and `exchangeRate` for non-ILS.
- Feature flag pattern (admin enables per ring) and the existing
  `receipt_finalize_enabled` default-off posture.
- `/financial-documents` page concept and its 7 categories.
- The audit log on every mutation.

---

## 5. What gets redesigned, extended, or added (V1 scope)

### 5.1 Billing module
- Add VAT split fields to `Payment` (`amount_before_vat`,
  `vat_amount`, `total_amount`, `vat_rate_basis_points`,
  `currency_exchange_rate`). Derive defaults from `CompanySettings`.
- Wire `Payment.linkedReceiptId` writes from the receipts module.
- Enforce status transition matrix at PATCH (server-side) and surface
  legal next states via API.
- Add an overdue sweeper cron job (`/api/cron/overdue-payments`)
  reusing the cron infra from Phase 3. Flag-gated.
- Make `getAgingBuckets` currency-aware (segregate ILS vs other).
- Wire i18n on every visible string (status chip, source-type label,
  date helper). Replace `en-GB` with `Asia/Jerusalem`-aware Hebrew/English
  formatting helpers.
- Add edit dialogs for monthly items, hourly banks, one-time charges
  (PATCH routes already exist; UI is missing).
- One-time charge auto-links its created payment.
- Split `ClientBillingTab.tsx` into four files per existing project
  pattern (`MonthlySection`, `HourlyBanksSection`, `OneTimeSection`,
  `PaymentsSection`).

### 5.2 Receipts module - V1 (flag stays off until accountant)
- Endpoints to ship:
  - `POST /api/receipts` (admin create draft).
  - `GET /api/receipts?status&type&year&clientId&page` (admin list).
  - `GET /api/receipts/[id]` (admin get).
  - `PATCH /api/receipts/[id]` (admin edit draft fields).
  - `GET /api/receipts/[id]/pdf` (signed-link, rendered on demand).
  - `POST /api/payments/[id]/issue-receipt` (creates a draft from a
    paid Payment with all fields pre-filled).
- UI to ship:
  - `/receipts` list page with status / type / year / client filters.
  - `/receipts/[id]` detail page: PDF preview, editable draft form,
    finalize button (admin confirm + Hebrew accountant warning), credit
    note button on finalized rows, allocation-number status pill.
  - Replace the inert "Create receipt" UI in `MarkPaidSheet` with a
    real routing to `/receipts/[id]` after creating the draft.
- Bug fixes:
  - `issueCreditNote` copies `exchangeRate` and `currency` from source.
  - DB-level guard against double credit-noting per source row (partial
    unique index `creditedReceiptId WHERE type = 'credit_note'`).
  - `reserveNumber` reads the year in Asia/Jerusalem.
  - On finalize, validate `totalAmount = amountBeforeVat + vatAmount`
    AND `vatAmount = round(amountBeforeVat * vatRateBasisPoints / 10000)`
    within +/- one minor unit.
  - Add `receipt.finalized -> cancelled` block via a DB trigger
    (currently route-only).
- PDF pipeline:
  - Server-side renderer (Puppeteer or React-to-PDF; see Section 8).
  - Hebrew RTL template using a freely-licensed Hebrew font embedded.
  - Header pulled from `CompanySettings` (snapshot at finalize: store
    a JSON snapshot column so future CompanySettings edits do not
    rewrite history).
  - Footer pulled from `CompanySettings.receiptFooterHe`.
  - Page numbering, document number, allocation number when present,
    QR or barcode reserved for a later phase.
  - **Watermark**: bilingual "DRAFT - NOT FOR PRODUCTION / טיוטה - לא
    להפקה" stamped on every page until the three-gate lock model
    passes. This is the visible internal-testing safety belt.
- Allocation integration: ship the inert skeleton with the real
  threshold values from research (NIS 10K from 2026-01-01, NIS 5K from
  2026-06-01), plus a `lib/receipts/allocation/ita-client.ts` adapter
  interface. The real SHAAM call is documented but not wired in V1.
  Accountant must enroll the company in the Tax Authority portal
  before enabling.
- Re-link `CompanySettingsForm` into the admin tab (it is currently
  orphaned).
- Seed the singleton `CompanySettings` row with placeholders so a
  fresh DB renders receipts without admin pre-setup.

### 5.3 Financial Documents module - V1
- Add `attachments_enabled` to `prisma/fixtures/feature-flags.json`
  (the missing flag that blocks any uploads today).
- Add `financial_documents_module` to default-false and reuse it.
- Schema: new `FinancialDocument` model (`database_schema_audit.md`
  §9 proposal) plus a `FinancialDocumentAttachment` join.
- API:
  - `POST /api/financial-documents` (admin create row + presign
    upload via S3).
  - `GET /api/financial-documents?kind&clientId&from&to&page` admin
    list with filters.
  - `GET /api/financial-documents/[id]` admin detail.
  - `PATCH /api/financial-documents/[id]` mark reviewed, edit
    metadata, set `linkedPaymentId`.
  - `DELETE /api/financial-documents/[id]` (admin, audited; remove S3
    object too).
- UI:
  - Working upload widget reusing `AttachmentUploader` (which gains a
    `parentKind='financial_document'` mode).
  - List with filter chips, kind icon, vendor, date, total, status.
  - Detail drawer: PDF preview pane (using existing presigned GETs),
    metadata form, link to client + payment + receipt, "reviewed"
    toggle that writes an audit row.
- Input-VAT capture (Israeli מע"מ תשומות): fields are present on the
  model; export is deferred.
- Defer to V1.5: email ingestion, OCR, LLM auto-classify, heuristic
  linker.

### 5.4 Country toggle architecture
- `prisma/schema.prisma`: `CountryCode` enum (`IL`, `_OTHER`).
- `CompanySettings.country` becomes the enum (was free-form String).
- `lib/compliance/country.ts` exports `getCountryProfile(code)` and a
  TypeScript interface so future countries are forced to implement the
  full contract.
- Receipts module reads VAT default and document-type list through the
  country profile.
- Financial Documents reads retention defaults through the country
  profile.
- Admin header shows a small "Israel" badge.

### 5.5 Cross-module additions
- Country chip badge in the admin header.
- Deep links: every payment row -> its receipt; every one-time charge
  -> its job; dashboard banks-low -> a specific bank via fragment
  anchor; receipts list -> source payment.
- Hebrew/English number and currency formatters in `lib/format.ts`
  using `Intl.NumberFormat('he-IL', { style: 'currency', currency:
  'ILS' })` etc. Replace the `en-GB` shortcut everywhere.

---

## 6. What is explicitly NOT in V1

- Form 6111, 856, 855 generation (data model PCN874-ready; filer
  deferred).
- Real SHAAM allocation API integration (skeleton + clear hook; real
  call after accountant enrolls the company).
- OCR or LLM auto-classification of financial documents.
- Multi-country live profiles other than Israel.
- Bank statement import / reconciliation engines.
- Customer-facing receipt portal.
- Subscription billing engine (this stays manual monthly retainers).
- Stripe or other PSP integration.

---

## 6.5 Three-gate lock model (required by `asking_an_accountant.md`)

Production issuance is locked behind **three** independent gates. Any one
gate failing keeps the system in internal-testing mode and keeps the
"DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה" watermark on every PDF.

1. **Feature flag `receipt_finalize_enabled`** - default `false`.
   Already exists. Stays default false until accountant + project owner
   sign-off.
2. **Env var `ALLOW_PRODUCTION_ISSUANCE`** - new. Default unset. Wraps:
   - Any call to the real SHAAM allocation API production endpoint.
   - Any path that would issue a finalized document to a real customer.
   - Any code path that removes the watermark.
3. **Feature flag `pdf_watermark_disabled`** - new. Default `false`.
   Explicitly controls watermark removal. Even when off, the watermark
   stays on unless ALL three gates pass.

The clean-PDF render path is gated by:
`receipt_finalize_enabled === true && process.env.ALLOW_PRODUCTION_ISSUANCE === 'true' && pdf_watermark_disabled === true`.

Any single false keeps the watermark on. Engineering wires this check
inside `lib/pdf/render.ts`.

The watermark text is bilingual: English "DRAFT - NOT FOR PRODUCTION"
plus Hebrew "טיוטה - לא להפקה" stacked on every page.

## 7. Compliance gates (must be enforced before flipping flags on)

Direct from `israel_compliance_audit.md` Section M plus the bug list.

1. Israeli accountant has signed off on document templates, numbering
   policy, allocation thresholds, retention plan, language posture.
2. Company is enrolled in the Israeli Tax Authority allocation portal.
3. SHAAM API credentials are loaded into env (sandbox first, then prod).
4. The 3-month auth-renewal job is on the calendar.
5. `CompanySettings` has real values (legal name, VAT number, address,
   default VAT, default currency, footer text in Hebrew and English).
6. PDF template has been visually reviewed by the accountant against a
   sample tax invoice and a sample credit note.
7. Cancellation is blocked at the DB layer (trigger or check).
8. Numbering is restartable per year only if the accountant confirms
   annual reset is acceptable for the chosen books regime; otherwise
   continuous numbering is set.
9. Retention period is set on `CompanySettings.retentionYears` (the
   country profile default for Israel) and a retention sweeper is
   scheduled (deferred to V1.5 if needed).
10. `receipt_finalize_enabled` is flipped to true by the admin only
    after items 1-9 are checked.
11. `ALLOW_PRODUCTION_ISSUANCE` env var is set on the production host
    only after items 1-10 are checked.
12. `pdf_watermark_disabled` flag is flipped only after a real CPA has
    visually approved a clean (non-watermarked) render in the staging
    environment.

---

## 8. Tech-stack additions

| Need | Choice | Rationale |
|---|---|---|
| PDF render | **Puppeteer (headless Chromium)** | Renders complex HTML/CSS, supports Hebrew RTL out of the box, ubiquitous. Tradeoff: bundle size + cold start. Run as a per-request server function or in a dedicated worker. |
| Hebrew font | **Heebo** (Open Font License) | Free, embedded in the template; covers all Hebrew + Latin glyphs. |
| Currency formatting | `Intl.NumberFormat` (built-in) | No new dep. |
| Date formatting | `date-fns-tz` (already in deps) | No new dep. |
| File storage | S3-compatible (already shipped) | Reused by Financial Documents. |
| SHAAM client | Plain `fetch` + JSON | OAuth2 user-restricted; no new SDK needed. |
| No new dep | `pdf-lib` for post-processing if signature stamps appear later. |

Decision: use Puppeteer in V1. If cold-start cost is unacceptable in
production, swap to a static renderer (React-PDF) in a follow-up PR.
The renderer is behind a small `lib/pdf/render.ts` seam so the swap is
internal.

---

## 9. Phased plan

### Wave 0 - Compliance gate prep (2 days)
- Hand the printed `israel_compliance_audit.md` + the receipt template
  mock to the accountant.
- Receive sign-off on items 1-9 above.
- Confirm SHAAM portal enrollment timeline.
- This wave is operational, not code.

### Wave 1 - Foundations + critical bugs (3-5 days)
- Add missing `attachments_enabled` flag to fixtures.
- Seed `CompanySettings` with placeholder Israeli company values.
- Re-link `CompanySettingsForm` into the admin tab.
- Add `CountryCode` enum + `CompanySettings.country` migration.
- Add `lib/compliance/country.ts` with the Israel profile.
- Add `lib/format.ts` (currency + date Israel-aware formatters).
- Apply i18n + format fixes across Billing surface (status chips,
  source-type labels, date display, currency symbol).
- Fix `reserveNumber` Asia/Jerusalem.
- Fix `issueCreditNote` to copy `exchangeRate` + `currency`.
- Add partial unique index for "one credit note per source".
- Add receipt VAT rate consistency check at finalize.
- Add DB trigger blocking **both UPDATE (status change) and DELETE** on
  any `receipt_documents` row where `status = 'finalized'`. Defense in
  depth beyond the route layer. Required by `asking_an_accountant.md`.
- Add Payment FK + polymorphism check constraint per
  `database_schema_audit.md` recommendations.
- Add Payment VAT split fields migration.
- Enforce Payment status transition at PATCH.
- Add `pdf_watermark_disabled` feature flag default `false`.
- Add `ALLOW_PRODUCTION_ISSUANCE` to `.env.example` documented as
  default-unset, production-only.
- Replace `lib/receipts/allocation.ts` placeholder threshold (25,000
  ILS minor units) with `getAllocationThreshold(date, type)` reading
  from the IL country profile. Returns the 2026-01-01 (NIS 10,000
  pre-VAT) and 2026-06-01 (NIS 5,000 pre-VAT) schedule and restricts
  applicability to `tax_invoice` and `tax_invoice_receipt` only.

### Wave 2 - Receipts V1 (5-7 days)
- Build the missing CRUD endpoints for `/api/receipts`.
- Build `POST /api/payments/[id]/issue-receipt` and wire
  `MarkPaidSheet`.
- Build `/receipts` list page (filters, pagination).
- Build `/receipts/[id]` detail page (preview, edit draft, finalize,
  credit-note, allocation).
- Build the PDF render pipeline (Puppeteer + Heebo + template + header
  snapshot on finalize).
- Wire allocation threshold lookup through the country profile.
- Tests: unit (VAT math, threshold logic, snapshot composer); contract
  (every new endpoint); e2e smoke (draft -> finalize -> PDF -> credit
  note with the flag temporarily on in a test fixture).

### Wave 3 - Financial Documents V1 (3-5 days)
- Schema: `FinancialDocument` + join.
- Endpoints (`POST` with presign, `GET` list, `GET` detail, `PATCH`,
  `DELETE`).
- `AttachmentUploader` gets a `parentKind='financial_document'` mode.
- `/financial-documents` page: real upload + list + filter + detail
  drawer + reviewed toggle + link picker.
- Audit log on every mutation.
- Tests: unit (validator + linker stubs), contract (each endpoint),
  e2e smoke (upload -> review -> link to payment).

### Wave 4 - Country toggle UI + polish (1-2 days)
- Country chip in admin header.
- Country profile read on every receipt and financial-document write.
- Hebrew RTL pass over the new pages.
- Cross-module deep links.
- Cleanup: split `ClientBillingTab.tsx` into four files.
- Documentation update under `docs/`.

### Wave 5 - Accountant flip + smoke (operational)
- Accountant verifies live render of a draft, a finalized invoice, a
  credit note, an allocation request flow (sandbox).
- Admin flips `receipt_finalize_enabled` to true in production.
- Pilot a single low-value real invoice end-to-end.
- Document the rollback (set flag false).

Total nominal duration: **2-3 calendar weeks** for one engineer
full-time, or **1.5 weeks** with two engineers in parallel after Wave 1.

---

## 10. Tests and QA gates

Per wave a "ship gate" is satisfied when:

- `pnpm typecheck && pnpm lint && pnpm test` all green.
- New routes have a contract test (happy path + one permission denial).
- New tables have at least one schema migration test (apply on a fresh
  DB and seed runs clean).
- New UI strings appear in both `en.json` and `he.json` (the existing
  key-parity test enforces).
- A reviewer has read the PR and signed off in writing.

Wave 5 ships gate is:

- Accountant has signed off on the printed PDF samples (draft, final
  tax invoice, credit note).
- A pilot real-money invoice has been issued and recorded successfully.

---

## 11. Risks and tradeoffs

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Allocation thresholds change again mid-year | High | Medium | Store thresholds in the IL country profile, not hardcoded. Adjust when a new Tax Authority notice lands. |
| R2 | PDF rendering with Puppeteer is slow on cold starts | Medium | Medium | Cache last render per finalized row; render once and store the PDF as an Attachment. Reuse on download. |
| R3 | Hebrew font missing glyphs | Low | Medium | Embed Heebo; fallback to `system-ui` Hebrew. Test with rare characters. |
| R4 | SHAAM 3-month auth lapses unnoticed | Medium | High | Reuse cron infra: nightly check returns "auth expired" alert via notifications. |
| R5 | Accountant takes longer than 2 days to sign off | High | Low | Wave 5 is operational, blocks pilot only. Code waves do not block. |
| R6 | DB trigger differences between dev and prod Postgres | Low | Medium | Add trigger via raw-SQL migration; test on the test Postgres in CI (Phase 1 CI already runs Postgres 16). |
| R7 | `linkedReceiptId` retrofitting old payments | Low | Low | New writes only; no historical backfill. Phase 2 ran on placeholder data anyway. |
| R8 | Credit note duplicate guard misfires on legitimate re-issue | Low | Medium | The DB constraint is "one credit note per source where type=credit_note". A second credit note requires a code-level override path or a new schema decision. Document. |
| R9 | Country toggle adds friction for future internal-only IL changes | Low | Low | The IL profile is a TS module; updates land in that single file. |
| R10 | Puppeteer breaks Vercel-style serverless | Medium | Medium | Run PDF render in a small worker (Node server) if the host does not allow heavy headless chromium. |

---

## 12. Assumptions

- The user is Skyware IT LTD; the legal entity, VAT number, and tax
  registration details belong on `CompanySettings` and an Israeli
  accountant will provide them.
- The user accepts that `receipt_finalize_enabled` stays default false
  in production until accountant sign-off.
- The team has access to the Tax Authority portal to enroll for
  allocation numbers (this is administrative, not engineering).
- S3-compatible storage is provisioned (Cloudflare R2, MinIO, or AWS
  S3) and the env vars from Phase 3 §5.3 are set.
- A Hebrew-speaking reviewer is available for the receipt template
  copy-pass.

---

## 13. Approval checkpoint

This plan changes no code. Approval unlocks Wave 0 (operational) and
Wave 1 (foundations + bug fixes). Subsequent waves are re-decided at
each wave's exit gate.

Approver: Jeries Khoury
Approval options:
- **approve** -> start Wave 0 ops + Wave 1 code.
- **approve with changes** -> list items to add, cut, or re-phase.
- **hold** -> ask questions in chat first.

**Implementation has not started. Awaiting approval.**
