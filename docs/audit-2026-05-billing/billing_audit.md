# Billing Module Audit (post Phases 1-3)

Date: 2026-05-25.
Branch HEAD: `claude/friendly-swanson-71ed53` (Phase 3 commit `18d880b`).
Scope: `lib/billing/*`, `app/api/billing/**`, `app/api/clients/[id]/billing/**`, `app/(portal)/billing/*`, `components/billing/*`, and the billing tab in `app/(portal)/clients/[id]/page.tsx`.
Out of scope: receipt finalization internals, Israeli compliance research, schema redesign. Those are owned by sibling audits.

---

## 1. Executive summary

- The billing surface is small and disciplined. Five entities (`BillingAccount`, `MonthlyBillingItem`, `HourlyBank`, `HourlyBankUsage`, `OneTimeJobCharge`, `Payment`) are wired through nine REST routes with a uniform `requireAuth -> isAdmin -> Zod -> $transaction(writeAudit)` shape. No deviation found.
- Money is stored as `Int` minor-unit "placeholder" fields (`amount_placeholder`, `price_amount_placeholder`, etc.). The UI labels them as reference figures, not accounting figures. This is honest and matches the spec.
- Phase 2 added the time-bucketed AR aging strip (`lib/billing/queries.ts:169-221`) and hourly-bank burn-rate (`lib/billing/queries.ts:294-330`). Both are feature-flag gated, both have unit + integration tests, both surface on `/billing` and on the admin dashboard.
- Three real gaps remain. (a) The `Payment` row has no `vatAmount` / `amountBeforeVat` and no VAT rate is captured at the billing level - VAT only exists on the `ReceiptDocument`, which means the AR aging totals are gross-of-zero-VAT and cannot be reconciled against tax reports. (b) There is no overdue-sweeper cron; `status = overdue` is set only manually through `MarkPaidSheet`. (c) There is no edit dialog for `MonthlyBillingItem`, `HourlyBank`, or `OneTimeJobCharge` despite full PATCH routes - admins must drive the API directly to fix a typo. Phase-6 audit flagged (c) in May 15 and it has not landed since.
- Three architectural shortcomings will bite when the receipts module activates. (1) `Payment.linkedReceiptId` exists in the schema (`prisma/schema.prisma:600`) but no code path writes it; the placeholder note in `MarkPaidSheet` (`components/billing/MarkPaidSheet.tsx:171-177`) is just text. (2) `OneTimeJobCharge.paymentId` is updatable via PATCH but the create-payment dialog does not auto-link a one-time charge when `sourceType = "one_time"`. (3) `getClientBillingData` returns all payments with `take: 50` and no pagination - long-lived clients will lose history.
- Money currency mixing is not handled. `BillingAccount.defaultCurrency` is read but `MonthlyBillingItem.currency`, `HourlyBank.currency`, and `Payment.currency` are independent and never converted. The aging-bucket SQL sums `amount_placeholder` without grouping by currency, so a client with ILS and USD payments produces a meaningless total.
- The state machine is enforced in `MarkPaidSheet.NEXT_STATUSES` (`components/billing/MarkPaidSheet.tsx:45-51`) but not at the API. A caller hitting `PATCH /api/billing/payments/[id]` directly can move any status to any other. The only API-level check is "paidDate required when status=paid" (`app/api/billing/payments/[id]/route.ts:49-51`).

---

## 2. Entity map

### 2.1 Entities and relations

```
Client (1) ─── (1) BillingAccount
                    │
                    ├── (1..N) MonthlyBillingItem  ─── (0..N) Payment (sourceType=monthly)
                    ├── (1..N) HourlyBank           ─── (0..N) Payment (sourceType=hourly_bank)
                    │              │
                    │              └── (1..N) HourlyBankUsage ─── (1) Job
                    └── (1..N) OneTimeJobCharge    ─── (0..1) Payment (sourceType=one_time)
                                  │
                                  └── (1) Job (unique 1:1; job has exactly 0..1 charge)

Payment ─── (0..1) ReceiptDocument (Payment.linkedReceiptId; not yet written by code)
Payment ─── (0..N) Job          (Job.linkedPaymentId; rendered read-only in JobRelatedTab)
```

Source files: `prisma/schema.prisma:462-620` for the entire billing block, `prisma/migrations/20260524000000_init/migration.sql:278-362` for the SQL table shapes.

### 2.2 Enums

| Enum | Values | Used by | Source |
|---|---|---|---|
| `PaymentStatus` | draft, sent_to_client, waiting_for_payment, partially_paid, paid, cancelled, overdue | `Payment.status` | `prisma/schema.prisma:62-70` |
| `PaymentMethod` | bank_transfer, bit, cheque, cash, credit_card, other | `Payment.method` | `prisma/schema.prisma:72-79` |
| `PaymentSourceType` | monthly, hourly_bank, one_time | `Payment.sourceType` | `prisma/schema.prisma:81-85` |
| `MonthlyBillingStatus` | active, paused, cancelled, none | `MonthlyBillingItem.status` | `prisma/schema.prisma:114-119` |
| `HourlyBankStatus` | active, used_up, none | `HourlyBank.status` | `prisma/schema.prisma:121-125` |
| `Currency` | ILS, USD, EUR | every billing entity | `prisma/schema.prisma:170-174` |

`PaymentStatus.overdue` and `HourlyBankStatus.used_up` are not derived by any background job. They must be set manually.

### 2.3 Indexes (selected)

