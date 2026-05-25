# Receipts and Tax Documents Audit

Date: 2026-05-25. Branch: claude/friendly-swanson-71ed53. HEAD: 18d880b (Phase 3 post-pilot expansion).

Scope: receipts/tax-documents subsystem only. Israel-specific accounting rules are owned by `israel_compliance_audit.md`. Schema-wide critique is owned by `database_schema_audit.md`. This audit focuses on the receipt fields, the domain layer, the API surface, the placeholder UI, and the work that must still happen before the `receipt_finalize_enabled` flag can be flipped on.

## 1. Executive summary

The receipts module is a half-built engine. Phase 3 §5.4 added the data invariants the auditors flagged in `docs/audit-2026-05/database_audit.md` §9 (check constraints, exchange-rate column, credit-note self-relation, allocation skeleton). The domain layer in `lib/receipts/` is small, typed, and audit-clean. Four mutating endpoints exist behind the `receipt_finalize_enabled` flag (default false). There are six unit/integration tests for the domain functions.

What is missing is everything a human operator would touch:

- No way to create a draft receipt. No `POST /api/receipts`.
- No way to read a draft. No `GET /api/receipts` or `GET /api/receipts/[id]`.
- No way to edit a draft. No `PATCH /api/receipts/[id]`.
- No way to render a receipt as a PDF. No template engine, no Hebrew font, no `GET /api/receipts/[id]/pdf`.
- No UI surface beyond a static "compliance hold" placeholder at `/receipts` (`app/(portal)/receipts/page.tsx`) and a "Phase 7" placeholder card in the client detail "Receipts" tab (`app/(portal)/clients/[id]/page.tsx:323-332`).
- No handoff from `MarkPaidSheet` to a "create receipt from payment" flow. The component shows a static info box (`components/billing/MarkPaidSheet.tsx:171-177`) but does not call any receipt API.
- The `Payment.linkedReceiptId` foreign key (schema line 600, 608) is never written anywhere in code.
- The Company Settings admin UI is still a disabled-input placeholder (`app/(portal)/admin/page.tsx:483-525`), even though the `CompanySettings` table, `lib/company-settings/queries.ts`, the `/api/admin/company-settings` route, and a `CompanySettingsForm` component already exist. The form is orphaned. Receipt templates that read `legalNameHe`, `vatNumber`, `receiptFooterHe` will see nulls until the admin tab is wired.
- The allocation-number flow is a stub. The threshold (25,000 ILS = 2,500,000 agorot, `lib/receipts/allocation.ts:21`) is a placeholder. There is no Tax Authority API integration, no retry policy, no failure UX, no transition from `pending` to `issued`.

Verdict: the data layer is ready. The application is not. The flag must stay off until the items in §15 land.

## 2. Schema state

File: `prisma/schema.prisma:622-680`.

### 2.1 `ReceiptDocument` fields

| Field | Type | Nullable | Default | Source |
|---|---|---|---|---|
| `id` | `String @db.Uuid` | no | `uuid()` | init |
| `type` | `ReceiptDocumentType` | no | - | init |
| `clientId` | `String @db.Uuid` | no | - | init (FK -> `clients.id`, ON DELETE RESTRICT) |
| `paymentId` | `String? @db.Uuid` | yes | null | init (no FK on this column in schema; see §2.5) |
| `documentNumber` | `Int?` | yes | null | init |
| `documentNumberYear` | `Int?` | yes | null | init |
| `status` | `ReceiptDocumentStatus` | no | `draft` | init |
| `issueDate` | `DateTime @db.Date` | no | - | init |
| `paymentDate` | `DateTime? @db.Date` | yes | null | init |
| `descriptionLines` | `Json` | no | `[]` | init |
| `amountBeforeVat` | `Int?` | yes | null | init (minor units, see §7) |
| `vatRateBasisPoints` | `Int` | no | `1800` | init (= 18.00%) |
| `vatAmount` | `Int?` | yes | null | init (minor units) |
| `totalAmount` | `Int?` | yes | null | init (minor units) |
| `paymentMethod` | `PaymentMethod?` | yes | null | init |
| `reference` | `String?` | yes | null | init |
| `currency` | `Currency` | no | `ILS` | init |
| `notes` | `String? @db.Text` | yes | null | init |
| `language` | `String` | no | `"he"` | init (free-string; not an enum, see §11) |
| `allocationNumber` | `String?` | yes | null | init |
| `allocationStatus` | `AllocationStatus` | no | `not_required` | init |
| `allocationObtainedAt` | `DateTime?` | yes | null | init |
| `finalizedAt` | `DateTime?` | yes | null | init |
| `finalizedByUserId` | `String? @db.Uuid` | yes | null | init (FK -> `users.id`, ON DELETE SET NULL) |
| `exchangeRate` | `Decimal? @db.Decimal(18,6)` | yes | null | Phase 3 (`20260524000500_receipt_extras`) |
| `creditedReceiptId` | `String? @db.Uuid` | yes | null | Phase 3 (self-FK -> `receipt_documents.id`, ON DELETE SET NULL) |
| `createdAt` / `updatedAt` | `DateTime` | no | now/auto | init |

Relations on the Prisma side (`schema.prisma:654-659`):

- `client: Client` via `clientId`.
- `finalizedBy: User?` via `finalizedByUserId`.
- `creditedReceipt: ReceiptDocument?` (the original) and `creditedBy: ReceiptDocument[]` (any credit notes pointing at this row). Self-relation named `"ReceiptCredits"`.
- `sourcePayments: Payment[]` via the back-relation on `Payment.linkedReceiptId` (named `"PaymentReceipt"`). This is one receipt -> many payments.

Indexes and unique constraints:

- `@@unique([type, documentNumberYear, documentNumber])` — the public number is unique per (type, year). Drafts (with null number/year) bypass this naturally because Postgres treats NULL as distinct.
- `@@index([clientId])`.
- `@@index([status])`.
- Phase 3 extras adds `@@index` on `creditedReceiptId` (`receipt_documents_credited_receipt_id_idx`).

### 2.2 Phase 3 additions landed?

Yes. Verified against `prisma/migrations/20260524000500_receipt_extras/migration.sql:5-19`:

- `exchange_rate DECIMAL(18,6)` column added.
- `credited_receipt_id UUID` column added.
- Self-FK on `credited_receipt_id` with `ON DELETE SET NULL ON UPDATE CASCADE`.
- Index `receipt_documents_credited_receipt_id_idx` created.

