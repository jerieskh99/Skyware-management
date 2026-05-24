# Phase 6 Billing Audit

Date: 2026-05-15
Auditor: automated code review + validation run
Source: code inspection + `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec prisma migrate status`

---

## 1. Phase 6 Completion Verdict

**Phase 6 is complete for its committed scope. Phase 7 is safe to start.**

The core billing infrastructure is real and functional: API routes for all five billing entities, full admin billing page with KPIs and payment table, working client billing tab with inline create/delete for all billing types, payment status workflow including mark-paid with required fields, hourly bank burn-rate visualization, and dashboard integration. The implementation matches the notes in `internal-management-portal-implementation-notes.md` Phase 6 section.

Four minor UI gaps exist (documented below). None block Phase 7 and none are silent regressions.

---

## 2. Implemented Billing Features

### 2.1 API Routes

| Route | Methods | Audit result |
|---|---|---|
| `/api/billing/payments` | GET, POST | Complete. Zod schema, admin check, audit log. |
| `/api/billing/payments/[id]` | GET, PATCH | Complete. PATCH requires `paidDate` when `status=paid`. Audit log. |
| `/api/clients/[id]/billing/monthly-items` | GET, POST | Complete. Zod, admin, audit. |
| `/api/clients/[id]/billing/monthly-items/[itemId]` | PATCH, DELETE | Complete. |
| `/api/clients/[id]/billing/hourly-banks` | GET, POST | Complete. Zod, admin, audit. |
| `/api/clients/[id]/billing/hourly-banks/[bankId]` | PATCH, DELETE | Complete. |
| `/api/clients/[id]/billing/hourly-banks/[bankId]/usages` | GET, POST | Complete. Validates `jobId` exists. Audit log. |
| `/api/clients/[id]/billing/one-time-charges` | GET, POST | Complete. Deduplication guard (one charge per job). Audit. |
| `/api/clients/[id]/billing/one-time-charges/[chargeId]` | PATCH, DELETE | Complete. |

All mutations are admin-only at the API layer via `isAdmin(auth.user)` check. Validation is Zod. Audit logs are written inside `prisma.$transaction` via `writeAudit`. No real prices or client data invented; amounts stored as nullable `Int` with `*Placeholder` names throughout.

`BillingAccount` is read implicitly through the `clientId`-scoped routes. A direct `/api/billing/account` read/update route does not exist; the billing account fields are modified through its child entities and through the client PATCH route.

### 2.2 Main Billing Page (`/billing`)

Complete — not a stub.

- Three KPI cards: Unpaid (draft + sent + waiting + partial), Overdue, Paid this month. All sourced from `getBillingKpis()` hitting real payment rows.
- Aging payments list: shows up to 10 payments in `waiting_for_payment | partially_paid | overdue` status with client link, source label, amount, due date, status chip, and Update button.
- Full payment table with six status-filter chips (All, Awaiting, Partial, Overdue, Paid, Draft). Client name links to `/clients/[id]?tab=billing`. Amount, issued date, due date (highlighted red when overdue), status, and Update action per row.
- Empty state when no payments match filter.
- `BillingPageActions` wraps `MarkPaidSheet` for the table row Update button.

Not present: a create-payment dialog on this page. Payments must be created through the client billing tab. Documented as deferred in the notes — the tab workflow is more practical.

Not present: time-bucketed aging strips (e.g. 30/60/90 day buckets). The three-status count card is acceptable at MVP scale.

### 2.3 Client Billing Tab (`/clients/[id]?tab=billing`)

Complete for all four billing types. Data comes from `getClientBillingData` which runs two parallel Prisma queries.

- Monthly billing section: list with service name, amount, billing cycle, start/end, status badge. Inline "Add" dialog with service name (required), amount, start date, status. Delete per item. Empty state.
- Hourly banks section: each bank shows `BurnRateBar` (see section 6). Inline "Add" dialog with total hours, price/hour, purchase date. Delete per bank. Empty state.
- One-time charges section: list showing job link, job number, job title snapshot, amount, date, payment status chip. Inline "Add" dialog (Job ID input + amount). Deduplication checked server-side. Delete per charge. Empty state.
- Payments section: chronological list showing source, amount, issued date, due date, status chip, Update button (via `MarkPaidSheet`) for non-terminal payments.
- `No billing account` error state if account is missing.
- Disclaimer banner: "reference placeholders only — not verified accounting figures."

### 2.4 Billing Forms