| Table | Index | Purpose |
|---|---|---|
| `payments` | `(client_id, status)` | client-scoped status filter |
| `payments` | `(status, due_date)` | aging and overdue scans |
| `payments` | `(paid_date)` | "paid this month" KPI |
| `hourly_bank_usages` | `(hourly_bank_id, used_at desc)` | bank burn-rate inputs |
| `monthly_billing_items` | `(billing_account_id)` plus `(status)` plus `(next_due_date)` | recurring scan (not used by code today) |

`prisma/schema.prisma:515-518, 540-541, 560-561, 616-618`.

---

## 3. API surface

| Method | Path | Role gate | Audit action | Status codes | Notes |
|---|---|---|---|---|---|
| GET | `/api/billing/payments` | `isAdmin` | none (read) | 200, 401, 403 | Accepts `?status=` (repeatable) and `?clientId=`. Validates status against `VALID_STATUSES`. `app/api/billing/payments/route.ts:16-29`. |
| POST | `/api/billing/payments` | `isAdmin` | `payment.created` | 201, 400, 401, 403, 404 | Zod `createSchema`. 404 if client missing. `app/api/billing/payments/route.ts:45-85`. |
| GET | `/api/billing/payments/[id]` | `isAdmin` | none | 200, 401, 403, 404 | Returns includes for `client`, `sourceMonthly`, `createdBy`. `app/api/billing/payments/[id]/route.ts:11-20`. |
| PATCH | `/api/billing/payments/[id]` | `isAdmin` | `payment.updated` | 200, 400, 401, 403, 404 | Whitelist patch fields. Enforces "paidDate when status=paid". No transition matrix check. `app/api/billing/payments/[id]/route.ts:32-78`. |
| GET | `/api/clients/[id]/billing/monthly-items` | `isAdmin` | none | 200, 401, 403, 404 | `app/api/clients/[id]/billing/monthly-items/route.ts:14-28`. |
| POST | `/api/clients/[id]/billing/monthly-items` | `isAdmin` | `monthly_billing_item.created` | 201, 400, 401, 403, 404 | `app/api/clients/[id]/billing/monthly-items/route.ts:40-78`. |
| PATCH | `/api/clients/[id]/billing/monthly-items/[itemId]` | `isAdmin` | `monthly_billing_item.updated` | 200, 400, 401, 403, 404 | `app/api/clients/[id]/billing/monthly-items/[itemId]/route.ts:24-61`. |
| DELETE | `/api/clients/[id]/billing/monthly-items/[itemId]` | `isAdmin` | `monthly_billing_item.deleted` | 204, 401, 403, 404 | Hard delete. No FK guard against linked payments. `app/api/clients/[id]/billing/monthly-items/[itemId]/route.ts:63-84`. |
| GET | `/api/clients/[id]/billing/hourly-banks` | `isAdmin` | none | 200, 401, 403, 404 | Includes `usages`. `app/api/clients/[id]/billing/hourly-banks/route.ts:14-31`. |
| POST | `/api/clients/[id]/billing/hourly-banks` | `isAdmin` | `hourly_bank.created` | 201, 400, 401, 403, 404 | `app/api/clients/[id]/billing/hourly-banks/route.ts:44-83`. |
| PATCH | `/api/clients/[id]/billing/hourly-banks/[bankId]` | `isAdmin` | `hourly_bank.updated` | 200, 400, 401, 403, 404 | `app/api/clients/[id]/billing/hourly-banks/[bankId]/route.ts:26-63`. |
| DELETE | `/api/clients/[id]/billing/hourly-banks/[bankId]` | `isAdmin` | `hourly_bank.deleted` | 204, 401, 403, 404 | Hard delete; cascades usages via FK. `app/api/clients/[id]/billing/hourly-banks/[bankId]/route.ts:65-86`. |
| GET | `/api/clients/[id]/billing/hourly-banks/[bankId]/usages` | `isAdmin` | none | 200, 401, 403, 404 | `app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts:16-34`. |
| POST | `/api/clients/[id]/billing/hourly-banks/[bankId]/usages` | `isAdmin` | `hourly_bank_usage.created` | 201, 400, 401, 403, 404 | Validates job exists. No check that usage minutes do not exceed remaining bank balance. `app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts:42-80`. |
| GET | `/api/clients/[id]/billing/one-time-charges` | `isAdmin` | none | 200, 401, 403, 404 | Includes `job` and `payment`. |
| POST | `/api/clients/[id]/billing/one-time-charges` | `isAdmin` | `one_time_job_charge.created` | 201, 400, 401, 403, 404 | Dedup guard: `if (job.oneTimeCharge) return badRequest(...)` (`app/api/clients/[id]/billing/one-time-charges/route.ts:59-61`). |
| PATCH | `/api/clients/[id]/billing/one-time-charges/[chargeId]` | `isAdmin` | `one_time_job_charge.updated` | 200, 400, 401, 403, 404 | `paymentId` is patchable but no validation that the payment belongs to the same client. |
| DELETE | `/api/clients/[id]/billing/one-time-charges/[chargeId]` | `isAdmin` | `one_time_job_charge.deleted` | 204, 401, 403, 404 | |

### 3.1 Observations on the surface