And against the Prisma side at `schema.prisma:650-657`:

- `exchangeRate Decimal? @db.Decimal(18, 6)` matches.
- `creditedReceiptId String? @db.Uuid` matches.
- Self-relation `creditedReceipt` / `creditedBy` named `"ReceiptCredits"` matches.

### 2.3 Check constraints landed?

Yes. `prisma/migrations/20260524000600_receipt_invariants/migration.sql:5-27`:

- `receipt_finalized_vat_sum_chk` — enforces, on `status = 'finalized'`, that `total_amount`, `amount_before_vat`, `vat_amount` are all non-null and `total_amount = amount_before_vat + vat_amount`.
- `receipt_finalized_exchange_rate_chk` — enforces, on `status = 'finalized'` and `currency <> 'ILS'`, that `exchange_rate IS NOT NULL`.

Both are `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT ...`, so the migration is idempotent.

What is documented in the migration but not enforced (line 29-32): "finalized -> cancelled" transition is application-only. There is no DB trigger preventing direct UPDATE of `status` from `finalized` to `cancelled`. The cancel route blocks this (see §3.2), but a raw SQL UPDATE could bypass it. Note: this trade-off was made on cost grounds in the migration comment.

### 2.4 `ReceiptDocumentSequence`

File: `prisma/schema.prisma:670-680`. Fields:

- `id String @id @default(uuid()) @db.Uuid`
- `type ReceiptDocumentType`
- `year Int`
- `nextNumber Int @default(1)`
- `updatedAt DateTime @updatedAt`
- `@@unique([type, year])` — one row per (type, year). The Prisma `where` clause uses the compound unique name `type_year`.

DB-level: `prisma/migrations/20260524000000_init/migration.sql:398-406` + unique index at line 647.

Shape confirms a per-type, per-year counter. Reservation behavior is in §6.

### 2.5 Foreign-key notes

- `Payment.linkedReceiptId` (`schema.prisma:600, 608`) is a relation to `ReceiptDocument` via the named relation `"PaymentReceipt"`. The Payment side carries the FK column (`linked_receipt_id`); on the receipt side it appears as `sourcePayments Payment[]`. The init migration line 788 defines the FK at the DB level: `payments.linked_receipt_id REFERENCES receipt_documents(id) ON DELETE SET NULL`.
- `ReceiptDocument.paymentId` is declared on the model but has no Prisma `@relation` and no DB FK. It is a soft pointer that no code reads or writes today. The schema field name overlaps with `Payment.linkedReceiptId` but they are two different relationships. The credit-note workflow copies `paymentId` from source to credit note (`lib/receipts/credit-note.ts:43`), but no other code touches it. Recommendation in §15.
- `clientId` has `ON DELETE RESTRICT`, so a client with any receipt cannot be hard-deleted. Consistent with the rest of the model.

## 3. Domain layer functions and contracts

Directory: `lib/receipts/`. Four files. All functions take a `Prisma.TransactionClient` and the caller wraps them in `prisma.$transaction()`. Every state change writes an `AuditLog` row via `writeAudit` (`lib/audit.ts:38-58`).

### 3.1 `finalizeReceipt`

File: `lib/receipts/finalize.ts:22-73`.

Signature: `(tx, { id, actorUserId }) -> Promise<ReceiptDocument>`.

Behavior:

1. Loads the row by id. Throws `ReceiptStateError("receipt not found")` if missing.
2. Throws `ReceiptStateError("must be draft")` if status is not `draft`.
3. Throws `ReceiptValidationError("vat sum mismatch")` if any of `totalAmount`, `amountBeforeVat`, `vatAmount` is null or arithmetic fails.
4. Throws `ReceiptValidationError("exchange rate required")` if currency is non-ILS and `exchangeRate` is null.
5. Calls `reserveNumber(tx, type)` (private, lines 84-100) to obtain `(year, nextNumber)`.
6. Updates the row: `status -> "finalized"`, `documentNumber`, `documentNumberYear`, `finalizedAt = new Date()`, `finalizedByUserId = actorUserId`.
7. Writes `AuditLog` with action `receipt.finalized`, `entityType "ReceiptDocument"`, and a diff for `status`, `documentNumber`, `documentNumberYear`.

What it does NOT do:

- It does not request an allocation number. The route does not chain into `requestAllocationNumber`.
- It does not write `Payment.linkedReceiptId` back if `paymentId` is set.
- It does not validate or normalize `descriptionLines` JSON.
- It does not compute or override `vatRateBasisPoints` from `CompanySettings`. The caller of the missing create endpoint will need to set it.
- It does not store the snapshot of company header (`legalNameHe`, `vatNumber`, `address`) at finalize time. If `CompanySettings` is later edited, an old finalized receipt rendered through `getCompanyForReceipts` would show the new values. This is wrong for tax documents (see §11).

Audit action verified in tests: `tests/unit/receipts-finalize-validation.test.ts:133`.

### 3.2 `cancelReceipt`

File: `lib/receipts/cancel.ts:18-51`.

Signature: `(tx, { id, actorUserId, reason? }) -> Promise<ReceiptDocument>`.

Behavior:

- `finalized` -> throws `ReceiptStateError("cannot cancel finalized; issue a credit note instead")`.
- `cancelled` -> idempotent no-op; returns the row unchanged, does not audit.
- `draft` -> updates `status = "cancelled"`, writes audit `receipt.cancelled` with `{ status: { old, new: "cancelled" } }` and optionally `{ reason }`.

Audit row verified in `tests/integration/receipts-cancel-finalized.test.ts:68-74`.

Note: the idempotent no-op on `cancelled` skips audit on purpose, which is consistent with treating it as a non-event. If the operator hits "cancel" twice, only the first writes an audit row.

### 3.3 `issueCreditNote`

File: `lib/receipts/credit-note.ts:19-63`.

Signature: `(tx, { sourceReceiptId, actorUserId }) -> Promise<ReceiptDocument>`.

Behavior:

1. Loads the source. Throws `ReceiptStateError("source receipt not found")` if missing.
2. Throws `ReceiptStateError("can only credit-note a finalized receipt")` if source is not finalized.
3. Creates a new row of type `credit_note` in status `draft` with:
   - `clientId`, `paymentId`, `descriptionLines`, `vatRateBasisPoints`, `currency`, `language` copied from source.
   - `amountBeforeVat`, `vatAmount`, `totalAmount` negated (`null` stays `null`).
   - `creditedReceiptId = source.id`.
   - `issueDate = new Date()` (today, in server timezone — see §11 concern about date handling).
