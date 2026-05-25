# Financial Documents module audit

Audit date: 2026-05-25
Branch: `claude/friendly-swanson-71ed53`
HEAD: `18d880b feat(phase-3): post-pilot expansion - SLA automation, attachments, receipts, recurring jobs, KB, health snapshots`
Scope: the `/financial-documents` subsystem only. Israeli compliance specifics (retention years, allocation numbers, VAT-input reporting) are referenced and forwarded to the Israel-compliance auditor.

## 1. Executive summary

The Financial Documents module exists as a single 449-line server page at `app/(portal)/financial-documents/page.tsx`. It is a well-written but fully decorative placeholder. There is no backing data model, no API route, no `lib/financial-documents/*`, no ingestion connector, no upload UI, and no test coverage. The page is admin-only at the page level (`isAdmin(user)` redirect) and at the sidebar level (`adminOnly: true`). A feature flag `financial_documents_module` exists in the DB fixture, default `false`, but the page renders identically whether the flag is on or off; the flag only toggles a status badge and a "module disabled" banner. There is no enforcement that would prevent a future ingestion endpoint from running when the flag is off, because no such endpoint exists.

The most important conceptual point: Financial Documents are inbound (supplier invoices, payment confirmations, bank statements that Skyware receives). The Receipts module is outbound (tax invoices and receipts Skyware issues). The two systems share zero rows, and the page already states this in the "Read this before the module goes live" notice at line 166. This boundary must be preserved in any future implementation, including in nav copy and onboarding.

Phase 3 §5.3 shipped a generic S3-backed `Attachment` model (`prisma/schema.prisma:791-808`) with join tables for jobs, posts, and replies. The Attachment model is a near-perfect substrate for the file-storage half of a future `FinancialDocument`, but the existing `AttachmentUploader` component is hard-coded to three parent kinds (`job` | `post` | `reply` in `components/attachments/AttachmentUploader.tsx:10-13`), so wiring it to a financial document requires a fourth parent kind plus a new join table.

Recommendation envelope: keep the placeholder visible (the page reads as documentation, which is honest), but freeze its evolution behind a separate "implementation start" decision. A minimum viable V1 is one screen, one upload, one classify dropdown, one review checkbox, and a search box, all backed by a new `FinancialDocument` row and a `FinancialDocumentAttachment` join row. Email ingestion, OCR, and auto-classify are explicitly Phase 4-plus and should not be promised to the pilot.

## 2. As-built page state

File: `app/(portal)/financial-documents/page.tsx` (450 lines including the closing newline).

### Header and gating

- Lines 111-116: server component, awaits `auth()`, redirects unauthenticated to `/login`, then casts to `SessionUser` and redirects non-admins to `/dashboard`. This matches the page guard pattern used by `/receipts`, `/billing`, `/clients`, `/admin`, and `/statistics`. The middleware does not enforce admin-only; the page does.
- Line 117: `const isEnabled = await getFeatureFlag("financial_documents_module");`. The flag read is cached only via the existing `getFeatureFlag` implementation, which the backend audit notes is uncached on the server. One DB roundtrip per page load.
- Lines 121-126: `PageHeader` with `FileText` icon, the long static description string, and a `<ModuleStatusBadge enabled={isEnabled} />` action chip (green dot when on, gray when off — lines 366-381).

### Sections in render order