- No `BillingAccount` CRUD route exists. The account is auto-created in the client POST (`app/api/clients/route.ts:66`) and is otherwise modified only through child entities. `BillingAccount.defaultCurrency` is read by `ClientBillingTab` but no UI or API path edits it - changing a client's default currency requires direct DB access. Worth a follow-up.
- No `/api/billing/account` or `/api/clients/[id]/billing/account` route.
- No rate limiting on any billing route (verified: `grep "rate-limit" app/api/billing app/api/clients/[id]/billing` is empty). Rate-limit middleware (`lib/rate-limit.ts`) is only wired into auth and admin-password endpoints per the Phase-1 backend audit (`docs/audit-2026-05/backend_audit.md:284`).
- All routes correctly use `prisma.$transaction(tx => ...)` around the mutation plus audit write. `writeAudit` is called inside every mutation handler (verified by grep, 11 of 11 mutation files).
- Diff-building shape is duplicated across files in the standard `for (const [k,v] of Object.entries(d))` pattern (`payments/[id]/route.ts:55-63`, `monthly-items/[itemId]/route.ts:39-47`, `hourly-banks/[bankId]/route.ts:41-49`, `one-time-charges/[chargeId]/route.ts:37-45`). A `buildDiff(existing, patch)` helper was suggested in the backend audit and not yet added.
- Error envelopes are uniform: `{ error: string }` for 4xx, `{ error: "Validation failed", issues }` for 400. `unprocessable()` (422) from `lib/api-utils.ts:35-38` is not used by any billing route.

---

## 4. Domain layer

`lib/billing/queries.ts` (379 lines) is the only file in `lib/billing/`. Exports:

| Symbol | Kind | Purpose | Lines |
|---|---|---|---|
| `AGING_BUCKET_KEYS` | const | The four bucket strings | 5 |
| `AgingBucketKey` | type | union of bucket strings | 6 |
| `bucketize(dueDate, now)` | pure fn | Map a date to a bucket key. Future dates land in 0-30. Null returns null. Inclusive upper bounds (30, 60, 90). | 22-29 |
| `bucketRange(key, now)` | pure fn | Inverse: bucket -> `{gte, lte}` date span | 31-45 |
| `getClientBillingData(clientId)` | query | Parallel `findUnique` on BillingAccount (with all children) and `findMany` on Payment with `take: 50`. | 47-82 |
| `listPayments(opts)` | query | Status + clientId filters, include client + sourceMonthly | 84-101 |
| `getBillingKpis()` | query | Three counts in parallel: unpaid, overdue, paid this month | 103-120 |
| `getPaymentById(id)` | query | Single payment with includes | 122-131 |
| `getAgingPayments()` | query | "Needs attention" list: top 10 by status+due_date | 133-143 |
| `AgingBuckets` | interface | Bucket counts + summed amounts | 145-154 |
| `getAgingBuckets()` | query | One raw SQL round-trip, returns counts + summed amounts per bucket | 169-221 |
| `listPaymentsByAgingBucket(bucket)` | query | Bucket-scoped find with same include shape as `listPayments` | 234-266 |
| `BankBurn` | interface | Burn projection shape | 270-276 |
| `getBankBurn(id \| ids)` | overloaded query | One round-trip per call (banks + usages), then in-process group-by | 294-330 |
| `computeBurnFor(bank, usages)` | pure fn | Pure compute used by `getBankBurn`, exported for tests | 333-368 |

### 4.1 Findings

- **N+1**: the Phase-2 fix (`P2-4.8`) refactored `getBankBurn` to a 2-query shape regardless of bank count. Verified: `getBankBurn` does `Promise.all` on a `findMany` of banks and a `findMany` of usages keyed `{ in: ids }`, then maps in process (lines 308-321). Dashboard's `getHourlyBanksLow` (`lib/dashboard/queries.ts:236-292`) duplicates that approach inline rather than calling `getBankBurn(ids)`. Worth consolidating.
- **Aging SQL**: `getAgingBuckets` uses `prisma.$queryRaw` with a `CASE WHEN GREATEST(0, FLOOR(...)) ...` expression and inline `Prisma.sql` for the status set. The query is single round-trip and correct against the schema (`amount_placeholder` column verified in `prisma/migrations/20260524000000_init/migration.sql:348`). The SQL excludes `due_date IS NULL` rows (line 182) which matches the JS bucketize behavior.
- **Aging currency conflation**: the SUM is over `amount_placeholder` with no `GROUP BY currency`. A client with mixed ILS and USD payments produces an arithmetic sum that is not meaningful in any single currency. The audit considers this a Medium severity gap because real-world clients are almost always single-currency, but it must be flagged before a non-ILS client exists.
- **`getClientBillingData` payment cap**: `take: 50` on the per-client payment list with no pagination, no `skip`, no `before/after` cursor (line 77). A client with > 50 payments will silently lose history in the client billing tab. No "load more" control in the UI.
- **No `lib/billing/aging.ts` or `lib/billing/burn-rate.ts` files**: the original plan called for separate files (cited in `docs/audit-2026-05/backend_audit.md:233-234`). Everything lives in `queries.ts`. Acceptable; the file is 379 lines and cohesive.
- **No write helpers**: there is no `lib/billing/payments.ts` or `lib/billing/mark-paid.ts`. Write logic is inlined in the route handlers. This matches the project style; it becomes an issue when "create payment + link to receipt + update billing item" is composed in Phase 7.

---

## 5. UI inventory

### 5.1 `/billing` admin page

`app/(portal)/billing/page.tsx`, 282 lines.

| Section | Source lines | State |
|---|---|---|
| `PageHeader` with `billing.title` and `billing.description` | 86-91 | i18n complete (en/he) |
| `SavedViewBar` (scope: `billing`, flag-gated) | 93-101 | Wired to `saved_views_enabled` and `saved_views_team_shared_enabled` |
| KPI strip: Unpaid, Overdue, Paid this month | 104-126 | Pulled from `getBillingKpis()`; each card links to `?status=…` |
| AgingStrip (flag-gated by `aging_buckets_enabled`) | 129-145 | Click-through `?aging=<bucket>` |
| "Needs attention" `SectionCard` with top-10 aging payments | 148-180 | Read from `getAgingPayments()` |
| Status filter chips + payments table | 183-242 | Filter chips: All, Awaiting, Partial, Overdue, Paid, Draft |
| `StatusFilterLinks` helper | 250-282 | Six options; i18n via `billing.filter*` keys |