4. Writes audit `receipt.credit_note_issued` with `{ sourceReceiptId: { old: null, new: source.id } }`.

What it does NOT do:

- Does not auto-finalize the credit note. The credit-note row is created as a draft; the operator must call `POST /api/receipts/[id]/finalize` separately to assign it a `credit_note`-series number.
- Does not copy `exchangeRate` from the source. A non-ILS credit note will fail finalization unless the operator sets an exchange rate. This is a latent gap; the test does not cover non-ILS credit notes.
- Does not copy `paymentMethod`, `reference`, `notes`, `issueDate`, `paymentDate`, or `vatRateBasisPoints` consistently. `vatRateBasisPoints` is copied (line 43) but the others are not. This is intentional for `notes` and `reference` (they describe the original transaction), but `paymentMethod` should arguably be carried forward; flagged in §15.
- Does not check that the source has not already been credit-noted. A finalized receipt can be credit-noted multiple times, which would over-refund the client. The route does not block this. The schema does not either (no unique constraint). Recommendation in §15.

### 3.4 `requestAllocationNumber`

File: `lib/receipts/allocation.ts:36-77`.

Signature: `(tx, { receiptId, actorUserId }) -> Promise<{ status: AllocationStatus; allocationNumber?: string }>`.

Behavior:

1. Loads `{ id, currency, totalAmount, allocationStatus }`. Throws `ReceiptStateError("receipt not found")` if missing.
2. Computes `needsAllocation = currency === "ILS" && total >= THRESHOLD_ILS_MINOR` where `THRESHOLD_ILS_MINOR = 2_500_000` (25,000 ILS, declared at line 21).
3. If not needed, returns `{ status: "not_required" }`. Does not touch the row. Does not audit.
4. If needed, updates `allocationStatus -> "pending"` and writes audit `receipt.allocation_requested` with `{ allocationStatus: { old, new: "pending" } }`. Returns `{ status: "pending" }`.

No real Tax Authority API call. No retry. No transition to `issued` or `failed`. No store of an `allocationNumber`. The function is honest about being a stub (header comment lines 22-35).

### 3.5 Errors

File: `lib/receipts/errors.ts:7-19`.

Two error classes:

- `ReceiptValidationError` -> mapped to 400 by routes (vat math, missing exchange rate).
- `ReceiptStateError` -> mapped to 422 by routes (wrong state), or 404 if the message is `"receipt not found"` / `"source receipt not found"`.

The route-level mapping is uniform across the four endpoints (e.g. `app/api/receipts/[id]/finalize/route.ts:42-49`). The error message is the load-bearing key for "not found" detection, which is brittle. Recommendation in §15.

## 4. API surface

All four routes live under `app/api/receipts/[id]/`. All four require `requireAuth` + `isAdmin`. All four read the `receipt_finalize_enabled` feature flag and return 503 if false.

| Method | Path | Auth | Flag | Body | Success | Notable errors |
|---|---|---|---|---|---|---|
| POST | `/api/receipts/[id]/finalize` | admin | `receipt_finalize_enabled` | none | 200 + row | 400 validation, 404 not found, 422 wrong state, 503 flag off |
| POST | `/api/receipts/[id]/cancel` | admin | `receipt_finalize_enabled` | `{ reason?: string<=500 }` | 200 + row | 400 zod, 404 not found, 422 finalized, 503 flag off |
| POST | `/api/receipts/[id]/credit-note` | admin | `receipt_finalize_enabled` | none | 201 + draft credit note | 404 source not found, 422 not finalized, 503 flag off |
| POST | `/api/receipts/[id]/allocation` | admin | `receipt_finalize_enabled` | none | 200 + `{status, allocationNumber?}` | 404 not found, 503 flag off |

Source files:

- `app/api/receipts/[id]/finalize/route.ts:22-50`.
- `app/api/receipts/[id]/cancel/route.ts:26-61`.
- `app/api/receipts/[id]/credit-note/route.ts:18-48`.
- `app/api/receipts/[id]/allocation/route.ts:18-48`.