1. **Disabled banner** (lines 129-141). Only renders when `!isEnabled`. Shows the literal flag key `financial_documents_module` and a link to `/admin?tab=flags`.
2. **Safety / compliance notice** (lines 144-171). Four bullets in a warn-tinted card: (a) no real ingestion connected, (b) do not paste credentials, (c) every document must be admin-reviewed, (d) issuance lives in the separate Receipts module.
3. **Planned workflow** (lines 174-202). Renders `WORKFLOW` (lines 82-88) as a 5-step grid: Receive, Classify, Link, Review, Archive.
4. **Document categories** (lines 205-231). Renders `CATEGORIES` (lines 32-80) as a 7-card grid. Each card has icon, title, description, and a `related` line that points at another module or "future" surface.
5. **Filters & search** (lines 234-281). A `pointer-events-none select-none` decorative grid. Reads `FILTER_FIELDS` (lines 90-99) plus a hardcoded "Search" field. All inputs are visibly disabled. Footer copy at line 278-280 promises URL-driven server-rendered filters "matching the pattern used by Billing and My Jobs."
6. **Ingestion preview** (lines 284-304). Two `IngestionTile` cards (helper at lines 394-421): Email ingestion ("Not connected") and Manual upload ("Not available").
7. **Documents list placeholder** (lines 307-341). Renders a table head with `TABLE_COLUMNS` (lines 101-109): Document, Type, Source, Linked to, Received, Review, Action. One row with an `EmptyState` colspan placeholder.
8. **Related areas** (lines 344-359). Four `RelatedLink` tiles (helper at lines 423-448): `/clients`, `/billing`, `/receipts`, `/admin?tab=flags`. Footer line 355-358 points at `docs/production-readiness.md`.

### What is real vs mockup

| Element | Real | Mockup |
|---|---|---|
| Auth + admin guard | yes | — |
| Feature flag read | yes | — |
| `ModuleStatusBadge` reflecting flag | yes | — |
| Disabled-when-off banner | yes | — |
| Compliance notice copy | static | — |
| 5-step workflow tiles | — | mockup |
| 7 category cards | — | mockup |
| Filters grid | — | mockup (`pointer-events-none`) |
| Ingestion tiles | — | mockup ("Not connected" / "Not available") |
| Documents table | — | empty state, no query |
| Related links | yes (routes exist) | — |

The page intentionally does NOT use the `placeholders.financialDocuments` i18n string at `lib/i18n/he.json:215` and `lib/i18n/en.json:215`. Those strings are dead, as already flagged in `docs/audit-2026-05/unfinished_tasks_audit.md` lines 154 and 236.

### Behaviors not implemented

- No `loading.tsx` for this route.
- No `error.tsx`.
- No request to `/api/financial-documents/*` (no such endpoint exists; verified by `find app/api -name "*financial*"` returning nothing).
- No tests in `tests/` reference the page or the flag for behavior; only `tests/unit/billing-permissions.test.ts:42` asserts that `financial-documents` is admin-only.

## 3. Data model: none today; proposed shape

### Today

Confirmed by `grep "FinancialDocument" prisma/schema.prisma` returning zero matches. There is no `FinancialDocument`, no `RawEmail`, no `FinancialDocumentAttachment`, no `FinancialDocumentLink`, no enums for ingestion type or review status. The schema-wide audit owns broad critique; here I propose only the minimal shape this module needs.

### Proposed minimal shape for V1

A single new model carries 80 percent of the value. Field choices below align with patterns already in the schema (uuid IDs, snake_case column mappings, `@db.Uuid`, soft references to `User`).

