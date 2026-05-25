# Database Schema Audit — Billing, Receipts, Financial Documents

Auditor: Database Schema Auditor
Date: 2026-05-25
Branch: `claude/friendly-swanson-71ed53`
Scope: Prisma models that back billing, receipts, and financial-document workflows. Direct relations only.
Method: full read of `prisma/schema.prisma`, each migration SQL file under `prisma/migrations/`, and the call sites in `lib/receipts/*`, `lib/billing/queries.ts`, `lib/company-settings/queries.ts`, and the matching API routes under `app/api/billing/*` and `app/api/receipts/*`. No schema or code edits.
Prior audit (not duplicated): `docs/audit-2026-05/database_audit.md` (2026-05-24, 796 lines). Items still valid are referenced by their section number rather than re-stated.

---

## 1. Executive summary

The Phase 1 + 2 + 3 baseline lands the receipts and billing schema in a workable but unfinished state. Phase 3 closed three of the gaps the May-24 audit raised (`receipt_documents.exchange_rate`, the `receipt_finalized_vat_sum_chk` invariant, and the `CompanySettings` singleton). The remaining gaps cluster in three areas:

1. The `Payment` polymorphic source still has no DB-level check that exactly one of `source_monthly_id` / `source_hourly_id` / one-time linkage is set per `source_type`. The `BillingAccount` is currently not reachable from `Payment` at all — `Payment.clientId` is the only link, so a payment can target a client that has no billing account. Reachability from `Payment` to a `OneTimeJobCharge` is reverse-only (`OneTimeJobCharge.paymentId`), so the source enum is partially application-only.
2. Receipt numbering uses `upsert + increment` on a single `ReceiptDocumentSequence` row inside the transaction (`lib/receipts/finalize.ts:90`). That update lock is sufficient under READ COMMITTED, but the policy contract ("never leave a gap, never reuse a cancelled number") is implicit — there is no SQL test, no `documented` constraint, and `lib/receipts/cancel.ts:18` allows a draft to cancel without releasing the reservation (the reservation is only taken on finalize, so cancelling a draft is gap-safe, but cancelling a draft that was already given a `documentNumber` would be — and the schema permits a draft with a number).
3. There is no `FinancialDocument` model. The `/financial-documents` page is a feature-flag placeholder (`app/(portal)/financial-documents/page.tsx:117`). The data-model doc sketches the entity (`docs/internal-management-portal-data-model.md:316-338`) but nothing is in the schema. Section 9 of this audit proposes a complete shape.

Other notable findings:

- The receipts schema is **monolithic-by-status** (one table for draft + finalized + cancelled). The check constraint added in `20260524000600_receipt_invariants` guards finalize correctly. Drafts are wide open. A draft can carry a `documentNumber` and `documentNumberYear` (which would then collide via the unique key with another type+year+number tuple if a sibling draft picks the same). Today `finalize` is the only call path that sets these, but the schema permits direct `db.update` to do otherwise.
- Money columns are still `Int?` minor units across the board. The May-24 audit covered this; Phase 3 did not change it. Renaming the `*Placeholder` suffix remains pending.
- `Attachment` is a generic blob model with three join tables (`JobAttachment`, `PostAttachment`, `ReplyAttachment`). There is no `ReceiptAttachment` and no FK from `ReceiptDocument` to `Attachment`. When Phase 4 adds rendered-PDF storage or vendor-side proof images, a new join table or a direct nullable `Attachment` FK on `ReceiptDocument` is needed.
- `CompanySettings.country` is a free-form string defaulting `"IL"`. The schema has no concept of country profile or country-driven behavior toggles. Section 10 proposes a minimal shape.
- All 11 migrations are forward-only (no `DROP TABLE`, no destructive column changes). Migration hygiene is good; the only weakness is the seed step for `CompanySettings` (no migration seeds the singleton row, so the first finalize after a fresh DB will fail with "settings not found" unless the admin UI has been opened first).

Top three pre-rollout risks are in the Handoff to PM at the end.

---

## 2. Entity-by-entity field review

### 2.1 `Client` (only billing-relevant fields)

`prisma/schema.prisma:430-460`.

| Field | Type | Notes |
|---|---|---|
| `id` | `Uuid` PK | Standard. |
| `companyName` | `String` | UTF-8 ok for Hebrew. Btree index + pg_trgm GIN (init line 593, migration `20260524000200_fts_trigram_indexes`). No length cap. |
| `israeliTaxId` | `String?` | Partial unique index `clients_israeli_tax_id_unique_if_present` exists since `20260524000100_partial_indexes`. The May-24 gap is now closed. |
| `status` | `ClientStatus` enum | `active` / `inactive`. Used as the soft-delete signal. Btree index. |
| `createdByUserId` | `Uuid` FK | `ON DELETE RESTRICT` (init line 740). Correct. |

For billing this is enough. The Israel-specific fields (osek number, separate VAT number, business form) are not on `Client` today and instead live implicitly under `israeliTaxId`. The Israel-compliance audit covers this; flagging here only that future tax-document rendering needs `vatNumber`, `businessForm`, and `billingAddress` separately from postal address. None of those exist.

### 2.2 `BillingAccount`

`prisma/schema.prisma:462-477`.

| Field | Type | Notes |
|---|---|---|
| `id` | `Uuid` PK | Standard. |
| `clientId` | `Uuid` `@unique` | 1:1 with `Client`. Good. |
| `defaultCurrency` | `Currency` `@default(ILS)` | Read by the payment-creation form. |
| `notes` | `String?` | Admin notes. Unbounded. |

Observations:

- The `BillingAccount` is never referenced by `Payment`. `Payment` joins `Client` directly via `clientId`. That means `Payment.currency` can drift from `BillingAccount.defaultCurrency` without any cross-check; this is correct (a one-off USD payment for an ILS-default client is allowed) but worth noting.
- There is no `ON DELETE CASCADE` from `Client` to `BillingAccount`. Deleting a client is blocked by RESTRICT regardless, so the absence is harmless.
- No `vatRateBasisPoints` override per client. Today every receipt uses `CompanySettings.defaultVatBasisPoints` or the per-row value. A client-specific VAT exemption (e.g., Eilat) cannot be expressed at the account level. Add `vatRateOverrideBasisPoints Int?` if multi-zone clients become real.

### 2.3 `MonthlyBillingItem`

`prisma/schema.prisma:496-519`.

| Field | Type | Notes |
|---|---|---|
| `billingAccountId` | `Uuid` FK | Indexed. RESTRICT (init line 752). |
| `serviceName` | `String` | UTF-8 fine for Hebrew. No length cap. |
| `priceAmountPlaceholder` | `Int?` | Minor units. Nullable. The `Placeholder` suffix flags "not real money yet" (see May-24 §4.1). |
| `currency` | `Currency` `@default(ILS)` | Per-row, can differ from account default. |
| `billingCycle` | `String @default("monthly")` | Free-form string. Should be an enum (`monthly`, `quarterly`, `annual`) before any real cron drives it. |
| `startDate`, `endDate`, `nextDueDate` | `@db.Date` | Calendar dates, not timestamps. Correct. |
| `status` | `MonthlyBillingStatus` | `active` / `paused` / `cancelled` / `none`. The `none` value is suspicious — purpose unclear from schema. |
| `lastBilledPeriod` | `String?` | Free-form. Probably `"2026-05"` style. Should be a check-constrained format. |

Concerns specific to this audit:

1. `billingCycle` as string permits drift. Either enum it or check-constrain to a regex.
2. `MonthlyBillingStatus.none` has no obvious use. Audit for live rows before considering removing.
3. No DB-level check that `endDate >= startDate` or that `nextDueDate >= startDate`. Cheap to add.
4. No partial index on `(status = 'active', nextDueDate)` — the active-due query is the hot path for monthly cron.

### 2.4 `HourlyBank`

`prisma/schema.prisma:521-543`.

| Field | Type | Notes |
|---|---|---|
| `totalHoursPurchasedMinutes` | `Int?` | Name says hours, type says minutes. The May-24 audit §11.9 flagged this. Still unrenamed. |
| `pricePerHourPlaceholder` | `Int?` | Minor units per hour. |
| `totalPaymentPlaceholder` | `Int?` | Minor units total. |
| `currency` | `Currency @default(ILS)` | Per-row. |
| `purchaseDate` | `@db.Date` | Correct. |
| `expiryDate` | `@db.Date?` | Calendar date. |
| `status` | `HourlyBankStatus` | `active` / `used_up` / `none`. |
| `alertThresholdPercent` | `Int @default(25)` | 25 = 25%. Implicit "low balance" trigger. No range check (could store 150). |