### 4.1 Missing endpoints

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/api/receipts` | list (filter by client, status, type, date range) | missing |
| POST | `/api/receipts` | create a draft | missing |
| GET | `/api/receipts/[id]` | fetch one (for UI render or download) | missing |
| PATCH | `/api/receipts/[id]` | edit a draft (line items, dates, vat rate, etc.) | missing |
| DELETE | `/api/receipts/[id]` | delete a draft | missing (use cancel instead?) |
| GET | `/api/receipts/[id]/pdf` | render PDF | missing |
| GET | `/api/receipts/[id]/audit` | per-receipt audit timeline | missing (general `AuditLog` query exists) |
| POST | `/api/receipts/from-payment/[paymentId]` | seed a draft from a paid payment | missing |

These eight gaps block any human-driven workflow. Until `POST /api/receipts` exists, no one can put a row into the table for the finalize endpoint to act on. Today the only path to a row is direct SQL or a seed insert.

### 4.2 Why the flag-off check is on every mutation

All four routes gate on `receipt_finalize_enabled`. This is conservative. Cancel and credit-note semantically might want to remain reachable even when finalize is locked (you would still want to be able to cancel an erroneous draft). However, since the only way to get a draft in the first place is via missing endpoints, the conservative gate is acceptable. When `POST /api/receipts` lands the flag scope may need to split (draft-CRUD vs finalize), or you accept that the whole module is one switch.

## 5. UI surface and gaps

### 5.1 `/receipts` page

File: `app/(portal)/receipts/page.tsx`.

A static, server-rendered placeholder:

- Lines 1-11: auth and admin redirect.
- Lines 22-29: amber "Compliance hold" banner explaining the flag.
- Lines 31-43: dashed empty-state describing the six document types.

No table. No filters. No "New receipt" button. No drafts list. No link to any draft. The page is honest, but it is unusable.

### 5.2 Client billing tab "Receipts" sub-tab

The client detail page (`app/(portal)/clients/[id]/page.tsx`) has a "Receipts" tab at line 38. The body is `ReceiptsPlaceholder` (lines 321-333), a small dashed card saying "Phase 7" with no data.

### 5.3 `MarkPaidSheet` handoff

File: `components/billing/MarkPaidSheet.tsx`.

When an operator marks a payment as paid, the sheet displays an info box (lines 171-177) with i18n key `billing.receiptDocumentBody`. The English copy (`lib/i18n/en.json:289`) reads:

> "After saving, you can create a receipt or tax invoice for this payment in Phase 7. Receipt generation is not yet enabled."

There is no actual call to a receipts endpoint. No POST. No follow-up draft. The Payment row is updated through `PATCH /api/billing/payments/[id]` (line 82) and that is the end.

### 5.4 Sidebar

`components/layout/Sidebar.tsx:67` exposes `/receipts` as admin-only with the `Receipt` icon. The link works (the page loads) but lands on the placeholder.

### 5.5 What is missing for a working flow

For the pilot operator to issue real receipts, the UI needs:

1. List page (`/receipts`) with filters (client, type, status, date range, currency) and a "New receipt" button.
2. Draft-create form with: client picker (with autocomplete by company name), type radio, descriptionLines editor (description, quantity, unit_price, subtotal), currency, vat rate (default from `CompanySettings.defaultVatBasisPoints`), exchange-rate field (visible only when currency != ILS), payment date, payment method, reference, notes, language toggle (he/en).
3. Auto-calculation of `vatAmount` and `totalAmount` from line items and rate (UI-side); validation on submit.
4. Draft detail page (`/receipts/[id]`) showing the full row, status, audit history.
5. Edit form for drafts.
6. PDF preview panel (live render).
7. Finalize button (only visible for drafts in valid state; calls `POST /api/receipts/[id]/finalize`).
8. Cancel button (drafts only, with confirm and optional reason).
9. Credit-note action (finalized only, with confirm).
10. Allocation status indicator + manual retry button (when implementation lands).
11. Download PDF button.
12. Email-to-client button (out of scope for MVP per spec, but the surface is needed for handoff).
13. "Create receipt from this payment" link in `MarkPaidSheet` or the payment row; today the info box must be replaced with a real button.

Each of these maps onto missing API endpoints in §4.1.

## 6. Numbering workflow

### 6.1 Reservation

File: `lib/receipts/finalize.ts:84-100`.

```
const seq = await tx.receiptDocumentSequence.upsert({
  where: { type_year: { type, year } },
  create: { type, year, nextNumber: 2 },
  update: { nextNumber: { increment: 1 } },
});
const issued = seq.nextNumber - 1;
```

The upsert either creates the row with `nextNumber = 2` (and issues `1`) or atomically increments the existing row by one (and issues `nextNumber - 1`). The header comment on the function (lines 75-83) asserts that the row lock from the increment is sufficient under READ COMMITTED to prevent two parallel finalizes from issuing the same number. The transaction wraps both the sequence advance and the receipt UPDATE.

This is correct in principle. The `update: { nextNumber: { increment: 1 } }` translates to a single SQL `UPDATE ... SET next_number = next_number + 1`, which Postgres serializes per row. The surrounding transaction holds the row lock until commit, so a parallel finalize will block on the same row.

What is missing:

- No `SELECT ... FOR UPDATE` is explicit. The Prisma docs imply the increment is atomic, but a defensive test that runs two parallel finalizes against the same `(type, year)` is missing. The `tests/unit/receipts-finalize-validation.test.ts:89-135` "reserves a number and updates the row" test is a single-call mock; it does not assert concurrency safety.
- The database audit (`docs/audit-2026-05/database_audit.md` line 620) recommends `SELECT ... FOR UPDATE` explicitly. The current implementation relies on the upsert-increment idiom, which is acceptable but should have an integration test against a real Postgres to demonstrate gap-free behavior under contention.

### 6.2 Per-year, per-type counter

Unique constraint on `(type, year)` in `ReceiptDocumentSequence` (`schema.prisma:678`) plus the composite unique on `(type, documentNumberYear, documentNumber)` in `ReceiptDocument` (line 664) give two layers of protection. A duplicate number across two finalizes would fail at the second one with a unique-violation, and the transaction would roll back (no sequence gap).

### 6.3 Year rollover

`year = new Date().getFullYear()` (line 88). Uses the server's local time. The server timezone is `Asia/Jerusalem` per `CompanySettings.timezone` default (`schema.prisma:903`) but `process.env.TZ` is not pinned in this codebase. If the host runs UTC and finalize is called at 01:30 IST on Jan 1, the row will be filed under the previous year. Recommendation in §15: pin the timezone explicitly (`getYearInTz("Asia/Jerusalem", new Date())`) or store the timestamp and compute year from it via a SQL function.

### 6.4 Behavior on cancellation

A cancelled draft has `documentNumber = null` and `documentNumberYear = null` (drafts never had a number). The sequence was not advanced. There is no gap.

A finalized receipt cannot be cancelled (the cancel route blocks it with 422). So a finalized number can never be "released back into the pool". Correct per tax-authority rules: numbers must be gap-free.

A finalized receipt that needs to be voided must be credit-noted. The credit note is a separate type with its own sequence (`credit_note`), so the original number stays on the books and the credit note gets a fresh `credit_note`-series number.

### 6.5 Behavior on finalize failure mid-transaction

The reservation and the row update are in one transaction. If the row update fails (constraint violation, DB error), the transaction rolls back, including the sequence increment. The next attempt would re-acquire the same number. Correct.

If the audit insert fails (last step of `finalizeReceipt`), the whole transaction rolls back too. No partial state.

### 6.6 Seed for sequences

Checked `prisma/seed.ts` — it does not create any `ReceiptDocumentSequence` rows. Not required (the upsert in `reserveNumber` creates the row on first finalize), but if a tax authority audit ever requires a starting number other than 1, this seed will need to set it. Flag for the accountant.

## 7. VAT math and invariants

### 7.1 Units

Money is stored as `Int` minor units (agorot for ILS, cents for USD/EUR). No `Decimal`. No domain wrapper. This is a project-wide pattern called out in `docs/audit-2026-05/database_audit.md:20`. It is acceptable for receipts as long as the UI computes `amount * vat / 10000` carefully and the math is enforced by the application before the DB check constraint sees it. The current code path (only `finalizeReceipt`) does the integer comparison correctly.

### 7.2 Where the VAT default comes from

`vatRateBasisPoints` defaults to `1800` (= 18.00%) at the DB level (`schema.prisma:634`). When `POST /api/receipts` is built, it should pull `CompanySettings.defaultVatBasisPoints` (`schema.prisma:905`) rather than relying on the schema default, so that the company can configure its rate without a migration.

Phase 3 §5.2 shipped the `CompanySettings.defaultVatBasisPoints` column (default 1800). The receipts code does not read it yet, because there is no create path.

### 7.3 Where the math is enforced

- Application layer: `lib/receipts/finalize.ts:34-41` checks the sum before issuing.
- DB layer: `receipt_finalized_vat_sum_chk` (`migrations/20260524000600_receipt_invariants/migration.sql:9-16`) checks the sum on UPDATE/INSERT for finalized rows.

The check runs only on `status = 'finalized'`. Drafts can be in flux. This is correct for an editor flow.

There is no per-line-item validation. `descriptionLines` is `Json @default("[]")` with no schema validation. The auditor in §9.6 of `database_audit.md` recommends a Zod schema for line items at write time; that recommendation still stands and should be implemented when `POST /api/receipts` lands.

### 7.4 What the math invariant does not catch

- A line item with negative subtotal but a positive total: not blocked at the schema level. A credit note legitimately has negative values; the math invariant accepts that (negative + negative = negative, consistent).
- A finalized receipt where line items do not sum to `amountBeforeVat`: nothing checks this. The line items are a free JSON blob. The DB only enforces the `before_vat + vat = total` relation.
- A `vatRateBasisPoints` that does not match `vatAmount / amountBeforeVat`: nothing checks this. A receipt with `amountBeforeVat = 10000`, `vatRateBasisPoints = 1800`, `vatAmount = 500` would pass the sum check (10000 + 500 = 10500) but the rate is wrong. The application layer should enforce `vatAmount = round(amountBeforeVat * vatRateBasisPoints / 10000)` with a tolerance for rounding, but no such check exists.

## 8. Currency / FX handling

### 8.1 Field

`currency Currency @default(ILS)` (`schema.prisma:639`). Enum has `ILS`, `USD`, `EUR` (lines 170-174). Adding a new currency requires a migration.

### 8.2 Exchange rate

`exchangeRate Decimal? @db.Decimal(18, 6)` (line 650). Phase 3 addition. Required at finalize time for non-ILS rows by both the application (`finalize.ts:43-45`) and the DB check constraint.

### 8.3 Who writes the rate

Today, only `lib/receipts/credit-note.ts` does not copy it (gap noted in §3.3). The application has no auto-fetch from Bank of Israel or any FX provider. The operator must enter the rate. When `PATCH /api/receipts/[id]` is built, it must accept this field.

The decimal precision `(18, 6)` is generous (1.234567 -> 6 decimal digits, up to 12 integer digits). Should be more than enough for any realistic ILS-USD or ILS-EUR rate.

### 8.4 Display rules

Not implemented. The Israeli tax authority requires foreign-currency invoices to display both the foreign amount and the ILS equivalent at the recorded rate. The schema supports this (you have `currency`, `totalAmount` in minor units of `currency`, and `exchangeRate`), but there is no template that renders both. The PDF work (see §11) will need to compute `totalAmount * exchangeRate` in ILS and display it alongside.

## 9. Credit note workflow

### 9.1 Path

1. Operator finds a finalized receipt that needs reversing.
2. Calls `POST /api/receipts/[id]/credit-note` (no body).
3. Server runs `issueCreditNote(tx, { sourceReceiptId: id, actorUserId })` (`lib/receipts/credit-note.ts:19-63`).
4. A new row is created with `type = "credit_note"`, `status = "draft"`, `creditedReceiptId = source.id`, negated totals.
5. Audit `receipt.credit_note_issued` is written.
6. Operator must then call `POST /api/receipts/[id]/finalize` on the new credit-note row to assign it a `credit_note`-series number.

### 9.2 Negation correctness

`negate(n) = n === null ? null : -n` (line 33). Applied to `amountBeforeVat`, `vatAmount`, `totalAmount`. The DB check constraint accepts negative values because the math invariant is `total = before + vat`, which holds for `-100 = -90 + -10`.

### 9.3 Original document linkage

The source receipt stays in the DB unchanged (still `finalized`). The credit note has `creditedReceiptId = source.id`. The reverse relation `creditedBy: ReceiptDocument[]` lets you query "what credit notes were issued against this receipt". Index on `credited_receipt_id` supports this query.

### 9.4 Gaps

- No guard against double credit-noting (a finalized receipt can be credit-noted N times, resulting in -N x original on the books).
- No copy of `exchangeRate` for non-ILS source receipts; the new credit-note row will fail finalize until the operator sets one. Test does not cover this.
- The new row's `issueDate` is `new Date()` (today, server time), not `source.issueDate`. Correct for tax-authority purposes (a credit note is issued today, not retroactively), but worth documenting because the UI should display today's date on the new row.
- The new row does not copy `paymentMethod`, `reference`, `notes` from the source. Acceptable; the credit note is a different transaction. But the UI should pre-fill `notes` with "Credit note against #[source-number]" or similar for clarity.

## 10. Allocation number stub state

### 10.1 Current behavior

`lib/receipts/allocation.ts`:

- Threshold: `THRESHOLD_ILS_MINOR = 2_500_000` (25,000 ILS, line 21). Header comment is honest: "placeholder until the accountant confirms the exact threshold."
- Logic: ILS only, totals at or above threshold get `allocationStatus = "pending"` and audit. Everything else returns `not_required` and writes nothing.
- The row never transitions to `issued` or `failed`. No `allocationNumber` is ever written.
- No retry, no idempotency key, no timeout, no external HTTP call, no error UX.

### 10.2 Threshold authoritativeness

The 25,000 ILS placeholder is plausibly close to the real Israeli Tax Authority threshold for invoice allocation numbers (the rule rolled out in 2024 with a phased threshold starting at 25,000 NIS and ramping down each year). However:

- The real threshold has been declining year over year per Tax Authority guidance. By 2026 it may be lower (10,000 or 5,000 NIS).
- The Tax Authority rule applies only to `tax_invoice` and `tax_invoice_receipt` types. The current code checks `currency === "ILS" && total >= threshold` regardless of receipt type, so it would mark a regular `receipt` or an `invoice` as needing allocation. This is over-broad.

This audit cannot resolve the authoritative threshold; the accountant must confirm. The Israel-compliance auditor agent owns this.

### 10.3 Missing pieces

| Item | Status | Why it matters |
|---|---|---|
| Real Tax Authority API client | Missing | Without it, `pending` rows never resolve |
| Type-aware threshold (tax invoices only) | Missing | Over-broad pending markings annoy operators |
| Annual threshold table | Missing | Threshold changes year over year |
| Retry policy | Missing | Tax Authority API has known downtime |
| Idempotency key per receipt | Missing | Retries can issue duplicate allocations |
| Error UX (operator sees what failed and why) | Missing | Today the row silently stays `pending` |
| Audit row on transition to `issued` and `failed` | Missing | Compliance trail incomplete |
| Stored credential management | Missing | Tax Authority API requires certificate-based auth |
| Background worker (queue + retry) | Missing | Must not block finalize on a flaky upstream |
| Test against a sandbox endpoint | Missing | Cannot validate the integration without one |

The current `requestAllocationNumber` is a state-marking helper. To call this implementation "complete enough to ship", every row in the table above needs to land.

## 11. PDF / template work needed

No PDF rendering today. No template engine. No Hebrew font loaded. No `lib/receipts/pdf.ts` or similar.

`package.json` includes `playwright` (for E2E) but not any PDF library. No `puppeteer`, `pdf-lib`, `pdfkit`, `@react-pdf/renderer`, `html-pdf`.

`CompanySettings` has `receiptFooterEn` and `receiptFooterHe` (`schema.prisma:915-916`) and `getCompanyForReceipts` (`lib/company-settings/queries.ts:119-153`) exists to load all the header fields a template would need (`legalNameEn`, `legalNameHe`, `vatNumber`, address, footers). The helper has zero callers today (verified with grep).

### 11.1 What the implementation needs

| Item | Notes |
|---|---|
| Template engine (HTML -> PDF) | Headless Chromium via `puppeteer` is the typical choice. Alternative: `@react-pdf/renderer` for React-component templates. Either way, ship a single binary path so the server can render without a per-request browser launch. |
| Hebrew RTL rendering | The HTML root needs `dir="rtl"` when `language === "he"`. Tailwind has logical-property utilities; existing pages use them (e.g. `TagManagementSection.tsx:163` uses `dir="rtl"`). The PDF template must extend this. |
| Embedded Hebrew font | System fonts on the server cannot be assumed to include Hebrew glyphs. Bundle a WOFF/TTF (e.g. Heebo, Rubik, or the official David CLM) and include it in the template. Without this, `headless` Chromium may render boxes for Hebrew characters depending on the base image. |
| Bilingual receipts | Some clients want both Hebrew and English on the same document. The template needs a two-column or section-switched layout. `language` is currently a single-string column; if bilingual rendering is needed, either add a second language column or accept `language = "both"`. |
| Company header from `CompanySettings` | Read via `getCompanyForReceipts`. But: see snapshot concern below. |
| Snapshot at finalize time | The current schema does not snapshot company header. If `CompanySettings` is later edited, a finalized receipt re-rendered six months later will show different values. For tax documents this is wrong. Add `companyHeaderJson Json?` to `ReceiptDocument` and write it at finalize time, or render the PDF once at finalize and store the bytes. |
| Line item table | Render `descriptionLines` JSON. Today there is no schema for the JSON; the template must defensively parse `{description, quantity?, unit_price?, subtotal}` shapes. Validate the shape at write time first. |
| VAT breakdown | Display `vatRateBasisPoints` as a percentage with two decimal places, `vatAmount` in formatted currency, `totalAmount` in formatted currency. For non-ILS receipts, also display `exchangeRate` and the ILS equivalent. |
| Document number | Format as `{type-prefix}-{year}-{seq}` (e.g. `INV-2026-00012`). Type-prefix mapping must be confirmed with the accountant. |
| Signature placeholder | The spec mentions a digital signature line; not implemented. At minimum, leave a "signed by" line with `finalizedBy.displayName` and `finalizedAt` formatted in `Asia/Jerusalem`. |
| Footer | Render `receiptFooterHe` or `receiptFooterEn` based on `language`. |
| Page numbering | Long invoices may span pages. The PDF engine needs page-break-friendly CSS for the line-item table. |
| Allocation number on the document | When `allocationStatus = "issued"` and `allocationNumber` is set, the PDF must display "מספר הקצאה: {allocationNumber}". Per tax-authority rules, this is mandatory above the threshold. |
| Cancelled or credit-noted marker | A finalized-then-credit-noted receipt should display a watermark or footer line linking to the credit note (or vice versa). |
| Storage of generated PDFs | Decide: re-render on every download (deterministic if inputs are snapshotted), or render once at finalize and store the bytes in S3 (Phase 3 §5.3 added the S3 attachment infrastructure, but no receipt code wires into it). Storing the bytes is the safer audit posture. |
| Download endpoint | `GET /api/receipts/[id]/pdf` returns the bytes with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="..."`. Stream from S3 if stored. |