**Gaps**: no create-payment button on the page (admin must enter a client to create one). No client filter UI (the route accepts `?clientId=` but nothing builds the link). Status filter accepts a single status; the API supports multi-status arrays but the UI never sends them.

**Date format**: `fmtDate` uses `toLocaleDateString("en-GB", ...)` hardcoded (line 41). Never honors the user's `languagePref`. Hebrew users see "24 May 2026" not "24 במאי 2026".

**Amount format**: `fmtAmount` is `"{value.toLocaleString()} {currency}"` (line 44-47). No `Intl.NumberFormat` with currency style, no shekel sign. Amounts are minor units stored as `Int` - `12345` displays as `12,345 ILS` not `₪123.45`. The UI is honest about this being "reference placeholders" but for the pilot this will mislead users into thinking 12345 is the agorah-precise value.

### 5.2 `BillingPageActions`

`components/billing/BillingPageActions.tsx`, 46 lines. Thin wrapper around `MarkPaidSheet`. Hides itself when `status` is `paid` or `cancelled` (line 24). The button text "Update" is not internationalized (hardcoded English on line 36); compare to MarkPaidSheet which uses `t(...)` everywhere.

### 5.3 `MarkPaidSheet`

`components/billing/MarkPaidSheet.tsx`, 194 lines. Uses Radix Dialog. i18n through `useT`.

- `NEXT_STATUSES` (45-51) defines the allowed forward transitions per current status. The matrix is correct: terminal states (`paid`, `cancelled`) are absent so the modal renders the "terminal state" copy (122-127).
- Required fields when transitioning to `paid`: `paidDate` and `method`. The form validates client-side (69-71); server validates only `paidDate` (`app/api/billing/payments/[id]/route.ts:49-51`). A direct API call could mark paid without method.
- Receipt handoff: lines 171-177 render a static text block with `Receipt` icon, body copy from `billing.receiptDocumentBody`. No button, no link. `linkedReceiptId` is not set anywhere.

### 5.4 `ClientBillingTab`

`components/billing/ClientBillingTab.tsx`, 937 lines. Four inner section components:

| Section | Lines | Add | Edit | Delete | Notes |
|---|---|---|---|---|---|
| `MonthlySection` | 116-276 | Yes | **No** | Yes | "Add" supports serviceName, price, startDate, status. No endDate input. No billingCycle picker. |
| `HourlyBanksSection` | 278-553 | Yes | **No** | Yes | "Add" form: totalHours, pricePerHour, purchaseDate. No expiryDate input, no alertThresholdPercent input. Has "Log usage" sub-dialog. |
| `OneTimeSection` | 555-689 | Yes | **No** | Yes | "Add" form requires the user to paste a Job UUID from the URL. No client-side search/autocomplete. |
| `PaymentsSection` | 691-890 | Yes | Yes (via MarkPaidSheet) | No | "Create payment" dialog includes optional `sourceMonthlyId` / `sourceHourlyId` linkage. No similar linkage for `one_time` (the matching `OneTimeJobCharge.paymentId` is never set by this dialog). |

The UI is i18n-incomplete inside the tab. All section headers and form labels are hardcoded English ("Monthly billing", "Hourly banks", "One-time charges", "Add", "Service name", "Price/hour", "Job ID", etc.). Only the burn-rate labels use `useT` (lines 437-443).

Disclaimer banner at line 911-913: "Currency: ILS · Amounts shown are reference placeholders only - not verified accounting figures." Hardcoded English, no key.

### 5.5 `BurnRateBar`

`components/billing/BurnRateBar.tsx`, 106 lines. Pure presentational. Inputs: `totalMinutes`, `usedMinutes`, `alertThresholdPercent`, `currency`, `pricePerHour`, optional `burn` projection. Colors: green > 50% > amber > `alertThresholdPercent` > red. Renders "Low balance" text when at or below threshold. Estimated cost: `(usedMinutes / 60) * pricePerHour`, rounded. Hardcoded English text ("remaining of", "Used", "used", "Low balance"). The burn projection uses passed-in labels (i18n-agnostic by design).

### 5.6 `AgingStrip`

`components/billing/AgingStrip.tsx`, 88 lines. Pure presentational. Takes the `AgingBuckets` shape, an `hrefFor` closure, and a labels record (i18n-agnostic). Renders four cards in a 1/2/4-column grid, color-toned by bucket severity (green, amber, orange, red). Empty state when total is 0. Active bucket gets a `ring-2 ring-ring`. Good component.

### 5.7 `PaymentStatusChip`

`components/billing/PaymentStatusChip.tsx`, 27 lines. Has a config record for all seven `PaymentStatus` values. **All labels are hardcoded English** (line 4-10). Does not use `useT`. The `payment.status.<key>` Hebrew keys exist in `lib/i18n/he.json` and are used by `MarkPaidSheet` but not here. Result: the status chip on `/billing` and on `ClientBillingTab` always reads "Awaiting payment", never "ממתין לתשלום".

---

## 6. Workflow walkthroughs

### 6.1 Create monthly item -> create payment -> mark paid