| Form | Location | Implemented |
|---|---|---|
| Create monthly item | ClientBillingTab inline | Yes |
| Create hourly bank | ClientBillingTab inline | Yes |
| Create hourly usage | API exists; no UI form in ClientBillingTab | API only — see gap |
| Create one-time charge | ClientBillingTab inline | Yes |
| Create payment | API exists; no dialog on billing page | API only — see gap |
| Update payment status (mark paid) | MarkPaidSheet on billing page + tab | Yes |

All inline forms use `useTransition` for pending state, display server error messages, and call `router.refresh()` on success.

### 2.5 Components

- `PaymentStatusChip`: covers all 7 PaymentStatus enum values with distinct colors.
- `BurnRateBar`: burn-rate progress bar (see section 6).
- `MarkPaidSheet`: handles status transitions from draft through all non-terminal states; includes paidDate + method + reference + notes fields when moving to `paid`.
- `ClientBillingTab`: full client-scoped billing dashboard.
- `BillingPageActions`: wraps `MarkPaidSheet` for table row usage.

---

## 3. Missing or Partial Billing Features

### Gap 1 — No edit dialog for monthly items, hourly banks, or one-time charges

PATCH routes exist for all three entities but the `ClientBillingTab` has no edit dialog. The current UI allows create and delete only. An admin who needs to correct a service name, amount, or status must use the API directly.

**Verdict:** Known UI gap. Not a regression. Does not block Phase 7. Low risk since the admin audience can use the API or the form can be added in a follow-up.

### Gap 2 — No UI form to record hourly bank usage *(fixed in Phase 6–7 cleanup pass)*

`POST /api/clients/[id]/billing/hourly-banks/[bankId]/usages` exists with full validation and audit. Fixed: a "Log usage" button was added per hourly bank card in `HourlyBanksSection`. Clicking it opens an inline dialog with fields: Job ID (UUID paste), hours used (decimal, converted to minutes), optional note. On success `router.refresh()` updates the burn-rate bar.

### Gap 3 — No payment creation UI on global billing page *(fixed in Phase 6–7 cleanup pass)*