### 11.2 Effort estimate

This is the largest single chunk of unstarted work in the module. A reasonable rough budget is 2-3 engineer weeks for a single document type (likely starting with `tax_invoice_receipt` since that is what most Israeli SMBs issue), and another 1-2 weeks per additional type to test the template variations.

## 12. Permissions and audit

### 12.1 Permissions

All four routes call `requireAuth()` then `isAdmin(auth.user)` and return 403 if false. Source: each route file at the top, e.g. `app/api/receipts/[id]/finalize/route.ts:23-25`.

`isAdmin` is the `SessionUser.isAdmin` boolean (`lib/permissions.ts:14-16`), which the auth layer derives from the user's role. No finer-grained role exists for receipts (no separate "accountant" or "billing-admin" role). All admins can finalize and cancel.

The `/receipts` page also redirects non-admins to `/dashboard` (`app/(portal)/receipts/page.tsx:11`), and the sidebar entry is `adminOnly: true` (`components/layout/Sidebar.tsx:67`). Layered correctly.

The feature flag is a separate gate from the role check. Both must pass.

### 12.2 Audit rows

Every state transition that mutates a row writes an `AuditLog` row via `writeAudit`. Verified actions:

| Action | Entity | Source |
|---|---|---|
| `receipt.finalized` | `ReceiptDocument` | `lib/receipts/finalize.ts:60-70` |
| `receipt.cancelled` | `ReceiptDocument` | `lib/receipts/cancel.ts:39-48` |
| `receipt.credit_note_issued` | `ReceiptDocument` | `lib/receipts/credit-note.ts:52-60` |
| `receipt.allocation_requested` | `ReceiptDocument` | `lib/receipts/allocation.ts:66-74` |