1. Admin opens `/clients/<id>?tab=billing` -> `MonthlySection` "Add" button (`ClientBillingTab.tsx:187`).
2. Submits form -> `POST /api/clients/[id]/billing/monthly-items` with `{ serviceName, priceAmountPlaceholder, currency, startDate, status }` (line 140-150). Validates against `createSchema` (`monthly-items/route.ts:30-38`).
3. Server writes `MonthlyBillingItem` and `monthly_billing_item.created` audit row inside `$transaction` (lines 53-75).
4. `router.refresh()` re-renders the tab. New item appears.
5. Admin clicks "Create payment" in `PaymentsSection` (line 763).
6. Selects `sourceType = "monthly"`, picks the new item from the dropdown (`ClientBillingTab.tsx:816-826`). Form submits `{ clientId, sourceType, sourceMonthlyId, amountPlaceholder, currency, issuedDate, status: "draft", dueDate?, notes? }` -> `POST /api/billing/payments`.
7. Server validates (`payments/route.ts:31-42`), checks client exists, creates payment with `createdByUserId = auth.user.id` (line 71), writes `payment.created` audit.
8. Payment row appears in `PaymentsSection` and in the global `/billing` table after `router.refresh()`.
9. Admin clicks "Update" -> `MarkPaidSheet` opens (`BillingPageActions.tsx:38-44`).
10. Cycles status through `draft -> sent_to_client -> waiting_for_payment -> paid`. On `paid`, must fill paidDate + method, optional reference + notes. `MarkPaidSheet.tsx:72-97`.
11. `PATCH /api/billing/payments/[id]` updates and writes `payment.updated` audit (`payments/[id]/route.ts:65-75`). No receipt is created.

### 6.2 Hourly bank usage

1. Admin opens bank card -> "Log usage" button (`ClientBillingTab.tsx:412`).
2. Pastes Job UUID, enters hours (decimal), optional note.
3. Client computes `minutes = round(hours * 60)` (line 348).
4. `POST /api/clients/[id]/billing/hourly-banks/[bankId]/usages` validates jobId exists (`usages/route.ts:56-57`), creates `HourlyBankUsage` with `recordedByUserId = auth.user.id`, writes `hourly_bank_usage.created` audit.
5. `router.refresh()` re-renders `BurnRateBar` with updated `usedMinutes`. Burn projection updates next request because `getClientBillingData` re-runs.

**Concern**: no check that `usage.minutesUsed + currentUsedTotal <= totalHoursPurchasedMinutes`. Overflow silently produces `remainingMinutes = 0` via `Math.max(0, ...)` in `computeBurnFor` (`queries.ts:357`).

### 6.3 Bucket-click filtering on `/billing`

1. Admin sees AgingStrip (only if `aging_buckets_enabled` flag is on, per `app/(portal)/billing/page.tsx:60-67`).
2. Clicks a bucket card -> URL becomes `?aging=<key>` (`AgingStrip.tsx:61`).
3. Page re-renders, `agingFilter` matches `VALID_AGING` (line 58), `listPaymentsByAgingBucket` runs instead of `listPayments`.
4. Same include shape, same render in the payment table.
5. Active bucket gets the `ring-2` highlight on the AgingStrip (line 66).

Edge case: when `?aging=…` is set, the status filter chips still render but never persist combined `(status + aging)` state. Clicking a status chip discards the aging filter and vice versa.

### 6.4 Dashboard aging strip

1. Admin dashboard reads `aging_buckets_enabled` and `hourly_burn_enabled` together (`dashboard/page.tsx:44-46`).
2. When on, renders `AgingStrip` with `hrefFor=(b) => /billing?aging=${b}` (line 176).
3. Identical labels record (Hebrew/English) as the billing page.

---

## 7. Validation and permissions

### 7.1 Zod schemas (per route)

| Route | Required | Optional | Format checks |
|---|---|---|---|
| POST `/api/billing/payments` | clientId (uuid), sourceType (enum), issuedDate (yyyy-MM-dd) | sourceMonthlyId, sourceHourlyId (uuid), amountPlaceholder (int >= 0), currency (enum), dueDate, status (enum), notes (str <= 2000) | Regex `/^\d{4}-\d{2}-\d{2}$/` for dates |
| PATCH `/api/billing/payments/[id]` | none (partial) | status, paidDate, method (enum), reference (str <= 200), amountPlaceholder, dueDate, notes | Custom rule: paidDate required if status === paid |
| POST monthly-items | serviceName (str 1-200) | priceAmountPlaceholder, currency, startDate (regex), endDate, status (enum), billingCycle (str <= 50) | startDate has default to "today" client-side, but the server requires it |
| PATCH monthly-items | none | serviceName, priceAmountPlaceholder, currency, endDate, status | startDate not patchable (intentional or oversight - unclear) |
| POST hourly-banks | purchaseDate | totalHoursPurchasedMinutes (int > 0), pricePerHourPlaceholder, totalPaymentPlaceholder, currency, expiryDate, status, alertThresholdPercent (0-100) | |
| PATCH hourly-banks | none | same fields minus purchaseDate | |
| POST usages | jobId (uuid), minutesUsed (int > 0) | note (str <= 1000) | recordedByUserId set from session |
| POST one-time-charges | jobId (uuid) | priceAmountPlaceholder, currency | Dedup: returns 400 if job already has charge |
| PATCH one-time-charges | none | priceAmountPlaceholder, currency, paymentId (uuid or null) | No cross-client validation on paymentId |

### 7.2 Permissions

- `lib/permissions.ts:118-120` defines `canManageBilling(user) = isAdmin(user)`. Every route uses `isAdmin` directly rather than `canManageBilling`. Acceptable but inconsistent.
- `canAccessPage(user, "billing") = isAdmin(user)` (`lib/permissions.ts:101-113`).
- Page-level: `/billing` redirects non-admin to `/dashboard` (`page.tsx:53`). Client detail page also redirects non-admin (`clients/[id]/page.tsx:53`).
- Test coverage: `tests/unit/billing-permissions.test.ts` confirms `canManageBilling` is admin-only. `tests/integration/mark-paid.test.ts` confirms PATCH returns 403 for employees and that no DB calls happen on the 403 path.

