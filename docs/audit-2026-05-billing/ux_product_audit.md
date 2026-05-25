# UX and Product Audit: Billing, Receipts, Financial Documents

Date: 2026-05-25
Auditor: UX and Product Auditor (billing/financial track)
Scope: `/billing`, `/receipts`, `/financial-documents`, `/clients/[id]` billing and receipts tabs,
admin dashboard billing strips. Read-only. No code changed.
Reference and non-duplicated: `docs/audit-2026-05/frontend_ux_audit.md`,
`docs/audit-2026-05/unfinished_tasks_audit.md`,
`docs/internal-management-portal-final-plan/06-ux-flow-spec.md`,
`docs/internal-management-portal-enhancement/05-ux-ui-review.md`.
Israeli legal/tax rules: not owned here; see Israel-compliance audit.
Schema: not owned here; see DB-schema audit.

---

## 1. Executive summary

The three money surfaces split unevenly:

- `/billing` is the most complete page in the portal. KPI strip, aging strip,
  needs-attention list, full payments table, status filter chips, saved-view
  bar, MarkPaid drawer, status chip - all wired
  (`app/(portal)/billing/page.tsx`, `components/billing/*`,
  `lib/billing/queries.ts`).
- `/receipts` is a placeholder with a compliance-hold banner. Backend
  invariants for finalize, credit-note, allocation, cancel exist
  (`lib/receipts/*`, `app/api/receipts/[id]/*`) but zero UI consumes them.
- `/financial-documents` is a 449-line decorative placeholder. No DB-backed
  list, no upload widget, no detail view.

`components/billing/ClientBillingTab.tsx` (936 lines) is overloaded with four
sections (Monthly + Hourly + OTC + Payments), four Add dialogs, and three
ConfirmDialogs. It doubles as the only payment-create surface.

From any Payment row there is no link to a Receipt (no UI exists) and no link
to the source Job for OTC. The "Create receipt" CTA in MarkPaidSheet
(line 171-177) is copy only.

Five biggest UX risks for the billing track:

1. Receipts UI missing. Backend partially ready; no admin can draft, view, or
   finalize a receipt.
2. Financial Documents has no functional surface, despite Phase 3 5.3 shipping
   S3 attachment primitives.
3. Hebrew users see English currency codes ("ILS"), `en-GB` dates, and English
   `sourceType` enum strings (`hourly bank`, `one time`).
4. Payment row gives no one-glance link to job, bank, OTC, or receipt - just a
   stringified `sourceType`.
5. Client detail Receipts tab is a stub
   (`app/(portal)/clients/[id]/page.tsx:321-333`).

Shared primitives are in good shape (`PageHeader`, `KpiCard`, `SectionCard`,
`EmptyState`, `ConfirmDialog`, `Toaster`, Radix Dialog, `PaymentStatusChip`,
`AgingStrip`, `BurnRateBar`) plus a working i18n loader. Cost to finish the
remaining surfaces is module-specific UI, not platform work.

---

## 2. Page-by-page inventory

Status legend: Working = real data, full flow. Partial = real data but missing
key pieces. Placeholder = renders but no functional UI.

| Route or surface | File | Status | % complete | Key UX gaps |
|---|---|---|---|---|
| `/billing` (list) | `app/(portal)/billing/page.tsx` | Working | 80 | No create-payment on this page. `sourceType` rendered as raw enum text on rows without `sourceMonthly` (line 219). No client filter UI (only via URL `clientId` query). No date-range filter. No CSV export. |
| `/billing` loading skeleton | `app/(portal)/billing/loading.tsx` | Working | 100 | Skeleton matches layout. |
| `/receipts` | `app/(portal)/receipts/page.tsx` | Placeholder | 0 | Compliance-hold banner only. No list, no filter, no draft form, no detail, no finalize button. |
| `/financial-documents` | `app/(portal)/financial-documents/page.tsx` | Placeholder | 5 | Decorative-only. Disabled filter preview, ingestion tiles, "Not connected" badges. No upload widget reusing `AttachmentUploader` (Phase 3 5.3). |
| `/clients/[id]?tab=billing` | `components/billing/ClientBillingTab.tsx` | Working | 75 | Single tab carries four distinct sections. No edit dialogs (Add + Delete only). Raw Job UUID inputs in hourly-usage and OTC dialogs (lines 499, 658). Create Payment dialog has `one_time` source but no picker for which OTC (line 805). |
| `/clients/[id]?tab=receipts` | `app/(portal)/clients/[id]/page.tsx:321-333` | Placeholder | 0 | Stub `ReceiptsPlaceholder` with copy "Phase 7." No list of past receipts even though they could be pulled from `ReceiptDocument` rows on the client. |
| Admin dashboard - aging strip | `app/(portal)/dashboard/page.tsx:171-189` | Working | 100 | Feature-flagged (`aging_buckets_enabled`). |
| Admin dashboard - banks-low strip | `app/(portal)/dashboard/page.tsx:192-194, 434-476` | Working | 100 | Feature-flagged (`hourly_burn_enabled`). Links to `/clients/[id]?tab=billing`. |
| Mark-paid drawer | `components/billing/MarkPaidSheet.tsx` | Partial | 70 | Modal (Radix Dialog), spec asked for side sheet. "Create receipt" copy is inert (lines 171-177). |
| Saved view bar on `/billing` | feature-flagged | Working | 100 | Wired via Phase 2 4.2 and Phase 3 5.8 (team-shared). |