What is missing:

- No `receipt.draft_created` audit (because there is no create endpoint).
- No `receipt.draft_updated` audit (no patch endpoint).
- No `receipt.allocation_received` or `receipt.allocation_failed` audit (no upstream callback handler).
- The `cancel` no-op on an already-cancelled row does not audit, which is fine.

The audit `entityType` is `ReceiptDocument` consistently, which matches the Prisma model name and makes per-entity queries simple (`prisma.auditLog.findMany({ where: { entityType: 'ReceiptDocument', entityId } })`).

The audit `diff` shape `{ field: { old, new } }` is consistent with other audits in the codebase (e.g. `lib/billing/payments.ts`-style updates).

## 13. Feature flag posture

### 13.1 The flag

Key: `receipt_finalize_enabled`. Default `false` (`prisma/fixtures/feature-flags.json:3-5`). Description: "Allow finalizing receipt/tax documents. MUST remain false until accountant verifies templates, VAT rate, numbering, and any Tax Authority requirements."

The description is exactly the right framing for the gate.

### 13.2 Where it is enforced

All four mutating routes (§4). 503 is returned with body `{ error: "Receipts finalization is disabled" }` when off.

The flag is read via `getFeatureFlag` (`lib/feature-flags.ts:4-10`), which is a per-call DB read. Acceptable for a low-traffic admin path; if the receipts UI ever reads it on every render, an in-memory cache would help. Not a current concern.