### 7.3 Concerns

- **Transition matrix not enforced server-side**: only `paidDate when status=paid` is checked. An admin can move `draft -> paid` directly via API. Either move `NEXT_STATUSES` into `lib/billing/payments.ts` and validate it on PATCH, or accept the looseness and document it.
- **No idempotency keys** on payment creation. An admin double-clicking "Create payment" can produce two identical drafts.
- **`paymentId` PATCH on one-time-charges does not verify ownership**: a malicious admin could link a charge to a payment of a different client. Low impact today (admin-only) but worth a uuid-scoped check.
- **No FK guard on monthly-item delete**: deleting a `MonthlyBillingItem` that has linked `Payment` rows will fail with a database FK error returned as a generic 500. Should pre-check or set `ON DELETE SET NULL`.

---

## 8. Money and currency handling

### 8.1 Storage

- All money fields are `Int?` columns named `*_placeholder` (`prisma/schema.prisma:500, 525-526, 570, 592`). Treated as integer minor units in unit-test math but **the unit (agorot vs shekels) is never documented in code or seed**. The fixture in `prisma/seed.ts` and the placeholder spec in `MarkPaidSheet` both display them as if the value is in major units (e.g., `2,500 ILS` for 2500). This is ambiguous and should be locked down before any real values are entered.
- No `Decimal` columns. Acceptable while values are placeholders.

### 8.2 Display

- `fmtAmount(amount, currency)` returns `"{toLocaleString()} {currency}"`. No `Intl.NumberFormat` with `style: "currency"`. No locale-aware thousands separator beyond `toLocaleString()` default.
- Currency code displayed as ISO code ("ILS", "USD", "EUR") rather than symbol (₪, $, €). User-facing consistency in `BurnRateBar` says `"~ILS 1,234 used"`, in `fmtAmount` it says `"1,234 ILS"` (different order). Pick one.

### 8.3 Currency mixing

- `BillingAccount.defaultCurrency` is read once (`ClientBillingTab.tsx:913`) and pre-fills the create-payment dialog. After creation, each `MonthlyBillingItem`, `HourlyBank`, `OneTimeJobCharge`, and `Payment` carries its own `Currency` enum.
- The aging buckets and KPI counts/sums do not group by currency:
  - `getBillingKpis()` (`queries.ts:103-120`) returns counts only - safe.
  - `getAgingBuckets()` (`queries.ts:169-221`) sums `amount_placeholder` across all currencies. A client with two ILS payments and one USD payment produces an arithmetic sum that has no meaningful currency.
  - `getAgingPayments()` returns rows with their own currency, so the UI per row is fine.
- No FX conversion anywhere. Receipts have an `exchangeRate` field (`prisma/schema.prisma:649-650`) but `Payment` has none.

### 8.4 VAT

- **Payment has no VAT fields.** No `amountBeforeVat`, no `vatAmount`, no `vatRateBasisPoints`. Compare to `ReceiptDocument` which has all three (`prisma/schema.prisma:633-636`). The implication: when a receipt is finalized from a payment (Phase 7), the receipt must independently compute VAT - the payment row only knows the gross. If the receipt and payment must reconcile in an audit, the gross has to be reverse-engineered to the pre-VAT split, which is inherently lossy.
- `MarkPaidSheet` does not collect VAT, does not show VAT, and does not display "VAT-inclusive" vs "VAT-exclusive" anywhere. The pilot risk: the admin records a payment of `1190 ILS` not knowing whether that is the VAT-inclusive total or the net.
- The receipt module's default `vatRateBasisPoints = 1800` (`prisma/schema.prisma:634`) is 18.00%. The current Israeli standard VAT rate is 17% (per Israel Tax Authority since 2015), and the 18% rate took effect in 2025. This is correct for 2026 but should be confirmed by the Israel-compliance audit.

---

## 9. Feature flags

| Key | Default | Where read | Where it gates |
|---|---|---|---|
| `aging_buckets_enabled` | false (`prisma/fixtures/feature-flags.json`) | `app/(portal)/billing/page.tsx:67`, `app/(portal)/dashboard/page.tsx:45` | UI render of `AgingStrip` + query call to `getAgingBuckets()` (skipped when off). `listPaymentsByAgingBucket` is still called when `?aging=…` is present in the URL, since the page-level check is only on the strip render. |
| `hourly_burn_enabled` | false | `app/(portal)/clients/[id]/page.tsx:74`, `app/(portal)/dashboard/page.tsx:46` | UI render of burn projection lines on `BurnRateBar` + the `BanksLowSection` on dashboard. `getBankBurn` is only called when the flag is on (lines 75-79 in `clients/[id]/page.tsx`). |
| `saved_views_enabled` | false | `app/(portal)/billing/page.tsx:65` | Gates the `SavedViewBar` for the billing scope. |
| `saved_views_team_shared_enabled` | false | `app/(portal)/billing/page.tsx:66` | Passes `teamSharedEnabled` to `SavedViewBar` (controls the visibility toggle). |

Findings:

- `?aging=<bucket>` URL parameter bypasses the `aging_buckets_enabled` flag for the *table filter* (the page reads `agingFilter` regardless of flag, line 58). A user with a stale URL after the flag flips off will see filtered results without the strip. Not a security issue; cosmetic only.
- No billing-specific flag for "show VAT in UI" - the flag set leaves no room to gradually surface VAT during pilot.