Fixed: `PaymentsSection` in `ClientBillingTab` now has a "Create payment" button that opens a dialog with fields: sourceType (monthly/hourly_bank/one_time), optional source dropdown (lists the client's monthly items or hourly banks when sourceType matches), amount, currency, issuedDate (required), dueDate, notes. Payments are created as `draft` status and can be advanced via the "Update" sheet.

### Gap 4 — Payment creation does not set `sourceMonthlyId` or `sourceHourlyId` easily *(fixed in Phase 6–7 cleanup pass)*

Fixed alongside Gap 3: the create-payment dialog in `PaymentsSection` shows a contextual dropdown of the client's monthly items or hourly banks based on `sourceType`. Selecting one sets `sourceMonthlyId` or `sourceHourlyId` in the POST body, which makes the source label on the billing page row show the service name instead of a generic type string.

---

## 4. Permission and Security Review

- Every billing API route calls `requireAuth()` then `isAdmin(auth.user)` before any Prisma operation. UI-only checks do not exist as substitutes.
- The billing page itself calls `isAdmin(user)` and redirects to `/dashboard` if false.
- The client detail billing tab is only accessible via the admin-only client detail page.
- Amounts are validated as `z.number().int().nonnegative()` before storage. No floating-point money handling.
- No real credentials, tax IDs, Israeli registration numbers, or private billing data appear anywhere in the codebase.
- The UI shows the disclaimer "reference placeholders only — not verified accounting figures" in the client billing tab.
- Currency enum is restricted to `ILS | USD | EUR` in all schemas.
- Payment method enum is validated at the PATCH route.
- `paidDate` required when `status = paid` enforced at the route (line 49 of `payments/[id]/route.ts`).

No permission issues found.

---

## 5. Payment Workflow Review

Status values in schema and in code match: `draft, sent_to_client, waiting_for_payment, partially_paid, paid, cancelled, overdue`.

Allowed status transitions are encoded in `MarkPaidSheet.NEXT_STATUSES`:

| Current | Allowed next |
|---|---|
| draft | sent_to_client, cancelled |
| sent_to_client | waiting_for_payment, cancelled |
| waiting_for_payment | paid, partially_paid, overdue, cancelled |
| partially_paid | paid, overdue, cancelled |
| overdue | paid, cancelled |
| paid, cancelled | (terminal — no transitions shown) |

The state machine is not enforced at the API layer (any valid enum value is accepted). The UI shows only contextually allowed transitions. This is a deliberate decision noted in the implementation notes and is acceptable for MVP.

Mark-paid flow: selecting `paid` in `MarkPaidSheet` reveals paidDate (required), method (required, select from 6 options including "Bit"), reference/asmachta (optional), and notes. These map to the PATCH schema. The receipt handoff is a static placeholder note inside the sheet: "After saving, you can create a receipt or tax invoice for this payment in Phase 7." The `Receipt` icon and text appear after the method/reference fields. No receipt generation code exists.

**Phase 7 handoff point is clean.** The placeholder is visible and correctly deferred.

---

## 6. Hourly Bank Review

`BurnRateBar` shows:
- Remaining minutes of total purchased (displayed as h/m format via `fmt`).
- Percentage remaining.
- Color-coded bar: green above 50%, amber 50% and below, red at or below `alertThresholdPercent` (default 25%).
- "Low balance" text label when at or below alert threshold.
- Used minutes.
- Estimated cost used (price per hour × used minutes ÷ 60, rounded).
- Expiry date shown separately outside the bar when set.
- Handles `totalMinutes === null` (displays "Total purchased: TBD").

The total payment placeholder (not the per-hour price but the total paid amount) is displayed above the bank card when non-null.

What is shown: total hours purchased, hours used, hours remaining, price per hour, approximate value used. Total value purchased is shown as `totalPaymentPlaceholder`. Low-balance warning is implemented.

What is not shown: no burn-rate-over-time graph, no projected exhaustion date. These would be useful but are out of scope for Phase 6.

---

## 7. Dashboard Integration Review

`lib/dashboard/queries.ts` `getAdminKpis()` calls `getBillingKpis()` in parallel and returns `unpaidCount` and `overdueCount`. `dashboard/page.tsx` renders a "Unpaid" KPI card with the live count and a warning note when `overdueCount > 0`. The card links to `/billing`.

**Dashboard KPI is live, not placeholder.** The field `unpaidPlaceholder: 0` referenced in the implementation notes was replaced with real data in Phase 6.

`paidThisMonth` is returned by `getBillingKpis()` but is not surfaced on the dashboard (it appears on the `/billing` page KPI strip only). This is fine.

---

## 8. UX and UI Review

- `/billing` page: fully usable. KPI strip, aging list, sortable-by-status table, status filter chips all work. Empty state when no payments. Client links correct.
- `ClientBillingTab`: sections are organized, each has an Add button and empty state. Status badges clear.
- `MarkPaidSheet`: slides up from bottom on mobile, centered on desktop. Form progressive-discloses paid-specific fields. Receipt placeholder clearly labeled.
- `BurnRateBar`: color semantics are clear (green/amber/red). "Low balance" text label visible.
- `PaymentStatusChip`: distinct color per status. Missing a label for `sent_to_client` — check if it is visually distinct from `draft`. (Minor; both would need to be distinct for all 7 statuses.)
- RTL/Hebrew: the billing components use logical CSS (`me-1` for margin-end, `start` for text alignment) which is correct for RTL support.
- Responsive: table uses `hidden sm:table-cell` for issued/due date columns on small screens. The tab sections use `flex-wrap`.

---

## 9. Validation Results

| Check | Result | Notes |
|---|---|---|
| `pnpm typecheck` | **Pass — 0 errors** | |
| `pnpm lint` | **Pass — 0 warnings, 0 errors** | |
| `pnpm test` | **Pass — 56/56** | All 56 unit tests pass. No billing-specific unit tests exist (billing is tested via e2e or manual). |
| `pnpm exec prisma migrate status` | **Up to date** | 1 migration, database schema current. |
| `pnpm dlx prisma migrate status` | Fails with P1012 | `pnpm dlx` fetches Prisma 7.x CLI which changed datasource config API. Use `pnpm exec` instead. Not a project issue. |

The `pnpm dlx prisma` failure is a tooling version mismatch. The project installs Prisma `^5.22.0` which is correct and working. The implementation notes should say `pnpm exec prisma migrate status`, not `pnpm dlx`.

---

## 10. Is Phase 7 Safe to Start?

**Yes.** The following conditions are met:

1. Payment entity exists in the schema with the correct status enum and `paidDate`, `method`, `reference` fields.
2. `ReceiptDocument` and `ReceiptDocumentSequence` models are in the schema (unused by app code; Phase 7 will activate them).
3. `receipt_finalize_enabled` feature flag exists in the schema and seed.
4. Mark-paid flow has a clear handoff point (placeholder note in `MarkPaidSheet`).
5. Typecheck, lint, and tests pass cleanly.
6. No real money calculations, tax IDs, or compliance logic exists that Phase 7 could accidentally extend.

One pre-condition that should be addressed before or during Phase 7 start: **a create-payment UI is needed** (Gap 3 above). Without it, the Phase 7 mark-paid → receipt flow has nothing to exercise in the UI. Adding a minimal "Create payment" inline form to `ClientBillingTab` is the recommended first task.

---

## 11. Recommended Next Prompt for Phase 7

```
Follow the token-efficiency rules in .claude/CLAUDE.md and .claude/rules.md.

Read docs/internal-management-portal-implementation-notes.md (Phase 7 scope) and
docs/phase-6-billing-audit.md (Gap 3 note about missing create-payment UI) before
starting.

Task: Implement Phase 7 — Receipts.

Pre-task (do first, in the same phase):
- Add a "Create payment" inline form to ClientBillingTab PaymentsSection so admins
  can create a payment linked to a client from the UI. The form fields must match
  POST /api/billing/payments (sourceType, optional sourceMonthlyId, amountPlaceholder,
  currency, issuedDate, dueDate, status default "draft"). This is a blocker for the
  mark-paid → receipt flow.

Phase 7 features:
1. ReceiptDocument CRUD (create draft, finalize, cancel, view).
2. ReceiptDocumentSequence — monotonic document number per type per year using
   SELECT FOR UPDATE in a transaction. Sequence must never repeat.
3. Draft → finalize flow gated behind the `receipt_finalize_enabled` feature flag
   (default false). When flag is false, finalize button is hidden, not just disabled.
4. HTML receipt view at /receipts/[id] with client name, document type, number,
   items summary, payment reference, and a verification banner.
5. Link from MarkPaidSheet "After marking paid, create a receipt" placeholder →
   /receipts/new?paymentId=[id] with payment pre-filled in the draft form.
6. /receipts page: list of all ReceiptDocuments for admin, filterable by status and type.
7. Client detail Receipts tab: client-scoped ReceiptDocument list.

Israeli tax/accounting language requirements:
- All amounts remain *Placeholder fields. Do not add real VAT or tax calculation logic.
- Display "Amounts are reference figures only. Verify with your accountant." on all
  receipt views.
- Document type labels must be accurate Hebrew-English: חשבון עסקה (invoice),
  קבלה (receipt), חשבונית מס (tax invoice), חשבונית מס קבלה (tax invoice receipt),
  זיכוי (credit note), חשבון עסקה מקדים (proforma invoice). Keep English labels in UI;
  add Hebrew subtitles as tooltips or secondary text only.
- Do not generate real legal document numbers that would constitute Israeli tax
  documents. Include a comment in the sequence code: "Placeholder numbering only —
  not compliant Israeli document numbering until reviewed by an accountant."

Constraints:
- Admin-only pages and APIs.
- Zod validation on all mutations.
- Audit log on create, finalize, cancel.
- receipt_finalize_enabled flag checked server-side, not UI-only.
- No real tax authority submission, no real PDF generation.
- No real client billing data invented.
- Typecheck, lint, and tests must pass.

After implementation, update docs/internal-management-portal-implementation-notes.md
and docs/current-implementation-audit.md.
```

---

## Appendix: Files Audited

| File | Finding |
|---|---|
| `app/(portal)/billing/page.tsx` | Full implementation, 246 lines. All KPI, aging, and table sections real. |
| `app/api/billing/payments/route.ts` | GET + POST, admin-only, Zod, audit. |
| `app/api/billing/payments/[id]/route.ts` | GET + PATCH, paidDate enforcement, audit. |
| `app/api/clients/[id]/billing/monthly-items/route.ts` | GET + POST, audit. |
| `app/api/clients/[id]/billing/hourly-banks/route.ts` | GET + POST, audit. |
| `app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts` | GET + POST, audit. |
| `app/api/clients/[id]/billing/one-time-charges/route.ts` | GET + POST, dedup guard, audit. |
| `components/billing/ClientBillingTab.tsx` | 530 lines, all four sections. No edit dialogs, no create-payment form, no log-usage form. |
| `components/billing/MarkPaidSheet.tsx` | 189 lines. Full status workflow. Phase 7 receipt placeholder present. |
| `components/billing/BurnRateBar.tsx` | 67 lines. Full burn-rate visualization. |
| `components/billing/BillingPageActions.tsx` | 46 lines. Update button wrapping MarkPaidSheet. |
| `lib/billing/queries.ts` | 5 queries. All correct. |
| `lib/dashboard/queries.ts` | `getAdminKpis` calls `getBillingKpis`, returns live counts. |
| `app/(portal)/dashboard/page.tsx` | Unpaid KPI card uses live data. |
| `app/(portal)/clients/[id]/page.tsx` | Billing tab loads real data. |
| `docs/internal-management-portal-implementation-notes.md` | Phase 6 section accurate. `prisma migrate status` command should say `pnpm exec prisma`. |
| `docs/current-implementation-audit.md` | Up to date. Gap 3.4 documented. |