### 13.3 UI gating

`FeatureFlagSection.tsx:25, 34-37, 108-143` has a special-case `RECEIPT_FLAG` constant and a Radix confirmation dialog with title "Enable receipt finalization?" and body warning about accountant sign-off. The dialog is the only flag in the admin section that requires a confirm-click before enabling. Correct safety measure.

There is no UI surface that reads the flag to gate buttons on the (still-placeholder) `/receipts` page. When real UI lands, every action button (finalize, cancel, credit-note, allocation) needs a client-side flag check too so the button is hidden / disabled when the flag is off; otherwise users will click and get a 503.

### 13.4 Other receipt-related flags

None. Searched `prisma/fixtures/feature-flags.json` — only `receipt_finalize_enabled` is receipt-specific. The seed file has 16 flags total covering Phases 2 and 3 modules; no others reference receipts. There is no separate `receipt_draft_create_enabled` or `receipt_pdf_enabled` flag. If finalization needs a finer-grained rollout (drafts public, finalization gated), an additional flag will be needed.

## 14. Test coverage gaps

### 14.1 Inventory

Unit tests (`tests/unit/`):

- `receipts-finalize-validation.test.ts` — 5 cases: vat sum mismatch, non-ILS without rate, wrong state, happy path ILS, happy path USD with rate.
- `receipts-allocation-threshold.test.ts` — 3 cases: below threshold, non-ILS above threshold, ILS at threshold.

Integration tests (`tests/integration/`):

- `receipts-cancel-finalized.test.ts` — 2 cases: 422 on finalized, 200 on draft.
- `receipts-credit-note.test.ts` — 2 cases: happy path negation+audit, 422 on non-finalized source.
- `receipts-finalize-flag-off.test.ts` — 3 cases: 403 employee (flag never read), 503 admin flag off, 200 admin flag on (happy path with mocked sequence).

All tests use mocked Prisma (`tests/helpers/prisma.ts:56-57`); none run against a real Postgres.

### 14.2 Coverage gaps

| Gap | Why it matters |
|---|---|
| No real-Postgres test of the sequence under concurrent finalize | The "no gap" property is the entire reason to use a sequence row; needs a real concurrency test (two parallel `$transaction` calls, expect distinct numbers, no duplicate, no gap). |
| No test of the DB check constraints | The `receipt_finalized_vat_sum_chk` and `receipt_finalized_exchange_rate_chk` are unverified end-to-end; only the application-layer pre-check is tested. A test that bypasses the application (raw `prisma.receiptDocument.update`) and asserts the constraint fires would prove the second layer of defense. |
| No test of year rollover | What happens at Jan 1 00:00 IST? What if the server is UTC? |
| No PDF render test | (No PDF code exists yet.) |
| No allocation real-API test | (No real API exists yet.) |
| No test of credit-noting a non-ILS receipt | Latent bug: `issueCreditNote` does not copy `exchangeRate`, so the new credit-note draft cannot be finalized without operator intervention. |
| No test of double credit-noting | A finalized receipt can be credit-noted N times; no business rule blocks this. |
| No test for "cancelled is idempotent" | Implementation supports it but no test asserts the no-op semantics. |
| No test of GET list / GET one (endpoints do not exist) | When they ship, contract tests should cover filtering, admin gating, and 503 behavior. |
| No test of "allocation requested before finalize" sequence | If a row's `totalAmount` is null (still a draft), the allocation helper coerces to 0 (line 53), so it returns `not_required`. Not necessarily wrong, but undertested. |

### 14.3 e2e / Playwright

No e2e test for `/receipts`. The page is a static placeholder so this is acceptable; flag for the moment real UI lands.

## 15. Recommendations

### High