References for spec items: aging buckets (`05-ux-ui-review.md` §10.1), tabs
(§10.2), mark-paid drawer (§10.4), receipts (§11), financial-docs (in the
enhancement plan as recommended new module §06).

---

## 3. Information architecture and naming

### 3.1 Sidebar grouping (today)

`components/layout/Sidebar.tsx:62-70` puts Clients + Billing + Receipts +
Financial Docs in one "Clients & Billing" group. Three issues:

1. **Billing vs Receipts is ambiguous.** Hebrew accountants may not parse
   "Billing" (חיוב, money we track) distinct from "Receipts" (קבלות,
   documents we issue). Same parent group, similar icons, receipts page
   currently empty - high confusion risk.
2. **"Financial Documents" label hides scope.** Sidebar shortform is "Financial
   Docs" but the placeholder lists seven categories (payment confirmations,
   supplier invoices, supplier receipts, expenses, subscriptions, tax docs,
   bank transfers). A clearer label: "Inbox" or "Bookkeeping Inbox".
3. **No top-level "Money" parent.** Recommend a "Finance" group containing
   Billing, Receipts, Inbox. Clients stays operational.

### 3.2 Client billing tab is overloaded

`ClientBillingTab.tsx` carries four sections in one scroll: Monthly (116-276),
Hourly banks (278-553), OTC (555-689), Payments (691-890), plus a top banner.
For a client with multiple of each, the page is unscannable. Spec §9.1 lists
Payments as its own tab. Recommend splitting into two:
- "Plans and banks" (Monthly + Hourly + OTC).
- "Payments" (existing PaymentsSection plus a receipts subview).

### 3.3 Where receipts should live

Two missing places: top-level `/receipts` list (filter by status/year/type)
and `/clients/[id]?tab=receipts` (this client's receipts linked to source
Payment). Also: "Generate receipt" CTA on payment rows and on MarkPaidSheet
(copy exists, inert at `MarkPaidSheet.tsx:171-177`).

---

## 4. Workflow walk-throughs

Each step is one user action. Dead ends are flagged.

### 4.1 Admin creates a new payment record from a job

Today there is no "Create payment" action on the job detail page. Path:

1. Sidebar -> Clients (admin only).
2. Click the client row.
3. Click "Billing" tab.
4. Scroll past Monthly, Hourly, OTC to reach Payments section
   (`ClientBillingTab.tsx:691`).
5. Click "Create payment" (line 763).
6. Dialog opens; pick source type (monthly / hourly_bank / one_time).
7. Pick the source item from the optional dropdown (no picker for OTC).
8. Enter amount, currency, issued date, optional due date, optional notes.
9. Click "Create draft."

Eight clicks before the user reaches the form, no way to start from the Job.
The form is created as `draft`; user must reopen via Update to advance status.