```
model FinancialDocument {
  id                    String   @id @default(uuid()) @db.Uuid

  // Source and type
  source                FinancialDocumentSource           // manual_upload | email_forward | api_import
  kind                  FinancialDocumentKind             // see Section 7
  status                FinancialDocumentStatus @default(needs_review)  // needs_review | reviewed | archived | not_relevant

  // Soft links to existing entities (all nullable - the matcher may not find one)
  clientId              String?  @map("client_id") @db.Uuid
  jobId                 String?  @map("job_id") @db.Uuid
  paymentId             String?  @map("payment_id") @db.Uuid
  linkedReceiptId       String?  @map("linked_receipt_id") @db.Uuid     // see Section 4

  // Extracted business fields (admin-editable)
  vendorName            String?  @map("vendor_name")
  documentNumber        String?  @map("document_number")
  documentDate          DateTime? @map("document_date") @db.Date
  receivedAt            DateTime @default(now()) @map("received_at")
  currency              String   @default("ILS")
  amountMinorUnits      BigInt?  @map("amount_minor_units")     // agorot for ILS
  vatAmountMinorUnits   BigInt?  @map("vat_amount_minor_units") // input VAT, flagged for accountant export
  vatRate               Decimal? @db.Decimal(5, 2) @map("vat_rate")

  // File (link to the existing Attachment row)
  attachmentId          String?  @map("attachment_id") @db.Uuid

  // Review audit
  reviewedByUserId      String?  @map("reviewed_by_user_id") @db.Uuid
  reviewedAt            DateTime? @map("reviewed_at")
  notes                 String?  @db.Text

  // System audit
  createdByUserId       String   @map("created_by_user_id") @db.Uuid
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  // Relations (the matching cross-side relations are omitted here for brevity)

  @@index([clientId, documentDate(sort: Desc)])
  @@index([status, receivedAt(sort: Desc)])
  @@index([kind, documentDate(sort: Desc)])
  @@map("financial_documents")
}
```

Plus a join table reusing the existing `Attachment` model:

```
model FinancialDocumentAttachment {
  financialDocumentId String @map("financial_document_id") @db.Uuid
  attachmentId        String @map("attachment_id") @db.Uuid

  @@id([financialDocumentId, attachmentId])
  @@map("financial_document_attachments")
}
```

Notes on shape choices:

- Amounts in minor units (BigInt agorot) matches the precedent in receipts / payments. Confirm with the DB auditor that minor-unit BigInt is the existing convention before locking; if Decimal is used elsewhere, mirror that.
- `linkedReceiptId` exists only for the narrow case where an inbound payment confirmation matches a Skyware-issued receipt (`docs/internal-management-portal-spec.md:618`). It is nullable and not the primary linker.
- `notes` is free-text so admins can record corrections from auto-classify without re-uploading.
- A `RawEmail` model is intentionally NOT proposed for V1. Email ingestion is Phase 4 work.
- A `FinancialDocumentStatusEvent` history table is intentionally NOT proposed for V1; the single `reviewedByUserId / reviewedAt` pair plus the existing `AuditLog` covers the audit need without scope creep. Add a status event table only when bulk-edit flows arrive.

## 4. Conceptual boundary vs receipts and billing

This boundary is the single biggest source of confusion in the spec, and the page already calls it out (line 166-167). Restating for the synthesis PM:

| | Receipts module | Financial Documents module |
|---|---|---|
| Direction | outbound (we issue) | inbound (we receive) |
| Legal weight | each row is a Tax Authority document | each row is a record of someone else's document |
| Mutation | finalize is irreversible | edit / re-classify any time before archive |
| Numbering sequence | required (per type, per year) | not required (vendor's own number is captured) |
| VAT side | output VAT (we owe) | input VAT (we can offset) |
| Owner of correctness | accountant + Tax Authority rules | bookkeeper review |
| Allocation numbers (מספרי הקצאה) | may apply at issuance | not the same problem |
| Storage retention | mandatory long term | mandatory long term (same accounting law) |
| Hard delete | disallowed once finalized | disallowed once reviewed; logical archive only |

Two narrow points of contact:

1. A `FinancialDocument` of `kind = client_payment_confirmation` can be tied to a Skyware-issued `ReceiptDocument` via `linkedReceiptId`. This is rare and a convenience, not a hard requirement.
2. A `FinancialDocument` of `kind = supplier_invoice` for a tool used to deliver a job could later be linked to a `Job.id` or an internal cost rollup. This is reporting, not legal.

The boundary should be reinforced in three places:

- Sidebar copy already keeps them as separate menu items.
- The "Related areas" tile (`/financial-documents` line 350-354) correctly points at `/receipts` with the hint "Accountant-verified module" — a tiny but clear UX signal.
- Future bulk actions must NEVER include "convert to receipt" as a one-click option, because the legal models differ.

## 5. Ingestion paths considered in the spec

From `docs/internal-management-portal-spec.md` Section 13 (lines 579-624) and the implementation-ready spec Section 14:

| Path | Source spec line | Realistic timeline |
|---|---|---|
| Manual upload (PDF, image, .eml) | spec 5.10 + page line 299-302 | V1, days of work |
| Email forward into a dedicated mailbox | spec line 595 | Phase 4 or 5; requires mailbox + OAuth + IMAP polling + headers store |
| LLM-assisted auto-classify with deterministic fallback | spec line 597 | Phase 5; tied to extraction quality and budget |
| OCR text extraction from PDF/image | spec phasing line 791 | Phase 4-5; off-the-shelf or model API |
| Heuristic linker to Client / Job / Payment | spec line 599 + line 792 | Phase 4-5; depends on extraction |
| Agent-driven supplier-receipt draft | spec line 645 | Phase 7+ (Agent Control Center) |

The page currently advertises only the first two (`IngestionTile` lines 291-303). Both are marked "Not connected" / "Not available." This is honest; do not over-promise the other paths in the V1 release.

The pre-audit note ("The Phase 1 audit says ingestion is deferred") is confirmed in two places: `frontend_ux_audit.md:48` ("0% functional, 100% UX") and `unfinished_tasks_audit.md:186` ("Decorative placeholder with workflow + filters preview"). Nothing has changed during Phase 2 or 3 — `find app/api -name "*financial*"` returns zero matches at HEAD.

## 6. Connection to attachment storage

Phase 3 §5.3 shipped a generic S3-backed `Attachment` table (`prisma/schema.prisma:791-808`) gated by `attachments_enabled`. The existing surface area:

- Model: `Attachment` with `storageKey`, `fileName`, `mimeType`, `byteSize`, `uploadedByUserId`, `visibility` (`public_in_org` | `admin_only`).
- Three join tables: `JobAttachment`, `PostAttachment`, `ReplyAttachment` (lines 810-841).
- API: `POST /api/attachments` allocates a row + returns a presigned PUT URL; `GET /api/attachments/[id]` presigns a read URL; resource-specific link endpoints under `/api/jobs/...`, `/api/channels/...`.
- Component: `components/attachments/AttachmentUploader.tsx` lines 10-13 expose a discriminated union of three parent kinds: `job`, `post`, `reply`.
- Policy: `lib/storage/upload-policy.ts` allows images, PDFs, Office formats, text, and zip up to 50 MB. PDFs and images cover the realistic supplier-document set.
- Visibility check: `lib/storage/attachments.ts` `canReadAttachmentVisibility` already supports `admin_only`. Financial documents should default to `admin_only` because the page is admin-only.
- Flag: `attachments_enabled` is required for every attachment API call. NOTE: this flag is NOT present in `prisma/fixtures/feature-flags.json` (15 keys, none is `attachments_enabled`). The flag must be inserted by another path (seed-script, migration data, or manual admin step) for attachments to function at all. This is a separate Phase 3 finding to forward to the backend auditor; the financial-documents module inherits the same problem the moment it tries to upload.

### Smallest viable wiring

1. Add a `FinancialDocument` row creation endpoint, e.g. `POST /api/financial-documents`. Body accepts `attachmentId` already returned from `POST /api/attachments` (this requires `attachments_enabled = true`).
2. Insert a fourth parent kind in `AttachmentUploader`: `{ kind: "financial_document"; financialDocumentId: string }` and a new link endpoint `POST /api/financial-documents/[id]/attachments` mirroring the job link pattern in `app/api/jobs/[id]/attachments/route.ts`.
3. New join row: `FinancialDocumentAttachment`. The upload UI does not need to differ from the job-attachment flow; the model is the same.
4. Render the linked attachment in the documents-list table using the existing `AttachmentList` and `AttachmentItem` components from `components/attachments/`.
5. Both flags must be on for the surface to work: `financial_documents_module` AND `attachments_enabled`. The page should explicitly show both states in the disabled banner once wired.

Total estimate for the smallest wiring: one new model, two endpoints, a discriminator addition in one component, no new storage primitive.

## 7. Categories

Verbatim from `CATEGORIES` (lines 32-80), mapped to typical Israeli business document types:

| # | Page title | Page description | Page `related` line | Typical Israeli document |
|---|---|---|---|---|
| 1 | Client payment confirmations | Bank or app-issued acknowledgements that a client paid an invoice. | Links to Billing → Payments | Bit / PayPal / Cardcom payout email, bank deposit notification, `אסמכתא` |
| 2 | Supplier invoices | Invoices issued by vendors, contractors, and service providers. | Future suppliers ledger | חשבונית מס issued to Skyware by a supplier |
| 3 | Supplier receipts | Receipts issued by suppliers after we pay them. | Future suppliers ledger | קבלה issued to Skyware |
| 4 | Company expenses | Internal expense receipts — meals, hardware, travel, office. | Bookkeeping export | Employee reimbursement receipts, אסמכתא |
| 5 | Subscription receipts | Recurring SaaS and infrastructure billing receipts. | Cost-of-tools tracking | Stripe, AWS, Microsoft 365, Vercel monthly invoices |
| 6 | Tax documents | Tax authority correspondence, statements, and certificates. | Reviewed by accountant | רשות המסים statements, אישור ניכוי מס במקור |
| 7 | Bank transfer confirmations | Bank-issued confirmations of incoming or outgoing transfers. | Reconciled against payments | Bank wire confirmation, SWIFT message |

Notes for the spec lock-in:

- Category 1 (client payment confirmation) is the only category that ties back to billing. It should be the first wired in V1 because it closes a real loop.
- Categories 2 and 3 (supplier invoice + supplier receipt) are different documents but for the same transaction. The model needs both kinds — do not collapse.
- Category 5 (subscription receipts) is high-volume and a strong candidate for the eventual email-forward path because vendors send these on a predictable cadence and from known senders.
- Category 6 (tax documents) should default `visibility = admin_only` even within the admin-only page; if you later open Finance Manager as a non-admin role, tax docs stay narrower.
- The seven labels are pilot-quality. Add a free-text `notes` field on the model so admins can record corrections when the auto-classify is wrong.

## 8. Permissions

Triple-gated by intent, single-enforcement in practice:

- Sidebar visibility: `components/layout/Sidebar.tsx:68` — entry is `adminOnly: true`. Non-admins do not see the link.
- Page guard: `app/(portal)/financial-documents/page.tsx:115` — `if (!isAdmin(user)) redirect("/dashboard");`.
- Permission constant: `lib/permissions.ts:95,105` lists `financial-documents` in the `PortalPage` union and `ADMIN_ONLY_PAGES` set. `canAccessPage` returns admin-only for it.
- Unit test: `tests/unit/billing-permissions.test.ts:42` asserts the page sits in the admin-only set.

There is no role between "employee" and "admin" today. The spec mentions a future Finance Manager concept (line 65 of the legacy spec) but no role exists in code. When V1 lands, the page-level guard should be replaced with a `canViewFinancialDocuments(user)` helper so the future split is one-line cheap.

API-level enforcement does not exist yet because no API exists. Every future endpoint must:

- Call `requireAuth()` (existing helper).
- Reject non-admins with 403 (or a future role check).
- Read the `financial_documents_module` flag and 503 when off, mirroring how `app/api/attachments/route.ts:31-37` handles `attachments_enabled`.

## 9. Search and filter requirements

The disabled preview at lines 90-99 declares eight filter fields plus a search box:

| Field | Kind | Server-side cost |
|---|---|---|
| Client | select | small (existing `client` list query) |
| Supplier | select | requires distinct-vendor pull from `FinancialDocument` |
| Document type (kind) | select | enum-backed, cheap |
| From / To | date range | indexed on `documentDate` |
| Review status | select | enum-backed, cheap |
| Linked | select | derived: any of `clientId`/`jobId`/`paymentId` populated |
| Source | select | enum-backed, cheap |
| Search | full text | needs FTS or trigram on `vendorName`, `documentNumber`, `notes` |

The page footer at line 278-280 commits to URL-driven server-rendered filters matching `/billing` and `/my-jobs`. That pattern is already proven in this codebase (see Phase 2 §4.9 for FTS — `fts_search_enabled` flag plus search FTS migrations `prisma/migrations/20260524000200_fts_trigram_indexes`). Reuse it; do not invent a different filter contract.

For V1, ship five of the eight filters: Client, Document type, From, To, Review status, plus the search box. Supplier, Linked, and Source can wait one release. The search box should target `vendorName + documentNumber + notes` only; OCR text and email body are Phase 4.

## 10. Feature flag state

- Key: `financial_documents_module` (`prisma/fixtures/feature-flags.json:8`).
- Default: `false` (line 9).
- Description: "Show the Financial Documents ingestion page (Phase 3 feature)." This description is now incorrect at HEAD — Phase 3 shipped without it. Either update the description to "Phase 4" or drop the phase reference.
- Behavior: the page renders regardless. The flag only swaps `ModuleStatusBadge` color and shows or hides the dashed "module disabled" banner. There is no surface that disappears entirely when off.
- Companion flag needed: `attachments_enabled`. Confirmed in code at `app/api/attachments/route.ts:31` and other attachment routes, but absent from the JSON fixture. Cross-reference with the backend auditor; this is the same gap I noted in §6.

When V1 ships, the flag should change semantics: gate the page entirely (return 404 or render a hard placeholder when off), gate the API endpoints with 503 like attachments already does, and gate the sidebar entry conditionally.

## 11. Israel-specific concerns to forward to the compliance auditor

These are flagged here only so they appear in the synthesis. The Israel compliance auditor owns the actual research.

1. **Retention period for inbound accounting records.** The spec at `internal-management-portal-spec.md:572` cites a common 7-year figure with the explicit "needs accountant verification" caveat. The model must support logical archive only; no hard delete. Set `status = archived` rather than removing rows.
2. **Input VAT capture and reporting.** Each supplier invoice and supplier receipt carries `vatAmountMinorUnits` and `vatRate` that flow into the company's input-VAT side of the Doch Maam report. The model holds the data, but the export pipeline (presumably accountant-side) is out of scope for V1.
3. **Allocation numbers (מספרי הקצאה) on inbound invoices.** From 2026 onward, tax invoices above the rolling threshold may be invalid for VAT deduction by the recipient without an allocation number issued by the supplier. Capture an `allocationNumber` (nullable string) when present; we are the receiver here so we do not request the number ourselves, but our accountant will need it for the VAT report.
4. **Hebrew PDFs and RTL.** Stored attachments are PDFs and images; no rendering risk because we display the original. Search-box behavior must handle Hebrew tokens; trigram indexes are preferable to plain `tsvector` for Hebrew. Coordinate with the Phase 2 FTS choice.
5. **Bilingual documents.** Some supplier invoices are Hebrew-only, some bilingual. The `vendorName` field should accept either alphabet; ensure UTF-8 throughout the stack (already true for receipts).
6. **Foreign-currency invoices.** AWS, Stripe, Microsoft, Vercel bill in USD or EUR. `currency` defaults to ILS but accepts ISO 4217. The accountant export may need an ILS conversion at a Bank of Israel rate on `documentDate`. Out of scope for V1 capture, in scope for V2 export.
7. **Data residency.** The S3 bucket is configured via `S3_ENDPOINT` and `S3_REGION` (`lib/storage/s3.ts:22-30`). No constraint forces an Israeli region. If the accountant or the firm has a data-residency requirement, confirm bucket region before any production rollout.

## 12. Recommendations (ranked)

### High

1. **Lock the boundary in product copy.** Reinforce that Financial Documents are inbound and Receipts are outbound. Currently strong in the page itself, weaker in the spec docs. PM should set a single sentence and reuse it across docs, sidebar tooltip, admin onboarding.
2. **Update the `financial_documents_module` fixture description.** "Phase 3 feature" is wrong at HEAD; the module did not ship in Phase 3. Change to "Phase 4" or drop the phase number. `prisma/fixtures/feature-flags.json:10`.
3. **Seed `attachments_enabled` in the fixture.** Critical for the V1 wiring; today the attachment flag is read everywhere but seeded nowhere. Forward to the backend auditor, but note it blocks Financial Documents V1.
4. **Defer email ingestion explicitly.** The page currently shows two ingestion tiles; for V1, ship Manual upload and demote the Email tile to a "Planned" caption only. This sets expectations correctly.

### Medium

5. **Adopt the proposed minimal `FinancialDocument` model in Section 3.** One model, one join row, no new storage primitive. Keep nullable links because the linker is heuristic.
6. **Replace `isAdmin(user)` with a `canViewFinancialDocuments(user)` helper.** Same behavior today, one-line ready when a Finance Manager role appears.
7. **Wire the flag end-to-end.** When V1 ships, the flag should gate the page (404 when off), the sidebar entry (hidden when off), and every API endpoint (503 when off). Mirror the `attachments_enabled` pattern.
8. **Stand up `loading.tsx` and `error.tsx` siblings** when V1 lands. The route currently has neither; this would diverge from the Phase 2 `loading.tsx` scaffolding pass on other routes.
9. **Reuse the existing FTS / trigram migration approach** for the search box. Do not invent a new search index per category.

### Low

10. **Drop or wire the dead i18n strings.** `placeholders.financialDocuments` at `lib/i18n/he.json:215` and `lib/i18n/en.json:215` are unused. Either delete or wire to the disabled-banner copy.
11. **Add a tiny test that asserts the page is admin-only and the flag-off banner renders.** A regression hedge for free.
12. **Trim the page to ~250 lines** by replacing the static `WORKFLOW`, `CATEGORIES`, `FILTER_FIELDS` arrays with one collapsed "Planned design" panel once V1 ships and real content takes their place.

## Handoff to PM

### Top 3 must-haves for a working V1

1. **Manual upload + `FinancialDocument` row + admin review checkbox.** One upload, one classify dropdown (the seven categories), one save, one review action. This delivers actual operator value within one sprint and proves the model.
2. **The two-flag gate enforced everywhere.** `financial_documents_module` AND `attachments_enabled` on every API and on the page itself, mirroring how attachments already enforce. Today the placeholder page leaks past the flag.
3. **Soft links to Client / Job / Payment** as nullable fields on `FinancialDocument`, with a small "Link to" picker in the admin review action. This is the smallest piece that makes the data useful for downstream accountant export and is the single feature most likely to be requested in pilot feedback.

### Top 3 to defer

1. **Email ingestion (mailbox watcher, OAuth, IMAP, `RawEmail` storage).** Phase 4 minimum. The infrastructure cost and the operational surface of a credentials vault dwarf the value compared to manual upload. The current page already says "Not connected" — keep saying so.
2. **OCR and LLM auto-classify / extract.** Phase 4-5. Useful only after manual flow is operational and the team has a baseline of how often classify is wrong.
3. **Heuristic linker** between `FinancialDocument` and existing `Client` / `Job` / `Payment` rows. Defer until V1 has a corpus to test against; for V1 the admin types the link manually using the same picker pattern already used in Billing.