---

## 10. Cross-module integration

### 10.1 Payment <-> Receipt

- Schema: `Payment.linkedReceiptId` (uuid, nullable) and `ReceiptDocument.sourcePayments` (Prisma 1:N relation alias `"PaymentReceipt"`). Defined at `prisma/schema.prisma:600` and `608`.
- Code: **no path writes `linkedReceiptId`**. Receipt finalize/create routes are out of audit scope, but `grep -rn linkedReceiptId lib app | grep -v node_modules` is empty.
- UI: `MarkPaidSheet` has a static placeholder note ("you can create a receipt or tax invoice for this payment in Phase 7"). No link, no button.
- This is the largest integration gap. The receipt audit owns the receipt side; this audit owns the payment side; both must add a link path before Phase 7 ships.

### 10.2 Hourly-bank usage <-> Job

- `HourlyBankUsage.jobId` is a required FK. `POST .../usages` validates the job exists (`usages/route.ts:56-57`) but does not validate the job's client matches the bank's client. A bug here would silently log hours against a wrong-client bank. Add: `if (job.clientId !== bank.billingAccount.clientId) return badRequest(...)`.
- No automatic usage logging from `TimeSession` or job time tracking. Usage is a separate manual entry.

### 10.3 One-time charge <-> Payment

- `OneTimeJobCharge.paymentId` (nullable, FK) and `OneTimeJobCharge.datePaid` (nullable). The PATCH route accepts `paymentId` (line 19 of `one-time-charges/[chargeId]/route.ts`) but no UI flow uses it. Creating a payment with `sourceType = "one_time"` does **not** link back to the matching charge.
- Result: the same job can have its `OneTimeJobCharge.payment` chip show "(no payment)" while a separate `Payment` row exists with `sourceType = "one_time"`. The two are not associated.

### 10.4 Saved views

- `SavedViewScope` includes `"billing"` (`components/saved-views/SavedViewBar.tsx:29`, `prisma/schema.prisma:145-152`).
- `app/(portal)/billing/page.tsx:93-101` mounts `SavedViewBar` with the current filter state assembled into `currentFilters: { status?, clientId?, aging? }`.
- Verified the team-shared flag flow is honored (`saved_views_team_shared_enabled`).

### 10.5 Notifications

- `lib/notifications/triggers.ts` exports `notifyJobAssigned`, `notifyMention`, `notifySlaBreached`. **None are payment-related**.
- No notification on payment status changes. No notification on overdue. No notification on low hourly balance. The `BanksLowSection` on the dashboard is a pull-based surface; the user must visit the dashboard to see it.
- Phase 7 will likely want a `notifyPaymentOverdue` and `notifyReceiptFinalized` trigger.

### 10.6 Cron

- Three cron jobs registered (`lib/cron/registry.ts:11-31`): `sla-breach`, `recurring-jobs`, `client-health`. **No billing-related cron.**
- No `mark-overdue` cron. `Payment.status = "overdue"` is set only by manual operation in `MarkPaidSheet`. A payment with `dueDate < now` and `status = "waiting_for_payment"` will sit in the "Awaiting" bucket forever unless an admin updates it.
- `MonthlyBillingItem` has `nextDueDate` and `lastBilledPeriod` fields (`prisma/schema.prisma:506-507`) but no writer fills them, no cron generates monthly payments from monthly items. Recurring billing must be done by hand today.

### 10.7 Search

- Billing entities are not indexed in the FTS configuration (`grep -n billing lib/search/*` empty). Searching for "monthly hosting" will never return a monthly billing item. The Phase-2 FTS work covered `Client`, `Job`, and `KnowledgeArticle`.

---

## 11. Gaps and unfinished items

Ranked.

### High

1. **VAT is invisible at the billing layer.** Payment carries no pre-VAT, VAT, or VAT-inclusive flag. `MarkPaidSheet` collects a single amount with no split. Phase 7 receipt finalization will have to re-derive VAT from gross totals, which is lossy and audit-unfriendly. Recommendation: add `amountBeforeVat`, `vatAmount`, `vatRateBasisPoints` to `Payment` and make the create-payment dialog show both gross and net.
2. **No payment-to-receipt linkage path.** `linkedReceiptId` is a dead column. The `MarkPaidSheet` "create a receipt" copy is a placeholder. Phase 7 should not ship until this is implemented as a real button that opens the receipt draft pre-filled, and writes `linkedReceiptId` on success.
3. **No overdue-sweeper cron.** `status = overdue` is manual. Add `app/api/cron/billing-overdue/route.ts` that sweeps `status IN ('sent_to_client','waiting_for_payment','partially_paid') AND dueDate < now` and updates to `overdue`, with audit and optional notification.
4. **Currency mixing in aging totals.** `getAgingBuckets` sums `amount_placeholder` across all currencies. Either group by currency in the SQL and render multi-currency rows, or constrain to a single reporting currency with FX conversion.
5. **Transition matrix only enforced client-side.** `NEXT_STATUSES` lives in `MarkPaidSheet.tsx:45-51`. A direct API call can bypass it. Move into a domain helper and validate in `PATCH /api/billing/payments/[id]`.

### Medium