**Dead-ends:**
- From `/billing` list there is no "+ New payment" button; users cannot create
  a payment from the global billing page (consistent with prior frontend
  audit's finding).
- From a Job detail page there is no link to "this job's payment"; the only
  way to wire a Job to a Payment is via a one-time-charge with its own
  payment, set on the client billing tab.

### 4.2 Admin marks payment paid, creates receipt, finalizes, downloads PDF

Steps 1-3 work; the rest do not. The receipt UI does not exist.

1. Open client billing tab or `/billing`.
2. Click "Update" on a payment row (`BillingPageActions.tsx:30-37`).
3. MarkPaidSheet opens. Set status to `paid`, fill paid date, method,
   reference, notes. Submit.
4. Receipt copy box says receipts ship in Phase 7
   (`MarkPaidSheet.tsx:171-177`) - inert.
5. No link to create or view receipts. No `/receipts` list. No finalize
   button. No PDF download.

**Spec gap:** spec calls for a real "Create receipt" checkbox that routes to
a draft on save (`06-ux-flow-spec.md` §8). Today the copy is informational.

### 4.3 Admin uploads a vendor invoice into Financial Documents

Not possible. Sidebar -> Financial Docs renders decorative content; the
"Manual upload" tile says "Not available"
(`app/(portal)/financial-documents/page.tsx:298-303`). The Phase 3 5.3
`AttachmentUploader` primitive exists but the page does not import it.

### 4.4 Admin lists aging buckets and drills into 60-90

Working. Sidebar -> Billing; click "61-90 days" cell on the aging strip; URL
becomes `/billing?aging=61-90`; table re-filters via
`listPaymentsByAgingBucket` (`lib/billing/queries.ts:234-266`); active cell
gets a ring highlight. Three clicks.

Gaps: aging strip is feature-flagged behind `aging_buckets_enabled`
(`app/(portal)/billing/page.tsx:67-76`); no "Clear aging" link near the strip
when active - user must use status chips or browser back.

### 4.5 Admin reviews hourly-bank burn rate

Working. Two surfaces: admin dashboard banks-low list
(`app/(portal)/dashboard/page.tsx:434-476`) and per-bank `BurnRateBar` inside
the client billing tab. The dashboard list links to
`/clients/{id}?tab=billing` but does not deep-link to the specific bank; with
multiple banks per client the user must scroll. A `#bank-{id}` anchor would
close this gap.

---

## 5. Form quality

### 5.1 Money inputs

All amount inputs are `<Input type="number" min="0">`
(`ClientBillingTab.tsx:236, 470, 474, 663, 843`). `MarkPaidSheet` has no
amount field. Issues:

- No locale-aware formatting (Hebrew `1,000` rejected by browser `type=number`).
- No leading-zero protection.
- No `₪` adornment next to fields; field reads "Amount (placeholder)".
- Missing `inputMode="decimal"` for cleaner mobile keypad.
- No max constraint; amounts are `Int` units (placeholder semantics) with no
  visible unit hint.

### 5.2 Date pickers

`<Input type="date">` used directly (`MarkPaidSheet.tsx:151`,
`ClientBillingTab.tsx:240, 479, 858, 862`). Native browser picker; no Hebrew
calendar option. Defaults use `new Date().toISOString().slice(0, 10)` (UTC) at
lines 123, 300, 714; users near midnight Jerusalem see wrong day. Prior
frontend audit §6.3 flagged this. No "Net 30" shortcut on Due date.

### 5.3 Currency selector

Only in Create Payment dialog (`ClientBillingTab.tsx:847-852`). Hardcoded ILS,
USD, EUR. Monthly, Hourly, OTC Add dialogs receive currency as a prop from
the parent billing account; user cannot create a USD plan on an ILS-default
account. The amount cell uses 3-letter ISO suffix only (`fmtAmount` at
`ClientBillingTab.tsx:108-111`, `app/(portal)/billing/page.tsx:44-47`).

### 5.4 VAT inclusive/exclusive toggle

Absent from billing UI. VAT only appears in `CompanySettingsForm.tsx:336-339`
as `defaultVatBasisPoints` (raw integer; `1800` = 18%). The receipts module
would carry the inclusive/exclusive toggle per spec §11.2.

### 5.5 Validation surfaces

Server is Zod-typed (`app/api/billing/payments/route.ts:31-42`). Client forms
do ad-hoc checks before fetch (`MarkPaidSheet.tsx:69-71`,
`ClientBillingTab.tsx:137, 344, 574`). Server 400s surface inline as a single
form-level message; no field-level error mapping.

---

## 6. Status communication

### 6.1 PaymentStatusChip

`components/billing/PaymentStatusChip.tsx:3-11` maps status to label + Tailwind
colors: draft (muted), sent (blue), waiting (amber), partial (orange), paid
(green), overdue (red), cancelled (muted). Color follows convention (green
good, red bad). Labels are **hardcoded English** - chip does not read
`payment.status.*` from `en.json:179-189` or `he.json:179-189`. Hebrew users
see English chip labels everywhere. Contradicts Phase 1 E1-E4 i18n wire-up.

### 6.2 Receipt status chips

Not built. `ReceiptDocumentStatus` enum: `draft`, `finalized`, `cancelled`
(`prisma/schema.prisma:96-100`). `AllocationStatus` enum: `not_required`,
`pending`, `issued`, `failed` (`:102-107`). When receipts ship, need
`ReceiptStatusChip` and `AllocationStatusChip` (for Tax Authority allocation
number flow above 25k ILS, per `lib/receipts/allocation.ts:21`).

### 6.3 Aging-bucket colors and accessibility

`AgingStrip.tsx:22-27`: 0-30 neutral, 31-60 warn-soft amber, 61-90 warn-soft
amber (stronger), 91+ danger-soft red. The two amber tones are visually close;
color-blind viewers may collapse them. Numeric label carries meaning so it's
not color-only. Sr-only text used for amounts (`AgingStrip.tsx:75`).

---

## 7. i18n and RTL

### 7.1 Billing strings

`lib/i18n/{en,he}.json:255-319` cover billing well: title, KPIs, columns,
filters, mark-paid, methods, aging, burn. `BillingPage` reads them via
`getT()` (`app/(portal)/billing/page.tsx:78`, `:251` for filter chips).

Two i18n gaps remain:

- **PaymentStatusChip is hardcoded English** (§6.1).
- **`sourceType.replace(/_/g, " ")` hack** at
  `app/(portal)/billing/page.tsx:167, 219`, `MarkPaidSheet.tsx:115`,
  `ClientBillingTab.tsx:776`. When `sourceMonthly` is null, user sees the raw
  enum (`"hourly bank"`, `"one time"`) in any language.

`ClientBillingTab.tsx` and `BillingPageActions.tsx` are mostly hardcoded
English: "Update" (line 36), "Monthly billing" (185), "Hourly banks" (385),
"One-time charges" (612), "Payments" (761), "Add bank", "Log usage", "Create
payment draft", etc. Only the burn-projection labels passed to `BurnRateBar`
route through `useT()` (lines 438-441).

### 7.2 Hebrew RTL rendering

Logical Tailwind utilities (`me-`, `ms-`, `start-`, `end-`) used throughout
billing (`BillingPageActions.tsx:35`, `AgingStrip.tsx:81`,
`ClientBillingTab.tsx:188-189, 415-416`); zero `mr-`/`ml-`/`text-left` in
billing components (grep verified).

Aging strip uses `grid-cols-4` (direction-agnostic). `BurnRateBar` uses flex
`justify-between` with `style={{ width: ... }}` on the inner bar; the parent
controls direction so RTL fills from the start edge correctly.

### 7.3 Currency symbol placement

The `₪` symbol appears **zero times in the codebase** (grep verified).
Amounts render as `"1,000 ILS"` (number then 3-letter code). Hebrew
convention is `"₪1,000"` or `"1,000 ש"ח"`. Decision needed: pick one
convention and apply uniformly.

### 7.4 Hebrew date format

`fmtDate` uses `en-GB` everywhere (`app/(portal)/billing/page.tsx:39-42`,
`ClientBillingTab.tsx:103-106`). Format example: `"25 May 2026"`. Hebrew
accounting expects `"25/05/2026"`. Should use `formatTz` from `lib/time.ts`
keyed to current locale.

---

## 8. Accessibility quick-check

### 8.1 ConfirmDialog usage on destructive actions

Phase 1 5.4 `ConfirmDialog` is used at `ClientBillingTab.tsx:260, 537, 673`
(monthly, bank, OTC deletes). All three pass `description`, `pending`,
`errorMessage`, `onConfirm`. Good.

Payments have no delete UI (correct; they should be cancelled via status
flow). MarkPaidSheet has no confirm when moving to `cancelled` from a
non-draft state - one extra safety step worth adding (line 45-51 allowed
transitions).

### 8.2 Aria-labels on icon-only buttons

- `ClientBillingTab.tsx:213` delete monthly: `aria-label="Delete {name}"` good.
- `ClientBillingTab.tsx:421` delete bank: `aria-label="Delete hourly bank"` -
  generic, no identifying date.
- `ClientBillingTab.tsx:639` delete OTC: `aria-label="Delete charge for {name}"` good.
- `BillingPageActions.tsx:35` Update button has icon + text. OK.
- Radix Dialog close X: `aria-label="Close"` (`components/ui/dialog.tsx:42`).

### 8.3 Table keyboard navigation

`app/(portal)/billing/page.tsx:197-241` uses a `<table>`. Client name is a
`<Link>`, Update is a `<button>`. Tab order is cell-by-cell (granular). No
`:focus-within` on `<tr>`; keyboard users get no row-level context.

### 8.4 Color contrast for status chips

`PaymentStatusChip.tsx:6-10` uses `bg-{color}-50 text-{color}-700` (Tailwind);
WCAG AA on white. Dark mode unreachable today (`next-themes` not wired).

---

## 9. Visual hierarchy

### 9.1 `/billing` lead

The page leads with three KPI cards: Unpaid, Overdue, Paid this month
(`app/(portal)/billing/page.tsx:104-126`). Unpaid count is shown without a
$/₪ amount; Overdue same. The most actionable summary - "amount overdue" - is
not surfaced as a KPI. The aging strip below shows amounts per bucket
(`AgingStrip.tsx:73-77`), so total overdue is computable but not summarised.

The order is reasonable: KPI strip -> saved view bar -> KPI strip (count) ->
aging buckets -> needs-attention -> filter chips -> full table. A new admin
opens the page and sees "9 unpaid, 2 overdue, 14 paid this month" before
any actionable list, which is fine. Better: lead the aging strip if there are
any past-due rows; it is more decision-driving than the KPI counts.

### 9.2 Payment row at-a-glance

In the full table (lines 197-241), the row shows:

- Client (link)
- Source (`serviceName` or stringified enum)
- Amount + currency code (mono font, xs)
- Issued date (xs muted, hidden < sm breakpoint)
- Due date (xs muted, red+bold if overdue)
- Status chip
- Update button

What is **not** visible:

- Linked job (when source is OTC).
- Linked monthly item label (when present, this *is* shown via
  `sourceMonthly?.serviceName`).
- Linked bank label (when source is hourly_bank, the bank is identified only
  by "hourly bank" - the linked bank's purchase date or name is not shown).
- Reference/asmachta after marking paid.
- Receipt (when the receipts module ships).
- Created-by user (in the data, not in the UI).

The needs-attention section (lines 148-180) shows fewer columns - one
combined "client + source + amount + due" stack per row. That is fine for
brevity but inconsistent with the full table layout.

---

## 10. Receipts page V1 UX checklist

Reading the placeholder (`app/(portal)/receipts/page.tsx:36-44`):

- Six document types: invoice, receipt, tax invoice, tax invoice + receipt
  (חשבונית מס קבלה), credit note, proforma invoice.
- All with Hebrew and bilingual support.
- Finalize is feature-flagged off until accountant signs off.

Reading the spec (`05-ux-ui-review.md` §11):

- Tabs by type.
- Filters: client, date, status.
- Verification banner.
- Draft view: editable line items, live total with VAT, Finalize behind a
  confirm.
- Finalized view: read-only, document number, Download HTML until PDF, Issue
  credit note link.

Reading the data model: `ReceiptDocument` has document number reservation,
allocation number flow (above 25k ILS), credit-note relation, finalize
invariants enforced via DB check constraints (`prisma/schema.prisma:622-668`,
`lib/receipts/finalize.ts`, `lib/receipts/allocation.ts`).

### V1 required (must)

- [ ] List page at `/receipts` replacing the placeholder.
- [ ] Filter strip: type, status, year, client (free-text or picker).
- [ ] Receipts table: number (with year), type, client, issue date,
      total + currency, status chip, allocation chip when applicable.
- [ ] "New receipt" button -> draft create form OR routed from a payment row.
- [ ] Draft create form: type select (six options), client picker, issue date,
      payment date (optional), description lines (add/remove rows), VAT rate
      (default from CompanySettings.defaultVatBasisPoints), amount inputs
      with live `total = before + vat` computation, currency select, language
      select (en / he / both).
- [ ] Draft detail page: header with status + allocation status, line-item
      table, totals block, action bar (Edit draft, Finalize, Cancel).
- [ ] **Finalize button with double confirmation** when
      `receipt_finalize_enabled = true`. When false, show a friendly modal
      "Finalize is locked until accountant sign-off" per spec §10 step 15.
- [ ] PDF / HTML download for finalized receipts.
- [ ] **Credit note button on a finalized row** that pre-fills a new draft
      with negated amounts and `creditedReceiptId` set.
- [ ] **Allocation chip**: not_required / pending / issued / failed - per
      `AllocationStatus` enum. Pending should show a loading or retry CTA.
- [ ] **Accountant-attestation banner** across the whole module while
      `receipt_finalize_enabled` is off.
- [ ] Client detail page receipts tab (`/clients/[id]?tab=receipts`) lists
      that client's receipts using the same row component.

### V1.5 (should)

- [ ] Saved view scope `receipts` (the `SavedViewScope` enum at
      `prisma/schema.prisma:145-152` already includes it).
- [ ] CSV export of the receipts list for the accountant.
- [ ] Detail page "linked payment" inline card.
- [ ] Bilingual HTML render preview before download.

### V2 (could)

- [ ] PDF storage and email-to-client one-click.
- [ ] Tax Authority allocation API integration (today is a stub at
      `lib/receipts/allocation.ts:36-60`).
- [ ] Receipts dashboard widget on `/dashboard` (drafts awaiting finalize).

---

## 11. Financial Documents page V1 UX checklist

Reading the placeholder (`app/(portal)/financial-documents/page.tsx`):

- Seven planned categories.
- Five-step workflow: Receive, Classify, Link, Review, Archive.
- Eight filter fields preview.
- Ingestion tiles: email (Not connected), manual upload (Not available).
- Documents table empty stub.

Reading Phase 3 5.3 (S3 attachments) and the existing `Attachment` schema,
the upload infra exists.

### V1 required (must)

- [ ] Replace the page guts with a real list + upload widget when the
      `financial_documents_module` flag is on.
- [ ] **Upload widget** reusing the Phase 3 `AttachmentUploader`. Accept PDF,
      JPG, PNG, EML. Capture: category (dropdown of 7), client (picker,
      optional), supplier name (free text, optional), document date,
      received date (default today), notes.
- [ ] List with filter by category, date range, client, review status.
- [ ] Documents table columns: name, category, supplier/client, date,
      received, review chip, action.
- [ ] Detail drawer: PDF preview embedded, metadata sidebar, link to a
      payment or receipt (relationship via existing `Payment` row to
      `Attachment`, or a new `FinancialDocument` model - schema audit owns).
- [ ] "Reviewed" toggle on the detail drawer that flips a boolean and
      records the reviewer + timestamp.
- [ ] Keep the safety banner about no real email ingestion.

### V1.5 (should)

- [ ] Bulk upload (drop multiple files at once).
- [ ] Per-supplier subview that aggregates documents from one vendor.
- [ ] Saved view scope (not in `SavedViewScope` enum today; would need a
      schema addition).
- [ ] Link a document to an existing receipt (for cross-reference).

### V2 (could)

- [ ] Auto-classify with a small ML or rules model.
- [ ] Email ingestion (IMAP / Gmail OAuth).
- [ ] Bookkeeping export (CSV per Israeli accountant format).

---

## 12. Country toggle UX placement

Today the system is implicitly Israel. Indicators today:

- Tax ID label in client form: "Tax ID (ח״פ / ע״מ)"
  (`app/(portal)/clients/[id]/page.tsx:170-176`).
- CompanySettings defaults to `Asia/Jerusalem`, currency `ILS`, country `IL`,
  VAT 18% (`components/admin/CompanySettingsForm.tsx:69-81`).
- Allocation threshold in `lib/receipts/allocation.ts:21` is hardcoded ILS.
- ChannelKey enum includes Israeli-specific helpdesk/it/rnd departments
  (`prisma/schema.prisma:138-143`).

The CompanySettings already has a `country` field; the toggle is hidden there.
For users to see "I am in Israel mode" without diving into Admin -> Company:

### Minimal placement (recommended)

A small flag/country chip in the admin header, right of the LanguageToggle,
showing the current country code: `IL`. On click, links to
`/admin?tab=company` to edit. Implementation cost: ~30 lines in
`components/layout/Header.tsx`. Read the country from CompanySettings via a
cached server function similar to `getT()`.

### Alternative (lower disruption)

Inline badge inside the CompanySettings page header showing "Israel mode" -
no header chip needed. Loses visibility for daily users.

### Reasoning

A multi-tenant or multi-country future would require this toggle to be
prominent. Even at single-tenant Israel-only, surfacing it in the header
makes the locale + country context clear for any admin opening the portal.

---

## 13. Cross-module discoverability

From a Payment row, the user can reach:

- The Client (via the client name link to `/clients/{id}?tab=billing` -
  `app/(portal)/billing/page.tsx:213-216`).
- The MarkPaidSheet (via Update button).

The user cannot reach:

- The linked Job (when source is `one_time`; the `OneTimeJobCharge.job`
  relation is shown in `ClientBillingTab.tsx:626-628` on the OTC row but **not**
  on the Payment row itself).
- The linked Receipt (no receipts UI; `Payment.linkedReceiptId` exists at
  `prisma/schema.prisma:600` but is unused in the UI).
- The linked Monthly billing item (the `sourceMonthly.serviceName` is shown as
  text on the row but is not a link).
- The linked Hourly bank (same; just shown as "hourly bank" text).

From a Job detail page, the user cannot reach:

- The Payment created from this job (when source is `one_time`). The Phase 2
  job-detail "Related" tab includes "Linked payment"
  (`lib/i18n/en.json:175` mentions `linkedPayment`) but the UI rendering needs
  verification; out of scope here, but a known gap.

From the MarkPaidSheet, the user cannot:

- Click "Create receipt" - the copy is informational only
  (`MarkPaidSheet.tsx:171-177`).

From the Client detail's Receipts tab, the user cannot:

- See any past receipt - it is a stub
  (`app/(portal)/clients/[id]/page.tsx:321-333`).

From `/financial-documents`, the user cannot:

- Click anything actionable. Every filter and table cell is disabled.

### Dead-end summary

| Surface | Expected next click | Today |
|---|---|---|
| Payment row -> Receipt | Open receipt detail | No receipt UI |
| Payment row -> Job | Open the OTC's job | Not linked from row |
| MarkPaidSheet -> Create receipt | Open draft receipt | Copy only |
| Bank-low dashboard -> specific bank | Scroll to bank | Lands on tab, no anchor |
| Client detail receipts tab | List of receipts | Stub |
| Financial docs upload | Open file picker | Disabled |
| Job detail -> Payment | Open payment | Phase 2 attempted, needs check |

---

## 14. Top UX problems (ranked)

### High

1. **Receipts UI does not exist.** `app/(portal)/receipts/page.tsx` is a
   placeholder. Backend invariants ready (`lib/receipts/finalize.ts`,
   `lib/receipts/allocation.ts`, `lib/receipts/credit-note.ts`,
   `lib/receipts/cancel.ts`, API routes at `app/api/receipts/[id]/*`). Admins
   cannot draft, finalize, view, or download any receipt.
2. **Financial Documents has no functional UI.** `app/(portal)/financial-documents/page.tsx`
   is 449 lines of decorative placeholder. Phase 3 5.3 shipped S3 attachment
   primitives that are not wired in.
3. **PaymentStatusChip is hardcoded English.** `components/billing/PaymentStatusChip.tsx:3-11`
   does not read `payment.status.*` i18n keys despite Phase 1 E1-E4 wiring.
   Hebrew users see English chip labels.
4. **`sourceType` rendered as raw enum.** `app/(portal)/billing/page.tsx:167, 219`
   and `MarkPaidSheet.tsx:115` and `ClientBillingTab.tsx:776` print
   `"hourly_bank".replace(/_/g, " ")` -> `"hourly bank"`. Hebrew users see
   English. Add i18n keys for `payment.sourceType.{monthly,hourly_bank,one_time}`.
5. **Client billing tab is overloaded.** `components/billing/ClientBillingTab.tsx`
   is 936 lines holding four sections + four create dialogs. Split into a
   sub-tabbed surface per spec §10.2.
6. **Mark-paid drawer "Create receipt" CTA is inert.** `components/billing/MarkPaidSheet.tsx:171-177`
   shows a checkbox/info box telling the user receipts will appear in Phase 7.
   Spec §10.4 calls for a real checkbox that routes to a draft.
7. **Currency convention is inconsistent.** Code `"ILS"` appears beside
   number; no `₪` symbol anywhere; Hebrew users get English ISO codes. Decide
   symbol-vs-code and apply across `fmtAmount` helpers in
   `app/(portal)/billing/page.tsx:44-47` and `ClientBillingTab.tsx:108-111`.

### Medium

8. **Date inputs use UTC default and en-GB locale.** `MarkPaidSheet.tsx:58`
   uses `new Date().toISOString().slice(0, 10)`. `fmtDate` everywhere uses
   `en-GB`. Hebrew users near midnight see wrong day; Hebrew accounting
   expects `DD/MM/YYYY`. Use `formatTz` and `Asia/Jerusalem`. Already flagged
   in `frontend_ux_audit.md` §6.3.
9. **No edit dialogs for monthly items, hourly banks, OTC.**
   `components/billing/ClientBillingTab.tsx` allows only Add + Delete; users
   must delete and recreate to change a price or service name. Phase 6 audit
   flagged this.
10. **No filter for client or date range on `/billing`.** The page reads
    `clientId` from query string but exposes no client picker. The status
    filter chips at `app/(portal)/billing/page.tsx:250-282` are useful but
    incomplete.
11. **No "Total overdue amount" KPI on `/billing`.** The three KPIs are all
    counts (`getBillingKpis` at `lib/billing/queries.ts:103-120`). The aging
    strip shows amounts; the headline should too.
12. **Mark-paid drawer is a modal, not a side sheet.** Spec §10.4 calls for
    a side sheet. Today `MarkPaidSheet.tsx:103-104` uses Radix Dialog. Minor
    if focus management is correct; the spec preference would let the user
    see the row context while filling.
13. **`MarkPaidSheet` has no amount field.** Payments cannot be partially
    paid in granular amounts; only the status chip changes to "partial". To
    record `partially_paid` properly an admin would expect to enter how much
    was received.
14. **Aging-bucket clear control is missing.** `app/(portal)/billing/page.tsx`
    re-renders with `?aging=` URL but offers no "back to all" link near the
    strip; user must use status filter chips or browser back.
15. **Banks-low dashboard list has no per-bank deep-link anchor.**
    `app/(portal)/dashboard/page.tsx:447-471` links to
    `/clients/{id}?tab=billing` but no `#bank-{id}` anchor exists in
    `ClientBillingTab.tsx`.
16. **Client detail Receipts tab is a stub.** `app/(portal)/clients/[id]/page.tsx:321-333`.
    Even an empty list view with a "no receipts yet" message would be more
    honest than the "Phase 7" copy.

### Low

17. **Aging-strip 31-60 vs 61-90 tones are close.** Two amber variants. Add
    icon delta or numeric badge contrast.
18. **`BurnRateBar` uses hardcoded English** "Used:", "remaining of", "Low
    balance" (`BurnRateBar.tsx:47, 73, 84, 91`). Only the burn-projection row
    is i18n-wired via passed labels.
19. **`BillingPageActions` "Update" button label is hardcoded English**
    (`components/billing/BillingPageActions.tsx:36`).
20. **Job UUID input fields in hourly-usage / OTC dialogs** require pasting a
    raw UUID. Replace with a job picker scoped to the current client.
    Already flagged in `frontend_ux_audit.md` §3.3.
21. **MarkPaidSheet does not show prior payment history.** When updating a
    `partially_paid` payment, the admin cannot see what was already paid; only
    the current status. The schema has `paidDate` (single) but no payment
    history sub-row, so this is also a data-model question.
22. **Receipts and Financial Docs both link to `/admin?tab=flags`** but only
    Financial Documents prints the literal flag name to the user. Minor
    inconsistency.

---

## 15. Recommendations - phased

### V1 (must)

- Build the receipts module per §10 checklist above. This is the largest
  single missing piece.
- Wire `PaymentStatusChip` to `payment.status.*` i18n keys.
- Add `payment.sourceType.*` i18n keys and use them in place of raw enum
  text on `/billing`, `MarkPaidSheet`, `ClientBillingTab`.
- Build a minimal Financial Documents upload + list (single category, single
  upload, single review toggle). Defer ingestion and complex filter UI.
- Add a `₪` formatter (or pick the ISO-code convention deliberately and
  apply uniformly). Update `fmtAmount` helpers.
- Wire the "Create receipt" checkbox on `MarkPaidSheet` to route to a draft
  receipt form on save.
- Add a real (non-stub) Receipts list to the client detail Receipts tab,
  even if empty initially.
- Add `payment.sourceMonthly`-style link rendering when other source types
  are set (link to the bank or OTC, not just the monthly item).
- Split `ClientBillingTab` into per-section files.

### V1.5 (should)

- Add a sub-tab structure to the client billing tab: "Plans + Banks + OTC"
  and "Payments + Receipts."
- Add edit dialogs for monthly items, hourly banks, and OTC.
- Add a Client filter and a date-range filter to `/billing`.
- Add a "Total overdue amount" KPI (alongside the count) to `/billing`.
- Convert `MarkPaidSheet` from modal to side sheet per spec §10.4.
- Add an amount field to MarkPaidSheet for `partially_paid` flow.
- Add the country chip to the admin header (`Header.tsx`).
- Use `lib/time.ts` `formatTz` everywhere in billing for `Asia/Jerusalem`
  dates; switch the default date in date inputs to today-in-Jerusalem.
- Wire `BurnRateBar` and `BillingPageActions` to i18n.
- Wire Receipts saved-view scope (schema already supports it).
- Deep-link the dashboard banks-low list to a per-bank anchor inside
  `ClientBillingTab`.

### V2 (could)

- Tax Authority allocation API integration (replace stub at
  `lib/receipts/allocation.ts:36-60`).
- Email ingestion for Financial Documents.
- Bookkeeping CSV export per Israeli accountant format.
- PDF generation for receipts (HTML-first ships in V1).
- A small "Money" dashboard widget on `/dashboard` summarising drafts
  awaiting finalize, receipts awaiting allocation, and inbound documents
  awaiting review.
- Receipts dashboard tile with "issuance velocity" or "average days to
  finalize" for accountant SLAs.
- Multi-currency exchange-rate auto-pull (today user fills `exchangeRate`
  manually per `prisma/schema.prisma:650`).

---

## Handoff to PM

### Top three UX risks

1. **Receipts is a black hole.** The backend is largely ready (finalize
   invariants, credit-note, cancel, allocation stub) but no admin can issue
   a receipt today. Until receipts ship, the mark-paid flow is incomplete
   and the "Create receipt" CTA on MarkPaidSheet is dishonest copy. This is
   the single biggest UX blocker for pilot expansion.
2. **Hebrew users still see English where it counts.** PaymentStatusChip,
   `sourceType` enum text, `ClientBillingTab` strings, BurnRateBar labels,
   and the entire `BillingPageActions` "Update" surface are hardcoded
   English. The Phase 1 i18n wire-up landed in the framework but the
   billing chips and copy were not migrated.
3. **`/financial-documents` is a 449-line empty room.** It is well-designed
   but completely non-functional. Phase 3 5.3 attachments could power a
   minimal upload-and-list in a day; not doing so means the link in the
   sidebar invites confusion every time an admin clicks it.

### Top three quick wins

1. **Wire `PaymentStatusChip` to i18n.** Twenty-line change at
   `components/billing/PaymentStatusChip.tsx:3-11`. Hebrew chips light up
   everywhere at once.
2. **Add `payment.sourceType.*` keys and use them.** Three call-sites
   (`app/(portal)/billing/page.tsx:167, 219`, `MarkPaidSheet.tsx:115`,
   `ClientBillingTab.tsx:776`). Removes the worst "raw enum" leak.
3. **Replace the client-detail Receipts tab stub with a real (empty-state)
   list.** Even before the receipts module is built, listing zero rows with
   a "no receipts yet" empty state and a disabled "Create receipt" button
   gated by the feature flag is more honest than the "Phase 7" copy. About
   30 lines in `app/(portal)/clients/[id]/page.tsx:321-333` plus a small
   query.

Bonus quick wins under an hour each: add a "Clear aging" link near the
`AgingStrip` when an `aging` filter is active; pass a per-bank URL anchor
through to the dashboard banks-low rows; add `₪` to the `fmtAmount` helper
when currency is ILS.