1. **Build `POST /api/receipts` and `GET /api/receipts` / `GET /api/receipts/[id]`** with admin gating and feature-flag awareness. Without these the module is unusable; the four existing mutating endpoints have no way to receive a row to act on. Add Zod validation for the body, particularly for `descriptionLines` shape (`{description, quantity?, unitPrice?, subtotal}`). Use `CompanySettings.defaultVatBasisPoints` as the default `vatRateBasisPoints` if the caller does not supply it.
2. **Wire the admin Company Settings tab** to `CompanySettingsForm.tsx` (which already exists) and the `/api/admin/company-settings` endpoint. Today the tab at `app/(portal)/admin/page.tsx:483-525` is a disabled-input placeholder while the form is orphaned. Receipt headers cannot be rendered until the operator can save `legalNameHe`, `vatNumber`, address, and footer text.
3. **Implement the PDF render pipeline** (§11). This is the largest single piece. Decide between Puppeteer / `@react-pdf/renderer`. Bundle a Hebrew font. Snapshot the company header into the receipt at finalize time. Store rendered bytes in S3 (using the Phase 3 §5.3 attachment infra). Add `GET /api/receipts/[id]/pdf`.
4. **Resolve allocation-number policy with the accountant** and implement the real Tax Authority API client (§10). Type-scope the threshold (tax invoices only). Background worker. Retry. Audit on transition.
5. **Snapshot company header into the receipt row** to prevent retroactive edits to `CompanySettings` from changing the appearance of old tax documents. Add `companyHeaderJson Json?` (nullable on drafts; required on finalize via check constraint or app guard).
6. **Block double credit-noting** unless explicitly intended. Add either a unique partial index on `creditedReceiptId WHERE type = 'credit_note'` or an application guard in `issueCreditNote` that throws if any credit note already exists for the source. Confirm policy with the accountant first.
7. **Copy `exchangeRate` from source to credit note** in `issueCreditNote` (or fail loudly if the source has none). Today a non-ILS credit-note draft will fail finalize and the operator must hand-edit.
8. **Snapshot `vatRateBasisPoints` enforcement.** Add an application check that `vatAmount == round(amountBeforeVat * vatRateBasisPoints / 10000)` (with a 1-agora tolerance) at finalize. The current DB check covers the sum but not the rate consistency.

### Medium

9. **Add a real-Postgres integration test for sequence concurrency.** Two parallel `$transaction` calls against `finalizeReceipt` on the same `(type, year)`; assert distinct numbers, no duplicate, no gap, both succeed. Without this test, the gap-free invariant is documented but unverified.
10. **Pin the year-resolution timezone** in `reserveNumber`. Currently uses `new Date().getFullYear()` which depends on the server's `TZ`. Compute via `Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(new Date())`.
11. **Add `descriptionLines` JSON schema validation** at the create/patch endpoint. Today the column accepts any JSON. Use Zod with `z.array(z.object({ description: z.string().min(1), quantity: z.number().int().positive().optional(), unitPrice: z.number().int().optional(), subtotal: z.number().int() }))`.
12. **Add a UI flag-aware action panel** on `/receipts` that hides all action buttons (finalize, cancel, credit-note, allocation) when the flag is off. Today there is no UI to hide, but when the list page lands this needs to be designed in.
13. **Replace the static info box in `MarkPaidSheet`** with a "Create receipt from this payment" button once `POST /api/receipts/from-payment/[paymentId]` exists. Today the box says "Phase 7" with no link.
14. **Refactor the "not found" detection** in the route layer. Today the route compares `err.message === "receipt not found"` (`app/api/receipts/[id]/finalize/route.ts:45`). Brittle. Introduce a `ReceiptNotFoundError extends ReceiptStateError` subclass and switch on `instanceof`.
15. **Build a per-receipt audit timeline endpoint.** Operators will want to see "draft created by X, edited by Y, finalized by Z, credit-noted by W" on the receipt detail page. The data is in `AuditLog`; needs an endpoint or server-component loader.
16. **Add a `Payment.linkedReceiptId` writer** somewhere — most naturally inside the (missing) `POST /api/receipts` endpoint or `from-payment` endpoint. Today the FK column is dormant.
17. **Decide on the `paymentId` column's fate.** `ReceiptDocument.paymentId` has no FK and no readers. Either remove it (and rely on the reverse `Payment.linkedReceiptId`), or wire it up as a real FK. Today it is dead weight that the credit-note code copies blindly.

### Low

18. **Add a `language` enum** (`he`, `en`, `bilingual`) instead of a free-string column. The schema declares `language String @default("he")` (`schema.prisma:641`); a typo today is silent.
19. **Add an annual threshold table or constant map** for the allocation threshold. Hardcoding 25,000 will silently go stale.
20. **Seed `ReceiptDocumentSequence`** in `prisma/seed.ts` if the accountant requires non-1 starting numbers (e.g. continuing an existing series imported from prior software). Not needed today.
21. **Document the receipt number format** (e.g. `INV-2026-00012`) somewhere centralized. The format will drive PDF rendering, payment reconciliation, and any export to bookkeeping software.
22. **Add an e2e smoke test** of the receipts placeholder page to catch regressions when real UI replaces it.

---

## Handoff to PM

### Top 3 risks (block the flag flip)

1. **No way to put a row into the table.** There is no `POST /api/receipts` and no UI form. The four existing endpoints (finalize, cancel, credit-note, allocation) cannot act on data that does not exist. Until this is built, the module is unreachable from the human side.
2. **No PDF render.** Even if a row could be created and finalized, there is no document to hand to the client or the tax authority. No template engine, no Hebrew font, no `GET /api/receipts/[id]/pdf`. This is the largest single chunk of unstarted work.
3. **Allocation-number flow is a state-marking stub.** Above the placeholder 25,000 ILS threshold (which is not accountant-confirmed and which is applied to all types, not just tax invoices), the row gets `pending` and never resolves. There is no Tax Authority API integration. Issuing a tax invoice above the real threshold without a real allocation number is non-compliant.

### Top 3 must-build pieces before the flag can be flipped on

1. **End-to-end draft workflow**: `POST /api/receipts` (with Zod validation of `descriptionLines`), `GET /api/receipts` / `GET /api/receipts/[id]`, `PATCH /api/receipts/[id]`, plus the `/receipts` list and `/receipts/[id]` detail pages and a draft-create form. Wire `MarkPaidSheet` into "Create receipt from payment". Wire the admin Company Settings tab into the existing `CompanySettingsForm` and API so receipt headers can be saved.
2. **PDF render pipeline**: pick an engine (Puppeteer or `@react-pdf/renderer`), bundle a Hebrew font, build the template for at least `tax_invoice_receipt`, snapshot the company header into the receipt at finalize time, store rendered bytes in S3, expose `GET /api/receipts/[id]/pdf`. Add bilingual support if the pilot operator needs it.
3. **Real allocation-number integration with the Tax Authority API**: accountant-confirmed threshold (probably type-scoped to `tax_invoice` and `tax_invoice_receipt`, with an annual table), certificate-based auth, background worker with retry, audit rows on `issued` and `failed`, an operator UI for retry and failure inspection. Without this, the receipt module cannot legally issue tax invoices above the threshold.

Beyond these three, items 5-8 in the High recommendations (snapshot company header, block double credit-noting, copy exchangeRate on credit-note, enforce vat-rate consistency) are tight follow-ons that should land in the same release.