Concerns specific to this audit:

1. **No `usedMinutes` cache** on `HourlyBank`. Every burn calculation in `lib/billing/queries.ts:300-330` (`getBankBurn`) fetches all usages and sums in JS. For a bank with thousands of usages this scans the whole `hourly_bank_usages` partition. Either denormalize a `usedMinutesCache Int` (with a write hook that updates it from `HourlyBankUsage` insert/delete) or use a Postgres view.
2. **No check constraint** that `total_payment_placeholder = price_per_hour_placeholder * total_hours_purchased_minutes / 60`. Today the three fields can be inconsistent (e.g., 100 hours at 200 NIS each but `totalPayment = 10000`). Acceptable for an MVP since prices are placeholders; tighten when accountant signs off.
3. **No partial index** on `(status = 'active', billingAccountId)`. Today the only btree is `(billingAccountId)` and `(status)` separately. A composite or partial would help the active-banks-per-client query that the burn-rate calculation triggers.
4. `alertThresholdPercent` has no check `BETWEEN 0 AND 100`.

### 2.5 `HourlyBankUsage`

`prisma/schema.prisma:545-563`.

| Field | Type | Notes |
|---|---|---|
| `hourlyBankId` | `Uuid` FK | RESTRICT. Indexed via `(hourlyBankId, usedAt DESC)`. |
| `jobId` | `Uuid` FK | RESTRICT. Indexed. |
| `minutesUsed` | `Int` | **Not null, no positivity check.** The May-24 audit §10.3 flagged this. Still missing. |
| `usedAt` | `DateTime @default(now())` | UTC timestamp. Correct. |
| `recordedByUserId` | `Uuid` FK | RESTRICT. |
| `note` | `String?` | Free-form. |

Concerns specific to this audit:

1. `minutesUsed` allows negative or zero. Zod enforces positive in the route (`app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts:38`), but a direct DB write bypasses it. Add `CHECK (minutes_used > 0)`.
2. No check that `minutesUsed <= bank.totalHoursPurchasedMinutes - bank.usedMinutes`. Over-consumption is structurally allowed. Acceptable if "negative balance" is intentional, but should be intentional, not accidental.

### 2.6 `OneTimeJobCharge`

`prisma/schema.prisma:565-584`.

| Field | Type | Notes |
|---|---|---|
| `billingAccountId` | `Uuid` FK | RESTRICT. **No btree index** despite the May-24 audit §6.2 calling for one. Still missing. |
| `jobId` | `Uuid` `@unique` FK | 1:1 with `Job`. RESTRICT. |
| `jobNameSnapshot` | `String` | Snapshot of `Job.title` at charge time. Good. No length cap. |
| `priceAmountPlaceholder` | `Int?` | Minor units. |
| `currency` | `Currency @default(ILS)` | |
| `paymentId` | `Uuid?` FK | `ON DELETE SET NULL` (init line 773). |
| `dateCreated` | `DateTime @default(now())` | |
| `datePaid` | `DateTime?` | Denormalized from `Payment.paidDate`. No DB-level sync. |

Concerns:

1. Add `@@index([billingAccountId])`. Pending since May-24.
2. `datePaid` denormalization risks drift. The `Payment.paidDate` is the source of truth; consider removing `datePaid` and joining instead, or keep it as a write-through cache with a documented sync point.

### 2.7 `Payment`

`prisma/schema.prisma:586-620`.

| Field | Type | Notes |
|---|---|---|
| `clientId` | `Uuid` FK | RESTRICT. Indexed via `(clientId, status)`. |
| `sourceType` | `PaymentSourceType` enum | `monthly` / `hourly_bank` / `one_time`. |
| `sourceMonthlyId` | `Uuid?` FK | `ON DELETE SET NULL` (init line 779). |
| `sourceHourlyId` | `Uuid?` FK | `ON DELETE SET NULL` (init line 782). |
| `amountPlaceholder` | `Int?` | Minor units. Nullable even at status `paid`. |
| `currency` | `Currency @default(ILS)` | |
| `issuedDate`, `dueDate`, `paidDate` | `@db.Date` | Calendar dates. |
| `status` | `PaymentStatus` | 7 values. |
| `method` | `PaymentMethod?` | Nullable until paid. |
| `reference` | `String?` | Free-form: bank transfer number, cheque number, etc. |
| `linkedReceiptId` | `Uuid?` FK | `ON DELETE SET NULL`. |
| `createdByUserId` | `Uuid` FK | RESTRICT. |

Concerns specific to this audit:

1. **No polymorphism check constraint.** The May-24 audit §3.4 sketched the SQL. Phase 3 did not add it. Still missing. A `Payment` can have `sourceType = 'monthly'` with both source FKs null, or both set, or set to the wrong type. The Zod schema in `app/api/billing/payments/route.ts:34-35` makes them `.optional()`; nothing requires consistency with `sourceType`.
2. **The `one_time` source is unreachable from `Payment`.** For `sourceType = 'one_time'` the source FK lives on `OneTimeJobCharge.paymentId` (the reverse direction). A query like "show this payment's source" needs three left joins. Consider either (a) adding `sourceOneTimeId` to `Payment` for symmetry, or (b) accepting the reverse-only model and documenting it in a comment.
3. **No `PaymentEvent` / `PaymentStatusEvent` table.** Status transitions are written only to `AuditLog`. For "show the timeline of this payment" the UI must read `AuditLog` with `entityType = 'Payment'` and `entityId = paymentId`, then parse `diffJson`. Acceptable but lossy — a structured `PaymentStatusEvent` table (analogous to `JobStatusEvent`) would simplify reporting and aging reconstruction.
4. `Payment.paidDate` exists but the May-24 audit §3.4 noted no check that it is non-null when status is `paid`. The API route at `app/api/billing/payments/[id]/route.ts:49-51` enforces this on PATCH. Direct DB writes bypass.
5. **No exchange rate.** `Payment.currency` can be `USD` or `EUR` but no `exchangeRate Decimal` column exists. `ReceiptDocument` has one (Phase 3); `Payment` does not. If a USD payment is recorded, the ILS-equivalent for accounting is unknown.
6. Indexes are good for the listed hot paths: `(clientId, status)`, `(status, dueDate)`, `(paidDate)`. Missing: `(linkedReceiptId)` for the reverse lookup "which payment generated this receipt?" — small win; reverse FKs are auto-indexed in Postgres only for `UNIQUE` columns, not for plain FKs.

### 2.8 `PaymentEvent` / `PaymentStatusEvent`

**Not present.** No such model in `prisma/schema.prisma`. The audit log is the only history.

Recommendation: add a `PaymentStatusEvent` modeled on `JobStatusEvent`:

```prisma
model PaymentStatusEvent {
  id              String        @id @default(uuid()) @db.Uuid
  paymentId       String        @map("payment_id") @db.Uuid
  fromStatus      PaymentStatus? @map("from_status")
  toStatus        PaymentStatus @map("to_status")
  changedByUserId String        @map("changed_by_user_id") @db.Uuid
  changedAt       DateTime      @default(now()) @map("changed_at")
  amountAtTime    Int?          @map("amount_at_time") // snapshot for aging
  note            String?       @db.Text

  payment   Payment @relation(fields: [paymentId], references: [id])
  changedBy User    @relation(fields: [changedByUserId], references: [id])

  @@index([paymentId, changedAt(sort: Desc)])
  @@map("payment_status_events")
}
```

Justification: Israeli VAT reconciliation needs the period a payment was paid in; today this is recoverable from `paidDate` but transitions like "draft → cancelled" leave no trace beyond the audit log. An admin "what happened to this invoice" view becomes one query.

### 2.9 `ReceiptDocument`

`prisma/schema.prisma:622-668`.

Full field list:

| Field | Type | Notes |
|---|---|---|
| `type` | `ReceiptDocumentType` enum | 6 values: `invoice`, `receipt`, `tax_invoice`, `tax_invoice_receipt`, `credit_note`, `proforma_invoice`. |
| `clientId` | `Uuid` FK | RESTRICT (init line 791). Indexed. |
| `paymentId` | `Uuid?` | **No FK constraint declared in init migration.** Only the relation `linkedReceipt` exists on `Payment` (init line 788). The receipts table's `paymentId` is a dangling reference column with no enforcement. **Bug or intentional?** Compare with the reverse FK at `Payment.linkedReceiptId`. The forward `ReceiptDocument.paymentId` field is set by `lib/receipts/credit-note.ts:39` (`paymentId: source.paymentId`) but no FK ensures it points to a real payment. |
| `documentNumber` | `Int?` | Nullable while draft. |
| `documentNumberYear` | `Int?` | Nullable while draft. |
| `status` | `ReceiptDocumentStatus` | `draft` / `finalized` / `cancelled`. |
| `issueDate` | `@db.Date` | |
| `paymentDate` | `@db.Date?` | |
| `descriptionLines` | `Json @default("[]")` | No schema validation at DB layer. |
| `amountBeforeVat` | `Int?` | Minor units. Required at finalize by `receipt_finalized_vat_sum_chk`. |
| `vatRateBasisPoints` | `Int @default(1800)` | 18.00%. Per-row. |
| `vatAmount` | `Int?` | Required at finalize. |
| `totalAmount` | `Int?` | Required at finalize. |
| `paymentMethod` | `PaymentMethod?` | |
| `reference` | `String?` | |
| `currency` | `Currency @default(ILS)` | |
| `notes` | `String?` | |
| `language` | `String @default("he")` | Free-form. Should be enum (`he`, `en`, `both`). |
| `allocationNumber` | `String?` | Tax Authority allocation. Phase 4 work. |
| `allocationStatus` | `AllocationStatus` | `not_required` / `pending` / `issued` / `failed`. |
| `allocationObtainedAt` | `DateTime?` | UTC. |
| `finalizedAt` | `DateTime?` | UTC. |
| `finalizedByUserId` | `Uuid?` FK | `ON DELETE SET NULL`. |
| `exchangeRate` | `Decimal?(18,6)` | Phase 3 addition (`20260524000500_receipt_extras`). Required at finalize when `currency != 'ILS'`. |
| `creditedReceiptId` | `Uuid?` FK self | Points to the receipt being credited. `ON DELETE SET NULL` (`20260524000500_receipt_extras` line 16). |

Strong points (already in place):

- `unique_document_number` composite key on `(type, documentNumberYear, documentNumber)` (init line 644).
- `receipt_finalized_vat_sum_chk` (`20260524000600_receipt_invariants` lines 9-16) blocks finalize without consistent totals.
- `receipt_finalized_exchange_rate_chk` (lines 22-27) blocks non-ILS finalize without a rate.
- Self-FK `creditedReceiptId` enables credit-note chains.

Gaps specific to this audit:

1. **`paymentId` has no FK enforcement.** Check the init migration: the FK is only declared in the reverse direction (`Payment.linkedReceiptId`). Verify with `\d+ receipt_documents` in psql; if there is no FK on `payment_id`, add one. Reading the init migration, lines 788-794 show only two FKs on `receipt_documents`: `client_id` and `finalized_by_user_id`. **Confirmed: `receipt_documents.payment_id` is an orphan-permitting column.** A migration like:
   ```sql
   ALTER TABLE receipt_documents
     ADD CONSTRAINT receipt_documents_payment_id_fkey
     FOREIGN KEY (payment_id) REFERENCES payments(id)
     ON DELETE SET NULL ON UPDATE CASCADE;
   ```
2. **Draft can carry a `documentNumber`.** Nothing prevents a `db.update({ where: { id }, data: { documentNumber: 999 } })` while status is `draft`. Add a check: `(status <> 'draft' OR (document_number IS NULL AND document_number_year IS NULL))`.
3. **Finalize check does not pin `documentNumber` non-null.** `receipt_finalized_vat_sum_chk` only covers totals. Add `(status <> 'finalized' OR (document_number IS NOT NULL AND document_number_year IS NOT NULL))`.
4. **Credit-note totals are negated, but the VAT sum check still applies.** A credit-note draft has `amountBeforeVat = -X`, `vatAmount = -Y`, `totalAmount = -(X+Y)`. The constraint `total_amount = amount_before_vat + vat_amount` still holds for negative values, so this works. Worth a one-line comment in the migration for the reviewer.
5. **`finalizedAt` / `finalizedByUserId` not nulled-out on credit-note creation.** The credit-note is created in draft (`lib/receipts/credit-note.ts:35`), so these are null. Good.
6. **No `cancelledAt` / `cancelledByUserId` / `cancelReason`.** The cancel path (`lib/receipts/cancel.ts`) only updates `status`. The "who cancelled and why" is only in `AuditLog`. For tax-audit purposes (Israel: cancelled drafts must be tracked) consider adding three columns and folding `reason` into the audit `diff` plus a column.
7. **No `language` enum.** Same as May-24 §3.5 finding.
8. **No `senderEmail` / `recipientEmail` / `sentAt`.** When this receipt is emailed to the client, the schema has nowhere to record the send. Add `sentAt DateTime?`, `sentToEmail String?` for the audit trail.
9. **No `pdfAttachmentId` FK to `Attachment`.** A rendered PDF of the finalized receipt has no place to live. See §2.12 for the attachment plan.

### 2.10 `ReceiptDocumentSequence`

`prisma/schema.prisma:670-680`.

| Field | Type | Notes |
|---|---|---|
| `id` | `Uuid` PK | Default `uuid()`. |
| `type` | `ReceiptDocumentType` | |
| `year` | `Int` | |
| `nextNumber` | `Int @default(1)` | Next number to issue. After the issue, this value is incremented. |
| `updatedAt` | `DateTime @updatedAt` | |

Strong points:

- `@@unique([type, year])` enforces one row per (type, year).
- The increment is done via `upsert ... update: { nextNumber: { increment: 1 } }` (`lib/receipts/finalize.ts:90-94`), which Postgres translates to `UPDATE ... SET next_number = next_number + 1`. The row-level lock from the UPDATE is held until the outer transaction commits. Under READ COMMITTED, parallel finalize attempts on the same `(type, year)` will serialize. The comment in `finalize.ts:75-83` documents this correctly.

Concerns specific to this audit:

1. **`nextNumber` is the "after-issue" value.** The comment in `finalize.ts:96-98` clarifies: `issued = seq.nextNumber - 1`. This is confusing; a clearer model is "current" (the value just issued) vs "next" (the value to issue next). The `upsert.create` uses `nextNumber: 2`, meaning "1 was just issued, next will be 2." Consider renaming to `lastIssuedNumber` or splitting into two columns.
2. **No starting-number override per `(type, year)`.** Some businesses begin a tax year with a non-1 starting number (continuing from the prior year's series, or starting at a vendor-mandated number). Add `startsAt Int?` and use it in `reserveNumber` when no row exists yet.
3. **No DB-level minimum-value check.** `nextNumber > 0` should be enforced. Today nothing stops `update: { nextNumber: -5 }` (admin foot-gun).
4. **No reverse navigation to the row that was issued.** If number 47 was issued and the underlying `ReceiptDocument` was deleted (today: impossible by RESTRICT), the sequence row remains advanced. This is the correct gap-less behavior, but worth documenting.

### 2.11 `CompanySettings`

`prisma/schema.prisma:895-925`. Singleton enforced by `CHECK (id = '00000000-0000-0000-0000-000000000001')` since `20260524000800_company_settings_singleton`.

| Field | Type | Notes |
|---|---|---|
| `id` | `Uuid` PK | Fixed UUID. |
| `legalNameEn` / `legalNameHe` | `String?` | UTF-8 ok. No length cap. |
| `companyNumber` | `String?` | Israeli company registry number. |
| `vatNumber` | `String?` | Israeli VAT registration. |
| `timezone` | `String @default("Asia/Jerusalem")` | |
| `defaultVatBasisPoints` | `Int @default(1800)` | 18.00%. |
| `defaultCurrency` | `Currency @default(ILS)` | |
| `email`, `phone` | `String?` | |
| `addressLine1`, `addressLine2`, `city`, `postalCode` | `String?` | |
| `country` | `String @default("IL")` | Free-form. No enum. |
| `websiteUrl` | `String?` | |
| `receiptFooterEn` / `receiptFooterHe` | `String? @db.Text` | |
| `updatedByUserId` | `Uuid?` FK | `ON DELETE SET NULL`. |

Strong points:

- `defaultVatBasisPoints` uses basis points (the same convention as `ReceiptDocument.vatRateBasisPoints`). Consistent.
- Singleton row enforced at DB layer.
- `getCompanyForReceipts()` (`lib/company-settings/queries.ts:119-153`) is a focused projection.

Concerns specific to this audit:

1. **`country` is a free-form string.** Section 10 proposes a small enum or a `CountryProfile` lookup.
2. **No `defaultLanguage` for receipts.** `ReceiptDocument.language` defaults to `"he"` per-row but a company-wide override would simplify multi-tenant futures.
3. **No `taxYearStartMonth` / `taxYearStartDay`.** Israel uses calendar year (Jan-Dec) for VAT, but accountant prefs may differ. Add for flexibility.
4. **No `defaultDueDays` for invoices.** Today every invoice carries its own `dueDate`. A company-wide default ("net 30") would shorten the create-payment form.
5. **No row-seed migration.** The singleton row is created lazily by `upsertCompanySettings` (`lib/company-settings/queries.ts:69`). If a finalize runs before any admin has opened the company-settings page, `getCompanyForReceipts()` returns `null` and the rendered receipt has no company name. Add a migration that inserts the singleton row with defaults.

### 2.12 `Attachment` (cross-reference)

`prisma/schema.prisma:791-808`. Generic blob model.

| Field | Type | Notes |
|---|---|---|
| `id` | `Uuid` PK | |
| `storageKey` | `String` | S3 key. |
| `fileName` | `String` | Original filename. UTF-8 ok. |
| `mimeType` | `String` | |
| `byteSize` | `Int` | |
| `uploadedByUserId` | `Uuid` FK | RESTRICT. |
| `visibility` | `AttachmentVisibility` `@default(public_in_org)` | `public_in_org` / `admin_only`. |

Join tables: `JobAttachment`, `PostAttachment`, `ReplyAttachment` — all `ON DELETE CASCADE` for both sides.

**No `ReceiptAttachment` join table.** When the receipts module begins generating PDFs and storing them, one of:

- Add `ReceiptDocument.pdfAttachmentId Uuid?` with a `SET NULL` FK to `Attachment`. Simple, 1:1.
- Add a `ReceiptAttachment(receiptId, attachmentId)` join table mirroring the existing pattern. M:N, supports both the PDF and the receipt of a wire-transfer photo.

Recommendation: join table for parity, since a receipt may eventually carry multiple attachments (the rendered PDF, the original signed paper scan, an attached vendor receipt). Add `category String` on the join (`generated_pdf`, `client_supplied`, `internal_note`).

**`Attachment.visibility` has only two values.** When the `FinancialDocument` ingestion lands, a `finance_only` tier may be needed (accountant-only). Easy to extend.

**No checksum / dedupe.** `storageKey` is the S3 key but two uploads of the same byte-stream get two storage objects. Add `sha256 String?` to enable future dedupe.

---

## 3. Relational integrity and FK behavior

### 3.1 Confirmed FK behavior on receipts and billing

From the init migration FK declarations (lines 743-794):

| FK | Behavior | Verdict |
|---|---|---|
| `billing_accounts.client_id → clients.id` | `ON DELETE RESTRICT` | Correct (1:1, never delete client). |
| `monthly_billing_items.billing_account_id → billing_accounts.id` | `RESTRICT` | Correct. |
| `hourly_banks.billing_account_id → billing_accounts.id` | `RESTRICT` | Correct. |
| `hourly_bank_usages.hourly_bank_id → hourly_banks.id` | `RESTRICT` | Correct (history preservation). |
| `one_time_job_charges.billing_account_id → billing_accounts.id` | `RESTRICT` | Correct. |
| `one_time_job_charges.job_id → jobs.id` | `RESTRICT` | Correct. |
| `one_time_job_charges.payment_id → payments.id` | `SET NULL` | Correct: if a payment is somehow gone, the charge becomes unpaid. |
| `payments.client_id → clients.id` | `RESTRICT` | Correct. |
| `payments.source_monthly_id → monthly_billing_items.id` | `SET NULL` | OK, but contradicts `sourceType = 'monthly'` invariant. After SET NULL the row is internally inconsistent. |
| `payments.source_hourly_id → hourly_banks.id` | `SET NULL` | Same concern. |
| `payments.created_by_user_id → users.id` | `RESTRICT` | Correct. |
| `payments.linked_receipt_id → receipt_documents.id` | `SET NULL` | OK. |
| `receipt_documents.client_id → clients.id` | `RESTRICT` | Correct. |
| `receipt_documents.finalized_by_user_id → users.id` | `SET NULL` | OK. |
| `receipt_documents.credited_receipt_id → receipt_documents.id` (`20260524000500_receipt_extras`) | `SET NULL` | OK. |
| `receipt_documents.payment_id → payments.id` | **NOT DECLARED.** | **Bug.** Column exists, no FK. |

### 3.2 Orphan risks

Cascading the SET NULLs above:

- A deleted `MonthlyBillingItem` cascades to nullify `Payment.sourceMonthlyId`. The `Payment.sourceType = 'monthly'` is preserved. Result: a "monthly" payment with no source — inconsistent. Either change to `RESTRICT` (don't allow item delete with payments) or add a status transition that flips `sourceType`. Today no API path deletes monthly items hard, so the risk is theoretical.
- A deleted `Payment` (also theoretical) cascades to nullify `OneTimeJobCharge.paymentId` (so the charge becomes unpaid) and `Job.linkedPaymentId`, and `ReceiptDocument.payment_id` if the FK were declared. Today no API path hard-deletes payments either.
- `ReceiptDocument.creditedReceiptId` SET NULL on delete of the source receipt breaks the credit-note chain. Use `RESTRICT` instead. **Recommendation: change to `RESTRICT` so a finalized source receipt cannot be deleted while a credit-note references it.**

### 3.3 Cascade vs RESTRICT recommendations

Three cases warrant a change:

1. `receipt_documents.payment_id → payments.id` — **add the FK** with `ON DELETE SET NULL` (consistent with the reverse direction).
2. `receipt_documents.credited_receipt_id → receipt_documents.id` — **change to `RESTRICT`** to prevent breaking credit-note chains.
3. `payments.source_monthly_id` and `payments.source_hourly_id` — **change to `RESTRICT`** to prevent internally inconsistent payments. Trade-off: an admin who wants to delete an obsolete monthly item must first archive its payments. This is the correct workflow for accounting.

---

## 4. Indexes — existing and recommended additions

### 4.1 Existing indexes (billing + receipts subset)

From init migration plus subsequent partial-index migrations:

| Table | Index | Source |
|---|---|---|
| `clients` | `(company_name)` btree | init 593 |
| `clients` | `(status)` btree | init 596 |
| `clients` | `(israeli_tax_id) WHERE israeli_tax_id IS NOT NULL` partial unique | `20260524000100_partial_indexes` |
| `clients` | `(company_name) gin gin_trgm_ops` | `20260524000200_fts_trigram_indexes` |
| `billing_accounts` | `(client_id)` unique | init 599 |
| `monthly_billing_items` | `(billing_account_id)` | init 605 |
| `monthly_billing_items` | `(status)` | init 608 |
| `monthly_billing_items` | `(next_due_date)` | init 611 |
| `hourly_banks` | `(billing_account_id)` | init 614 |
| `hourly_banks` | `(status)` | init 617 |
| `hourly_bank_usages` | `(hourly_bank_id, used_at DESC)` | init 620 |
| `hourly_bank_usages` | `(job_id)` | init 623 |
| `one_time_job_charges` | `(job_id)` unique | init 626 |
| `payments` | `(client_id, status)` | init 629 |
| `payments` | `(status, due_date)` | init 632 |
| `payments` | `(paid_date)` | init 635 |
| `receipt_documents` | `(client_id)` | init 638 |
| `receipt_documents` | `(status)` | init 641 |
| `receipt_documents` | `(type, document_number_year, document_number)` unique | init 644 |
| `receipt_documents` | `(credited_receipt_id)` | `20260524000500_receipt_extras` line 19 |
| `receipt_document_sequences` | `(type, year)` unique | init 647 |

### 4.2 Recommended additions

| Index | Justification | Priority |
|---|---|---|
| `one_time_job_charges (billing_account_id)` btree | Aging by account, missing since May-24. | High |
| `payments (linked_receipt_id)` btree | Reverse lookup "which payment generated this receipt" — used by the receipts-detail UI. | High |
| `receipt_documents (payment_id)` btree | After the FK is added, the index is needed for the same reverse lookup. | High |
| `receipt_documents (status, finalized_at DESC) WHERE status = 'finalized'` partial | "Recent finalized receipts" view — the hot path for the receipts list. Today queries scan all rows or rely on the broad `(status)` btree. | High |
| `hourly_banks (billing_account_id) WHERE status = 'active'` partial | Active-banks-per-client is hot in burn-rate. | Medium |
| `monthly_billing_items (next_due_date) WHERE status = 'active'` partial | Monthly cron sees only active rows. | Medium |
| `payments (status, due_date) WHERE status IN ('sent_to_client','waiting_for_payment','partially_paid','overdue')` partial | Aging report scans only open statuses. The full `(status, due_date)` btree works but is wider than needed. | Medium |
| `receipt_documents (allocation_status) WHERE allocation_status = 'pending'` partial | Allocation-pending watcher (Tax Authority integration). | Low (until allocation API lands) |
| `payment_status_events (payment_id, changed_at DESC)` | If the proposed `PaymentStatusEvent` model is added. | Medium |

### 4.3 Indexes that may be over-engineered

- `monthly_billing_items (status)` standalone btree — used only by admin "show me all paused" queries. Marginal. Leave for now.
- `hourly_banks (status)` standalone btree — same. Marginal. Leave for now.

---

## 5. Check constraints — existing and recommended additions

### 5.1 Existing

| Constraint | Table | Source |
|---|---|---|
| `receipt_finalized_vat_sum_chk` | `receipt_documents` | `20260524000600_receipt_invariants` lines 9-16. Pins `total = before_vat + vat` at finalize. |
| `receipt_finalized_exchange_rate_chk` | `receipt_documents` | `20260524000600_receipt_invariants` lines 22-27. Pins `exchange_rate IS NOT NULL` when finalized and non-ILS. |
| `company_settings_single_row` | `company_settings` | `20260524000800_company_settings_singleton`. Pins `id` to the singleton UUID. |

### 5.2 Recommended additions

| Constraint | Table | Rationale | Priority |
|---|---|---|---|
| `hourly_bank_usages_minutes_used_chk CHECK (minutes_used > 0)` | `hourly_bank_usages` | Zod-only today. May-24 §10.3. | High |
| `payments_source_polymorphism_chk` (see SQL below) | `payments` | Source consistency. May-24 §3.4. Still missing. | High |
| `receipt_documents_finalized_number_chk CHECK (status <> 'finalized' OR (document_number IS NOT NULL AND document_number_year IS NOT NULL))` | `receipt_documents` | Finalized rows must carry a number. | High |
| `receipt_documents_draft_no_number_chk CHECK (status = 'draft' OR (document_number IS NOT NULL))` | `receipt_documents` | Bidirectional: a non-draft row must have a number, a draft must not (numbers are reserved at finalize). | Medium |
| `payments_amount_when_paid_chk CHECK (status <> 'paid' OR amount_placeholder IS NOT NULL)` | `payments` | Closes the API-only gap. | Medium |
| `payments_paid_date_when_paid_chk CHECK (status <> 'paid' OR paid_date IS NOT NULL)` | `payments` | API enforces; DB does not. | Medium |
| `hourly_banks_alert_threshold_range_chk CHECK (alert_threshold_percent BETWEEN 0 AND 100)` | `hourly_banks` | Foot-gun guard. | Low |
| `receipt_documents_credit_note_negation_chk CHECK (type <> 'credit_note' OR total_amount <= 0)` | `receipt_documents` | Credit notes should be non-positive totals (zero allowed only for adjustments). | Low |
| `monthly_billing_items_date_order_chk CHECK (end_date IS NULL OR end_date >= start_date)` | `monthly_billing_items` | Date consistency. | Low |

SQL for the polymorphism check:

```sql
ALTER TABLE payments
  ADD CONSTRAINT payments_source_polymorphism_chk
  CHECK (
    (source_type = 'monthly'
      AND source_monthly_id IS NOT NULL
      AND source_hourly_id IS NULL)
    OR (source_type = 'hourly_bank'
      AND source_hourly_id IS NOT NULL
      AND source_monthly_id IS NULL)
    OR (source_type = 'one_time'
      AND source_monthly_id IS NULL
      AND source_hourly_id IS NULL)
  );
```

Note: this constraint will fail for any existing row that has the SET NULL trigger fired against it. Add a one-time data fix: rows with `source_type = 'monthly' AND source_monthly_id IS NULL` should either be deleted (test data) or have `source_type` changed to `one_time`.

---

## 6. Receipts numbering integrity

The numbering flow is implemented in `lib/receipts/finalize.ts:84-100`:

```ts
async function reserveNumber(tx, type) {
  const year = new Date().getFullYear();
  const seq = await tx.receiptDocumentSequence.upsert({
    where: { type_year: { type, year } },
    create: { type, year, nextNumber: 2 },     // 1 was just issued
    update: { nextNumber: { increment: 1 } },  // n was just issued
  });
  const issued = seq.nextNumber - 1;
  return { year, nextNumber: issued };
}
```

### 6.1 Correctness review

1. **Atomicity:** the upsert runs inside the caller's `tx` (Prisma `$transaction`). The `UPDATE` portion takes a row lock on the unique `(type, year)` row. Parallel finalize attempts on the same `(type, year)` serialize on this lock; the second one waits for the first to commit before reading the new `nextNumber`. Correct under READ COMMITTED.
2. **Gap-less:** if the surrounding transaction rolls back after the upsert, the increment is also rolled back. The next finalize re-takes the same number. Correct.
3. **Cancellation:** `lib/receipts/cancel.ts:18` only cancels drafts (`row.status === "finalized"` throws). Drafts never reserved a number, so cancel doesn't free one. Finalized receipts cannot be cancelled at all (must credit-note). The cancellation does NOT free a finalized number — correct per Israeli tax law.
4. **Year boundary:** `new Date().getFullYear()` uses the server's local timezone. If the server is set to `UTC` and the receipt is finalized at 23:30 Asia/Jerusalem on Dec 31, the local year is current but `getFullYear()` returns next year. Recommend pinning the year to Asia/Jerusalem via `date-fns-tz` (`utcToZonedTime(now, "Asia/Jerusalem").getFullYear()`).

### 6.2 Schema-level concerns

1. The unique key `(type, documentNumberYear, documentNumber)` on `receipt_documents` is the only guard. Postgres treats NULLs as distinct, so multiple drafts can co-exist with `(type, NULL, NULL)`. Intentional (drafts share the namespace).
2. **No `RECEIPT_NUMBER_MIN` constraint.** A future bug that sets `nextNumber` directly to 0 or negative would silently issue invalid numbers. Add `CHECK (next_number > 0)` on `receipt_document_sequences`.
3. The `descriptor` table relies on `(type, year)` uniqueness; the `id` PK is unused for queries. Either accept the dual key (composite unique + PK uuid) or change PK to the composite.
4. The May-24 audit §3.5 noted that `documentNumber` and `documentNumberYear` can be set in draft. Once a draft is given a number outside the reservation flow, the unique constraint would block a finalize from reusing that number. Add the draft-no-number check from §5.2.

### 6.3 What works as intended

- Atomic reserve via `UPDATE ... SET next_number = next_number + 1`.
- Per-type-per-year scoping.
- No reuse on cancel (drafts never had a number).

### 6.4 What's missing

- Year-boundary timezone pin.
- `nextNumber > 0` constraint.
- Documented contract test ("100 parallel finalizes of the same type-year produce contiguous 100 numbers").
- Per-type-year starting number override (for businesses migrating an existing series).

---

## 7. VAT and currency

### 7.1 VAT storage

- `ReceiptDocument.vatRateBasisPoints Int @default(1800)` — basis points, integer. Correct.
- `CompanySettings.defaultVatBasisPoints Int @default(1800)` — same convention. Correct.
- No basis-points convention on `MonthlyBillingItem`, `HourlyBank`, `OneTimeJobCharge`, or `Payment`. VAT is only modeled at the receipt layer. Acceptable since billing items are pre-VAT placeholders today; revisit when prices go live.

### 7.2 Currency

- `Currency` enum: `ILS`, `USD`, `EUR`. Three values hardcoded. To add `GBP` requires `ALTER TYPE ... ADD VALUE` which is non-transactional in older Postgres and irreversible. For an MSP that occasionally serves a foreign client, three is enough. Plan for one of:
  - Add `GBP`, `CHF`, `CAD` proactively (cheap migration now, expensive later).
  - Switch to ISO 4217 `String @db.Char(3)` with a check constraint enforcing the allow-list. More flexible, less type-safe.
- Recommendation: leave the enum at 3 values, document the migration cost, prepare a one-line migration template.

### 7.3 Multi-currency receipts

- `ReceiptDocument.exchangeRate Decimal(18,6)?` (Phase 3) is the rate from `currency` to ILS at finalize time. Good precision: 18.6 covers `1 USD = 0.000001` up to `999999999999.999999`. Way more than needed.
- The `receipt_finalized_exchange_rate_chk` ensures non-ILS finalize records a rate.
- **Downstream consumers** of `exchangeRate`:
  - `lib/receipts/credit-note.ts:42-45`: the credit-note inherits totals but **not** `exchangeRate`. So a USD credit-note has `currency = 'USD'` and `exchangeRate = null` until its own finalize. Whatever the rate is at credit-note finalize will differ from the source receipt's rate. For accounting, this is correct (mark-to-market), but flag to the accountant.
  - No other consumer reads `exchangeRate`. The future receipt-PDF renderer and the future financial-document reconciliation will need it.
- **No `exchangeRate` on `Payment`.** A USD payment has no recorded ILS equivalent. Either deny non-ILS payments at the API or add the column. Recommend adding `exchangeRate Decimal(18,6)?` on `Payment` and the same finalize-time check pattern.
- **No `exchangeRateSource` field.** Was the rate from Bank of Israel? Manually entered by the admin? For audit, add a `String?` documenting the source (e.g., `"boi-daily-2026-05-25"`).

### 7.4 VAT history

The May-24 audit §9.2 noted Israel raised VAT from 17% to 18% on Jan 1 2025. Credit-noting a pre-2025 invoice requires preserving 1700 basis points on the credit-note row. The schema supports this because `vatRateBasisPoints` is per-row. `lib/receipts/credit-note.ts:43` (`vatRateBasisPoints: source.vatRateBasisPoints`) correctly copies. Good.

---

## 8. Audit relations

### 8.1 Current state

- `AuditLog.actorUserId Uuid?` FK to `User` with `ON DELETE SET NULL`. Correct.
- `AuditLog.entityId Uuid` is polymorphic, no FK. Correct (cannot FK to many tables).
- `AuditLog.entityType String` is free-form. May-24 §3.8 flagged. Still free-form.

### 8.2 Entity types used by billing/receipts code

From grep:

- `Payment` (`app/api/billing/payments/route.ts:78`, `app/api/billing/payments/[id]/route.ts:71`).
- `ReceiptDocument` (`lib/receipts/cancel.ts:42`, `finalize.ts:63`, `credit-note.ts:55`, `allocation.ts:69`).
- `CompanySettings` (`lib/company-settings/queries.ts:92`).
- `MonthlyBillingItem` (`app/api/clients/[id]/billing/monthly-items/route.ts:70`).
- `HourlyBank` (`app/api/clients/[id]/billing/hourly-banks/route.ts:75`).
- `HourlyBankUsage` (`app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts:72`).
- `OneTimeJobCharge` (`app/api/clients/[id]/billing/one-time-charges/route.ts:76`).
- `Client` (`app/api/clients/route.ts:71`).
- `BillingAccount` — not audited directly. Implicit through `Client`.

Actions used in this audit's scope:

- `payment.created`, `payment.updated`.
- `receipt.finalized`, `receipt.cancelled`, `receipt.credit_note_issued`, `receipt.allocation_requested`.
- `company_settings.updated`.
- Billing-item CRUD actions (visible in the route files above).

**Concerns:**

1. **No central registry.** Each route hard-codes the string literal. A typo would silently break audit reads.
2. **No `payment.status_changed` action specifically.** A status transition is captured under the generic `payment.updated` with diff. The receipts-audit timeline view can't easily filter "show only status changes" without parsing the diff JSON.
3. **Cancellation reason for receipts is captured in `diff.reason`**, not as a top-level column. Acceptable; document it.

### 8.3 Recommendations

- Move action strings to a `lib/audit/actions.ts` constants module. Import-only; no runtime change.
- Add a `payment.status_changed` action emitted when `status` is in the diff. Keep `payment.updated` for non-status field edits.
- Consider an `entity_type` enum in Postgres (`CREATE TYPE entity_type_enum`) listing the known set. Catches typos via a `CHECK` constraint, doesn't break the polymorphism.

---

## 9. Proposed `FinancialDocument` model

Inbound documents Skyware receives: vendor invoices, bank statements, customs receipts, expense receipts, payroll reports. Not the same as `ReceiptDocument` (which is outbound). The placeholder UI already routes here (`app/(portal)/financial-documents/page.tsx`).

### 9.1 Proposed Prisma model

```prisma
enum FinancialDocumentKind {
  vendor_invoice          // supplier sends us a tax invoice
  vendor_receipt          // supplier issues us a receipt
  bank_statement          // monthly bank statement
  bank_transfer_proof     // proof a client transferred to us
  client_payment_proof    // a different form of the above
  employee_expense        // reimbursement receipt
  fixed_asset_invoice     // capital expenditure receipt
  customs_document        // shipping / import paperwork
  payroll_report          // monthly payroll
  tax_authority_document  // letters, assessments from MsM
  other
}

enum FinancialDocumentDirection {
  inbound    // we received it (default and only value for now)
  outbound   // reserved; we sent it ourselves
}

enum FinancialDocumentStatus {
  uploaded         // file lives in S3, no review yet
  awaiting_review  // an admin opened it but did not finish
  reviewed         // all extracted fields confirmed
  archived         // soft-hidden, kept for retention
}

enum FinancialDocumentSource {
  email_ingestion        // future: auto-pulled from mailbox
  manual_upload          // admin uploaded via UI
  agent_extracted        // future: LLM-extracted from RawEmail
}

model FinancialDocument {
  id                String   @id @default(uuid()) @db.Uuid

  kind              FinancialDocumentKind
  direction         FinancialDocumentDirection @default(inbound)
  source            FinancialDocumentSource    @default(manual_upload)

  // Vendor or counterparty (free-form: we may not know if they are a client).
  vendorName        String?  @map("vendor_name")
  vendorTaxId       String?  @map("vendor_tax_id")
  vendorAddress     String?  @map("vendor_address") @db.Text

  // Document identifiers (best-effort, may be null until reviewed).
  documentNumber    String?  @map("document_number")
  documentDate      DateTime? @map("document_date") @db.Date
  receivedDate      DateTime @default(now()) @map("received_date") @db.Date

  // Money (minor units; same convention as everywhere else).
  currency          Currency @default(ILS)
  amountBeforeVat   Int?     @map("amount_before_vat")
  vatAmount         Int?     @map("vat_amount")
  totalAmount       Int?     @map("total_amount")
  vatRateBasisPoints Int?    @map("vat_rate_basis_points")
  exchangeRate      Decimal? @map("exchange_rate") @db.Decimal(18, 6)

  // Optional links to existing entities.
  clientId          String?  @map("client_id") @db.Uuid
  jobId             String?  @map("job_id") @db.Uuid
  linkedPaymentId   String?  @map("linked_payment_id") @db.Uuid
  linkedReceiptId   String?  @map("linked_receipt_id") @db.Uuid

  // Storage.
  attachmentId      String?  @map("attachment_id") @db.Uuid

  // Workflow.
  status            FinancialDocumentStatus @default(uploaded)
  reviewedByUserId  String?  @map("reviewed_by_user_id") @db.Uuid
  reviewedAt        DateTime? @map("reviewed_at")
  uploadedByUserId  String   @map("uploaded_by_user_id") @db.Uuid

  // Free-form admin notes and the agent's structured extraction.
  notes             String?  @db.Text
  extractedPayload  Json?    @map("extracted_payload") @default("{}")
  ocrText           String?  @map("ocr_text") @db.Text

  client          Client?         @relation(fields: [clientId], references: [id])
  job             Job?            @relation(fields: [jobId], references: [id])
  linkedPayment   Payment?        @relation("PaymentFinancialDocs", fields: [linkedPaymentId], references: [id])
  linkedReceipt   ReceiptDocument? @relation("ReceiptFinancialDocs", fields: [linkedReceiptId], references: [id])
  attachment      Attachment?     @relation(fields: [attachmentId], references: [id])
  reviewedBy      User?           @relation("FinancialDocumentReviewer", fields: [reviewedByUserId], references: [id])
  uploadedBy      User            @relation("FinancialDocumentUploader", fields: [uploadedByUserId], references: [id])

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([status, documentDate(sort: Desc)])
  @@index([clientId])
  @@index([kind, status])
  @@index([linkedPaymentId])
  @@index([linkedReceiptId])
  @@map("financial_documents")
}
```

### 9.2 Index proposal

| Index | Justification |
|---|---|
| `(status, document_date DESC)` | Default list view: "what's awaiting review?" |
| `(client_id)` | Reverse lookup from a client page. |
| `(kind, status)` | "Show all unreviewed vendor invoices." |
| `(linked_payment_id)`, `(linked_receipt_id)` | Reverse joins. |
| `(uploaded_by_user_id, created_at DESC)` partial | If we ever offer "my uploads" page. |
| `gin (ocr_text gin_trgm_ops)` | Free-text search in attached documents. Requires `pg_trgm` (already enabled). |
| `gin (vendor_name gin_trgm_ops)` | Vendor name search. |

### 9.3 Constraints proposal

```sql
-- Money consistency when reviewed.
ALTER TABLE financial_documents
  ADD CONSTRAINT financial_documents_reviewed_vat_sum_chk
  CHECK (
    status NOT IN ('reviewed')
    OR total_amount IS NULL  -- partial OCR allowed
    OR amount_before_vat IS NULL
    OR vat_amount IS NULL
    OR total_amount = amount_before_vat + vat_amount
  );

-- Exchange rate required for non-ILS reviewed rows.
ALTER TABLE financial_documents
  ADD CONSTRAINT financial_documents_reviewed_exchange_rate_chk
  CHECK (
    status NOT IN ('reviewed')
    OR currency = 'ILS'
    OR exchange_rate IS NOT NULL
  );

-- Reviewer/timestamp pairing.
ALTER TABLE financial_documents
  ADD CONSTRAINT financial_documents_reviewer_pair_chk
  CHECK (
    status NOT IN ('reviewed')
    OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  );

-- VAT rate sanity.
ALTER TABLE financial_documents
  ADD CONSTRAINT financial_documents_vat_rate_range_chk
  CHECK (vat_rate_basis_points IS NULL OR vat_rate_basis_points BETWEEN 0 AND 5000);
```

### 9.4 Audit considerations

Add to the audit action vocabulary:

- `financial_document.uploaded`
- `financial_document.reviewed`
- `financial_document.linked_to_payment`
- `financial_document.linked_to_receipt`
- `financial_document.archived`
- `financial_document.kind_updated`

Same `entityType` convention: `"FinancialDocument"`.

### 9.5 Retention

Israeli tax law mandates 7-year retention of accounting documents. Either:

- Store indefinitely in primary DB (cheap for an MSP at expected volume).
- After 7 years, archive to S3 Glacier and soft-delete from the table (status `archived` plus a `archivedAt` column).

Add `retentionUntil DateTime?` to support per-document retention rules (some categories have different periods).

---

## 10. Country toggle — proposed minimal shape

Today `CompanySettings.country` is a free-form `String @default("IL")`. Behavioral rules implicitly assume Israel:

- VAT default 18% (basis points).
- Allocation number ("mispar hakzaa") threshold logic in `lib/receipts/allocation.ts`.
- Receipt language defaults to `"he"`.
- Timezone defaults to `Asia/Jerusalem`.

Two shapes for evolving this:

### 10.1 Option A: enum on `CompanySettings` (minimum change)

```prisma
enum Country {
  IL  // Israel
  // Reserved for future expansion. No live rows expected.
  US
  GB
  CY
}

model CompanySettings {
  // ...
  country  Country  @default(IL)
}
```

Migration:

```sql
CREATE TYPE "Country" AS ENUM ('IL', 'US', 'GB', 'CY');
ALTER TABLE company_settings ALTER COLUMN country DROP DEFAULT;
ALTER TABLE company_settings
  ALTER COLUMN country TYPE "Country" USING country::"Country";
ALTER TABLE company_settings ALTER COLUMN country SET DEFAULT 'IL';
```

The cast from string requires existing rows have one of the enum values; today only `"IL"` is in use, so safe.

### 10.2 Option B: separate `CountryProfile` lookup (more flexible)

```prisma
model CountryProfile {
  id                       String  @id @default(uuid()) @db.Uuid
  code                     String  @unique @db.Char(2)  // ISO 3166-1 alpha-2
  nameEn                   String  @map("name_en")
  nameHe                   String  @map("name_he")
  defaultCurrency          Currency
  defaultVatBasisPoints    Int     @map("default_vat_basis_points")
  defaultLanguage          String  @map("default_language")  // 'he', 'en', etc.
  defaultTimezone          String  @map("default_timezone")
  // Behavior flags.
  requiresAllocationNumber Boolean @default(false) @map("requires_allocation_number")
  taxDocumentRetentionYears Int    @default(7) @map("tax_document_retention_years")
  receiptNumberingMode     String  @default("annual") @map("receipt_numbering_mode") // 'annual', 'continuous'

  companySettings          CompanySettings[]

  @@map("country_profiles")
}

model CompanySettings {
  // ...
  countryProfileId String?         @map("country_profile_id") @db.Uuid
  countryProfile   CountryProfile? @relation(fields: [countryProfileId], references: [id])
}
```

Seed only one row (`IL`) at first. Future countries are migrations.

### 10.3 Recommendation

**Option A** for the next 6 months: a single enum value (`IL`) plus reserved values for the eventual expansion. Zero behavior change. The country-driven branches (VAT default, allocation threshold) stay in code, gated on `country === 'IL'`. The schema gains a typed enum that catches typos.

**Move to Option B** when the second country goes live. The lookup row centralizes the toggle and survives Postgres enum's irreversibility.

Either option is small enough to land in one migration.

---

## 11. Migration hygiene notes

11 migrations under `prisma/migrations/`:

| Migration | Description | Forward-only? | Notes |
|---|---|---|---|
| `20260524000000_init` | Baseline. 852 lines. | Yes. | Standard `prisma migrate diff` output. |
| `20260524000100_partial_indexes` | 3 partial indexes (active TimeSession, israeliTaxId, unread notifications). | Yes. | Uses `IF NOT EXISTS` — idempotent. |
| `20260524000200_fts_trigram_indexes` | `pg_trgm` extension + 5 GIN indexes. | Yes. | `CREATE EXTENSION IF NOT EXISTS` is idempotent but requires superuser on the target DB. Document this. |
| `20260524000300_saved_view_extras` | `is_default` column + partial unique index. | Yes. | |
| `20260524000400_sla_defaults` | New table. | Yes. | |
| `20260524000500_receipt_extras` | `exchange_rate` + `credited_receipt_id` columns, self-FK, index. | Yes. | |
| `20260524000600_receipt_invariants` | Two CHECK constraints on receipts. | Yes. | Uses `DROP CONSTRAINT IF EXISTS` first — idempotent. |
| `20260524000700_company_settings` | New table. | Yes. | |
| `20260524000800_company_settings_singleton` | One CHECK constraint. | Yes. | |
| `20260524001000_recurring_jobs` | New table + enums. | Yes. | |
| `20260524001100_knowledge_articles` | New table + enums. | Yes. | |
| `20260524001150_knowledge_fts` | Tsvector + GIN. | Yes. | |
| `20260524001200_client_health_snapshots` | New table. | Yes. | |
| `20260524001300_saved_view_visibility` | New enum, column, partial unique indexes. | Yes. | |

### 11.1 Strengths

- All migrations are pure `ALTER ... ADD` or `CREATE TABLE / TYPE / INDEX`. No destructive operations.
- Idempotency via `IF NOT EXISTS` and `DROP CONSTRAINT IF EXISTS` patterns.
- Comments at the top of each non-init migration explain intent.
- The two CHECK-constraint migrations leave a comment about which application path also enforces the rule.

### 11.2 Weaknesses

- **No seed migration for `CompanySettings`.** The singleton row is created lazily by `upsertCompanySettings`. A fresh production DB with no admin visit will fail a finalize that needs `getCompanyForReceipts()`. Add a migration:
  ```sql
  INSERT INTO company_settings (id) VALUES ('00000000-0000-0000-0000-000000000001')
    ON CONFLICT (id) DO NOTHING;
  ```
- **No seed migration for `ReceiptDocumentSequence`.** First finalize per `(type, year)` upserts. This is intentional and correct (one row per used type-year), so no fix needed. Document.
- **No down-migrations.** Prisma forward-only by default. Recommend documenting the recovery procedure in `docs/production-readiness.md` (snapshot → restore for any rollback).
- **No comments in init migration.** It's mechanical Prisma output. Acceptable.
- **No test that all migrations apply cleanly to a fresh DB.** A CI job that runs `prisma migrate deploy` on a temp DB would catch ordering bugs early.

### 11.3 Naming gaps to fix in a separate PR

- `HourlyBank.totalHoursPurchasedMinutes` → `totalMinutesPurchased`.
- The `*Placeholder` suffix on money fields.
- These are reversible-rename migrations; pair with the data move.

---

## 12. Recommendations — ranked

### High

H1. **Add FK on `receipt_documents.payment_id → payments.id`** with `ON DELETE SET NULL`. Today the column has no enforcement.

```sql
ALTER TABLE receipt_documents
  ADD CONSTRAINT receipt_documents_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES payments(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX receipt_documents_payment_id_idx
  ON receipt_documents(payment_id);
```

H2. **Add `payments_source_polymorphism_chk`** (SQL in §5.2). Critical for billing integrity.

H3. **Add `receipt_documents_finalized_number_chk`** (SQL in §5.2). Today a `db.update` could finalize without a number.

H4. **Add `hourly_bank_usages_minutes_used_chk CHECK (minutes_used > 0)`.**

H5. **Add seed-migration for the `CompanySettings` singleton row.** SQL in §11.2.

H6. **Pin year boundary** in `reserveNumber` to Asia/Jerusalem. Code-only change in `lib/receipts/finalize.ts`. Same logic but use `date-fns-tz`.

H7. **Add `(linked_receipt_id)` index on `payments`** and `(payment_id)` index on `receipt_documents`.

H8. **Add `exchangeRate` and `exchangeRateSource` columns on `Payment`** for non-ILS payments. Mirror the receipts contract.

### Medium

M1. **Change `receipt_documents.credited_receipt_id` FK from `SET NULL` to `RESTRICT`** so the chain cannot break. Migration:

```sql
ALTER TABLE receipt_documents
  DROP CONSTRAINT receipt_documents_credited_receipt_id_fkey;
ALTER TABLE receipt_documents
  ADD CONSTRAINT receipt_documents_credited_receipt_id_fkey
  FOREIGN KEY (credited_receipt_id) REFERENCES receipt_documents(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

M2. **Change `payments.source_monthly_id` and `source_hourly_id` FKs to `RESTRICT`.** Same pattern. Apply after the polymorphism check is in place.

M3. **Add `PaymentStatusEvent` model** (§2.8). Mirrors `JobStatusEvent`. Reduces audit-log parsing for the payment-timeline UI.

M4. **Add `one_time_job_charges(billing_account_id)` btree index.** Pending since May-24.

M5. **Convert `Currency` to either include `GBP/CHF/CAD` or to ISO 4217 string with check constraint.** §7.2.

M6. **Add `receipt_documents_draft_no_number_chk`.** §5.2.

M7. **Apply Option A for country toggle** — `Country` enum on `CompanySettings`. §10.1.

M8. **Add `cancelledAt`, `cancelledByUserId`, `cancelReason` on `ReceiptDocument`.** Reduce dependence on the audit log for cancellation-history reads.

M9. **Add partial index on `(status = 'finalized', finalized_at DESC)`** for the recent-finalized-receipts list.

M10. **Add `language` enum (`he` / `en` / `both`) for `ReceiptDocument` and `CompanySettings`.**

### Low

L1. Add `payments_amount_when_paid_chk` and `payments_paid_date_when_paid_chk` (§5.2).
L2. Add `hourly_banks_alert_threshold_range_chk` (§5.2).
L3. Add `monthly_billing_items_date_order_chk` (§5.2).
L4. Move audit action strings to `lib/audit/actions.ts` constants (§8.3).
L5. Add `pdfAttachmentId` or `ReceiptAttachment` join table (§2.12).
L6. Add `sentAt` / `sentToEmail` on `ReceiptDocument` (§2.9).
L7. Add `usedMinutesCache Int` on `HourlyBank` with a write-through hook (§2.4).
L8. Add `next_number > 0` check on `receipt_document_sequences` (§6.2).
L9. Add `taxYearStartMonth` / `taxYearStartDay` on `CompanySettings` (§2.11).
L10. Add `sha256` on `Attachment` for dedupe (§2.12).
L11. Rename `HourlyBank.totalHoursPurchasedMinutes` → `totalMinutesPurchased`.
L12. Drop the `Placeholder` suffix from money columns once accountant signs off.
L13. Add CI test that runs all migrations on a clean DB.
L14. Document the `pg_trgm` superuser requirement in `docs/production-readiness.md`.

---

## Handoff to PM

**Top 3 schema risks blocking the billing / receipts / financial-documents production rollout:**

1. **`receipt_documents.payment_id` has no FK constraint.** The column is declared on `receipt_documents` and the relation is defined in Prisma at `ReceiptDocument.paymentId`, but the init migration `20260524000000_init` (lines 791-794) declares only the `client_id` and `finalized_by_user_id` FKs on `receipt_documents`. The reverse FK on `payments.linked_receipt_id → receipt_documents.id` exists, but the forward `receipt_documents.payment_id → payments.id` does not. This means `lib/receipts/credit-note.ts:39` can persist a receipt with `paymentId` pointing to a non-existent payment without error. Add the FK (`H1` in §12) before the receipts module enables for real. Cost: one short migration.

2. **`payments` has no polymorphism check constraint.** `Payment.sourceType` and the two source FKs (`sourceMonthlyId`, `sourceHourlyId`) can be inconsistent. The `SET NULL` cascade on the FKs makes this worse: deleting a `MonthlyBillingItem` leaves the payment with `sourceType = 'monthly'` and `sourceMonthlyId = NULL`, an internally inconsistent state. The May-24 audit §3.4 sketched the SQL. Phase 3 did not add it. Combined with the missing FK above, the billing source of truth is partially application-only. Add `payments_source_polymorphism_chk` (`H2` in §12) and either change the SET NULLs to RESTRICT or run a data-fix to clean up existing inconsistent rows. Cost: two migrations, one for the constraint and one for the FK behavior change.

3. **`FinancialDocument` is not in the schema** despite the page being live (gated by feature flag). When the inbound-document flow turns on, every aspect of the workflow — file upload, OCR storage, vendor identification, payment linkage, accountant review — needs schema. Section 9 of this audit provides a full proposed model with indexes and check constraints. The model touches `Attachment`, `Payment`, `ReceiptDocument`, `Client`, `Job`, and `User`, so the migration is non-trivial. Plan it as a single PR with the schema, the routes, and the contract tests. Cost: one substantial migration plus the supporting API layer.

Two additional risks worth tracking but not blocking pilot:

- **`Payment` lacks an `exchangeRate` column** while `ReceiptDocument` has one. If a USD payment lands before this is fixed, no ILS equivalent is recorded; the receipt-side rate cannot back-fill payments. Recommended: add the column and the same finalize-time check (`H8`).
- **The `CompanySettings` singleton row is not seeded by a migration.** A fresh DB will accept a finalize attempt but render a receipt with no company name (because `getCompanyForReceipts` returns null). Recommended: add the seed-migration (`H5`).