6. **No edit dialogs for MonthlyBillingItem, HourlyBank, OneTimeJobCharge.** PATCH routes exist; UI has no entry point. Flagged in `docs/phase-6-billing-audit.md` Gap 1; still open.
7. **Hardcoded English in `PaymentStatusChip`, `BillingPageActions`, `BurnRateBar`, and the bulk of `ClientBillingTab`.** i18n keys exist in `lib/i18n/he.json` (e.g. `payment.status.*`) but are not consumed. Hebrew users see English mid-page.
8. **Hardcoded `en-GB` date format.** `fmtDate("en-GB", ...)` is used in three files. Should be `useT().locale`-aware with `Asia/Jerusalem` timezone for date-only fields.
9. **Money display is ambiguous.** `12345` renders as `12,345 ILS`. No symbol, no decimal split, no statement of unit. Add a shared `lib/money.ts` with `formatMoney(amount, currency, locale)`.
10. **`getClientBillingData` payment cap of 50.** Long-lived clients lose history. Add pagination or "Show all payments" link.
11. **`paymentId` cross-client validation missing** on PATCH `/api/clients/[id]/billing/one-time-charges/[chargeId]`. Add `paymentClientId === routeClientId` check.
12. **`HourlyBankUsage` does not validate `job.clientId === bank.client.id`.** Same family of issue as 11.
13. **No `BillingAccount` edit surface.** Default currency, account-level notes, and any future tax-exempt flag are unreachable from the UI.
14. **No monthly-item recurrence writer.** `nextDueDate` is never set, `lastBilledPeriod` is never updated, no cron creates new payments for active monthly items. The whole "monthly retainer" workflow is manual.

### Low

15. **`unprocessable()` (422) not used by billing.** Forward-state errors return 400 instead of 422. Cosmetic inconsistency with jobs lifecycle routes which do use 422.
16. **No rate limiting** on billing mutation endpoints. Admin-only surface so risk is small.
17. **Diff-building shape repeated four times.** A `buildDiff(existing, patch)` helper would shave ~40 lines.
18. **`getHourlyBanksLow` reimplements `getBankBurn`** instead of calling it (`lib/dashboard/queries.ts:236-292` vs `lib/billing/queries.ts:294-330`). Refactor.
19. **`ReceiptsPlaceholder` on `/clients/[id]?tab=receipts`** still says "Phase 7" (`clients/[id]/page.tsx:323-333`). The flag set already includes `receipt_finalize_enabled`; the placeholder copy should be flag-aware once Phase 7 lands.
20. **Filter state on `/billing` is mutually exclusive.** Clicking a status chip drops the aging filter and vice versa. Build the link with `URLSearchParams` to preserve both.

---

## 12. Recommendations for Israel-readiness

These are scoped to what this auditor saw. The dedicated Israeli-compliance audit covers the broader regulatory picture.

1. **Add VAT split to `Payment`.** Three columns: `amount_before_vat`, `vat_amount`, `vat_rate_basis_points`. Surface a "VAT %" picker in `MarkPaidSheet` with a default from `CompanySettings`. Display both gross and net in lists.
2. **Display in shekels with the agorot decimal**. `12345` agorot should render as `₪123.45`. Add `lib/money.ts` with `formatILS`, `formatCurrency`, parse helpers.
3. **Lock the unit**. Add a code comment and a runtime assertion: "All `*_placeholder` columns are integer minor units (agorot for ILS, cents for USD/EUR)." Update the disclaimer banner.
4. **Hebrew date format**. Replace `toLocaleDateString("en-GB", ...)` with `Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Jerusalem" })` where `locale = session.languagePref === "he" ? "he-IL" : "en-GB"`.
5. **Internationalize `PaymentStatusChip`, `BurnRateBar`, the `ClientBillingTab` section headers, and the disclaimer banner**. All keys already exist in `he.json`.
6. **Build the overdue cron** so `overdue` matches what the dashboard claims it is.
7. **Wire receipt linkage from payments**. The handoff is the lowest-friction Phase 7 prerequisite.
8. **Tax ID display**. `Client.israeliTaxId` is shown on the client overview tab (`clients/[id]/page.tsx:170-176`) but never on payment rows. For receipts that will be reconciled against tax records, the tax ID should appear on the payment detail.
9. **Bit, cheque, bank_transfer reference fields**. Today `Payment.reference` is one free-text field for all six methods. For Bit specifically, the transaction id format is well-known. Phase 4 should consider per-method reference validation.

---

## Handoff to PM

**Top 3 concerns**

1. The payment/receipt linkage is a dead pipe. `Payment.linkedReceiptId` is in the schema, the `MarkPaidSheet` advertises receipts in copy, but no code path writes the link. Phase 7 cannot reconcile receipts to payments without this. **Owner: backend + receipts team. Effort: small (single PATCH on finalize).**
2. The billing layer has no concept of VAT. Pilots that issue receipts against these payments will silently lose the pre-VAT/VAT split because it is reconstructed at receipt time rather than stored. This is the highest-risk gap if pilot customers expect tax reports to tie to payment records. **Owner: data engineer + billing. Effort: medium (new columns + UI in two dialogs).**
3. "Overdue" is a manual status. The dashboard KPI, the aging bucket totals, and the "Needs attention" list all rely on someone clicking the chip. A pilot client with an unpaid invoice past due will still show as "Awaiting payment" until an admin notices. **Owner: backend. Effort: small (new cron file + flag).**

**Top 3 quick wins**

1. Internationalize `PaymentStatusChip` and the `ClientBillingTab` section headers/forms. All Hebrew keys exist; this is a one-pass replacement of literals with `t(...)`. **Effort: half a day.**
2. Add edit dialogs for monthly items, hourly banks, and one-time charges. The PATCH endpoints exist and are fully validated; only the modal forms are missing. Same shape as the existing add dialogs. **Effort: one day.**
3. Add a shared `lib/money.ts` with `formatMoney(amount, currency, locale)` using `Intl.NumberFormat` and the agorot decimal split. Replace `fmtAmount` everywhere. **Effort: half a day, plus search-and-replace.**
