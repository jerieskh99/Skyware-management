# Knowledge System Database Schema Plan

Sprint: Knowledge System hardening, 2026-05
Author: Senior Database Architect (planning sprint, no code changes)
Status: PROPOSAL. Forward-only, no destructive changes.

This document is the data-foundation deliverable for the Knowledge System sprint. It does not write code or migrations. It plans the next migration set required to support the six article kinds, the six-step review workflow, structured AI snapshots, version history, cross-references, and external-reference reliability tracking.

Wherever an existing model is referenced, the file path and line range are cited so the implementer can locate the source. Citations point at `/Users/jeries/Desktop/projects/Skyware-management/.claude/worktrees/friendly-swanson-71ed53/prisma/schema.prisma` (the active worktree schema) and the matching migration files under `prisma/migrations/`.

## Glossary used in this document

- "kind" is the new column that classifies the article into one of the six required types. The Prisma enum is `KnowledgeArticleType`.
- "raw input" is whatever the worker originally submitted, before the LLM rewrote it. It is stored verbatim and never replaced.
- "AI-structured snapshot" is the LLM rewrite at the moment the worker finishes the task. It is also immutable once captured; further edits live in revisions.
- "review cycle" is one full round of `pending_review` -> decision. A given article may have several review cycles if a reviewer requested changes and the author resubmitted.

## 1. Existing model audit

This section walks every field on the Phase 3 KnowledgeArticle / KnowledgeArticleTag / supporting enums and records the verdict on each: keep as-is, evolve (semantics or constraints change), or replace.

Source files for this audit:
- `prisma/schema.prisma` lines 1029-1085 (current `KnowledgeArticleStatus`, `KnowledgeArticleVisibility`, `KnowledgeArticle`, `KnowledgeArticleTag`).
- `prisma/migrations/20260524001100_knowledge_articles/migration.sql` lines 1-60 (the create-table migration that shipped in Phase 3 W5.6).
- `prisma/migrations/20260524001150_knowledge_fts/migration.sql` lines 1-7 (trigram indexes for title and body).

### 1.1 enum KnowledgeArticleStatus (schema.prisma line 1029-1033)

Current values: `draft`, `published`, `archived`. Three values.

Verdict: EVOLVE.

The sprint requires six statuses to model the actual workflow:
- `draft` keeps its current meaning.
- `ai_structured` is new. Set automatically the moment the LLM produces the structured snapshot. The article is not yet considered submitted for review; the author is expected to confirm or edit.
- `pending_review` is new. Author has submitted, reviewer has not yet acted.
- `approved` is new. Reviewer has approved but the article is not yet visible to the broad audience. Allows a publishing window (scheduled go-live, batch publish, or a "soak" period).
- `published` keeps its current meaning. Article is searchable by all readers under its visibility rules.
- `archived` keeps its current meaning. Soft-deleted from list and search views.

Migration strategy for the enum widening lives in section 3 (Migrations strategy). Backfill is trivial: every existing row stays on its current value because the three legacy values are a subset of the new six.

### 1.2 enum KnowledgeArticleVisibility (schema.prisma line 1035-1040)

Current values: `internal`, `admin_only`.

Verdict: EVOLVE (small expansion, see section 6 for the proposal).

The current binary is too coarse once external_reference articles join the table. We may want a department-scoped visibility tier for sensitive runbooks or process notes that should not leak to other departments. Section 6 holds the rationale; the proposal there is to add `department_only` and to keep `internal` and `admin_only` unchanged.

### 1.3 model KnowledgeArticle, field by field (schema.prisma line 1042-1072)

| Column | Current type | Verdict | Notes |
| --- | --- | --- | --- |
| `id` | `uuid pk` | KEEP | No change. |
| `slug` | `text unique` | KEEP | Slug remains the public identifier. URL stability matters; `updateArticle` already keeps the slug unless `regenerateSlug` is set (see `lib/knowledge/queries.ts` line 192 and lines 224-232). |
| `title` | `text` | KEEP | |
| `body` | `text` | KEEP | This is the "current" body. Historical bodies live in `KnowledgeArticleRevision` (section 2d). |
| `summary` | `nullable text` | EVOLVE | Will become required for `external_reference` (a 2-4 sentence summary is a sprint requirement). Today it is purely optional. Migration leaves the column nullable at the database layer; the application layer enforces "required for kind = external_reference" because not every kind requires a summary and old rows must keep working. |
| `status` | `KnowledgeArticleStatus default draft` | EVOLVE | Enum widens to six values. See section 1.1 and 3.1. |
| `visibility` | `KnowledgeArticleVisibility default internal` | EVOLVE | Enum widens by one value. See section 1.2 and 6. |
| `authorUserId` | `uuid fk users.id, RESTRICT` | KEEP | Author is the original writer. Restrict delete is correct: we never want to lose authorship. |
| `lastEditedByUserId` | `nullable uuid fk users.id, SET NULL` | KEEP | Current code paths update this on every edit, archive, publish, unpublish (`lib/knowledge/queries.ts` lines 220-222, 293-295, 322-323, 348-349, 367-371). Stays. |
| `publishedAt` | `nullable timestamp(3)` | KEEP | First-publish timestamp. Already preserved across unpublish cycles via `existing.publishedAt ?? new Date()` (`lib/knowledge/queries.ts` line 293). |
| `relatedClientId` | `nullable uuid fk clients.id, SET NULL` | KEEP | Stays. The "this article is about client X" hint is still useful for internal lessons. |
| `createdAt` | `timestamp default now()` | KEEP | |
| `updatedAt` | `timestamp @updatedAt` | KEEP | |

The `@@index([status, updatedAt(sort: Desc)])` (schema.prisma line 1069) and `@@index([relatedClientId])` (schema.prisma line 1070) stay. Section 4 (Indexes) adds new ones rather than removing existing.

### 1.4 model KnowledgeArticleTag (schema.prisma line 1076-1085)

| Column | Verdict | Notes |
| --- | --- | --- |
| `articleId` | KEEP | |
| `tagId` | KEEP | |

Verdict: KEEP. The join table reuses the existing `Tag` model (schema.prisma line 401). No structural change required. The only addition section 4 proposes is an index on `tag_id` so "list articles with tag X" stays fast as the table grows (currently the composite PK on `(article_id, tag_id)` only covers the leading column).

### 1.5 enum LanguagePref (schema.prisma line 25-28) and CountryCode (schema.prisma line 195-198)

Not on the article today. The article inherits the viewer's `User.languagePref` rather than carrying its own language. Verdict: REVISIT in section 8 for the multi-country/multi-language placeholder.

### 1.6 Migration alignment

The existing create-table migration (`prisma/migrations/20260524001100_knowledge_articles/migration.sql`) is consistent with the schema. The FTS migration (`prisma/migrations/20260524001150_knowledge_fts/migration.sql`) adds trigram GIN indexes on `title` and `body`. We will extend trigram coverage to two additional columns in section 5.

### 1.7 Audit log integration

`writeAudit` is already called on create, update, publish, archive, unpublish, delete, tag-attach, tag-detach (`lib/knowledge/queries.ts` lines 171, 266, 298, 326, 354, 374, 395, 412). Verdict: KEEP and EXTEND. The new mutations introduced by this sprint (kind change, AI structuring run, review decision, version snapshot, last-verified bump, archive-with-reason, reference add/remove) all need analogous audit lines but those are application-layer concerns and not part of this schema doc.

### 1.8 Notification integration

`lib/notifications/triggers.ts` provides three writers today: `notifyJobAssigned`, `notifyMention`, `notifySlaBreached`. The fan-out shape is uniform: a kind string on `NotificationKind`, a JSON payload, and an optional deep link. Verdict: the sprint will add new `NotificationKind` enum members (e.g. `knowledge_review_requested`, `knowledge_review_decided`, `knowledge_published`), but that is outside the article schema and lives in `lib/notifications/triggers.ts`. We flag it here so the migration set in section 3 includes the enum expansion required for the new kinds.

## 2. Proposed model deltas

This section enumerates every schema change required for the sprint. Field-level definitions are written in Prisma 5 syntax to make implementation mechanical.

### 2a. New enum `KnowledgeArticleType`

Six values, named verbatim per sprint spec.

```prisma
enum KnowledgeArticleType {
  internal_task_lesson
  external_reference
  how_to_guide
  troubleshooting_note
  architecture_decision
  process_policy_note
}
```

Underlying Postgres type: `CREATE TYPE "KnowledgeArticleType" AS ENUM (...)` in section 9.

Default value at the database layer: none. The application layer must choose a kind on create. Rationale: making a default would either silently mis-classify legacy rows or force a meaningless default like `how_to_guide`. Backfill of existing rows is explicit and one-time, documented in section 3.

### 2b. Status enum expansion

Current: three values (`draft`, `published`, `archived`). Target: six values.

```prisma
enum KnowledgeArticleStatus {
  draft
  ai_structured
  pending_review
  approved
  published
  archived
}
```

Migration strategy for the enum widening:

Postgres permits `ALTER TYPE ... ADD VALUE` only outside a transaction in some versions, so the SQL in section 9 emits each `ADD VALUE` statement on its own. Adding values is always backward-compatible because all existing rows still have a valid value.

Mapping the old statuses forward:

| Old value | Action |
| --- | --- |
| `draft` | Stays `draft`. The first-author state. |
| `published` | Stays `published`. We do NOT retroactively mark Phase 3 rows as `approved` because no review actually happened; backfilling `approved` would be a fiction. Instead, every legacy row keeps `published` and the audit log preserves the original publish event. New rows go through the full chain. |
| `archived` | Stays `archived`. |

No automated UPDATE statement is necessary. The forward-mapping is the identity. The new states (`ai_structured`, `pending_review`, `approved`) are only ever set by new code paths going forward.

Compatibility note for the existing query layer:

`lib/knowledge/queries.ts` line 72 currently filters non-admin readers to `status = 'published'`. That stays correct. Line 76 filters `{ not: 'archived' }` for admin list view; that also stays correct. The new statuses (`ai_structured`, `pending_review`, `approved`) will show up only in admin views, which is what we want.

### 2c. New columns on `KnowledgeArticle`

The following columns are added in a single forward migration (section 3, migration 2). All new columns are nullable or carry a safe default so the migration applies without a backfill window.

```prisma
model KnowledgeArticle {
  // ... existing columns 1043-1067 ...

  /// Which of the six article kinds this row is. Required for new rows;
  /// existing rows are backfilled to `how_to_guide` (see section 3 backfill).
  kind                   KnowledgeArticleType   @default(how_to_guide)

  /// For internal_task_lesson: the source Job that produced this lesson.
  /// Nullable because non-internal kinds do not have a source job.
  sourceJobId            String?                @map("source_job_id") @db.Uuid

  /// For internal_task_lesson: the WorkReport written for the source job,
  /// when one exists. Cleanly distinct from sourceJobId because not every
  /// job has a WorkReport (the model is optional in jobs, see schema.prisma
  /// line 319 `workReport WorkReport?`).
  sourceWorkReportId     String?                @map("source_work_report_id") @db.Uuid

  /// For external_reference: human-readable vendor / publisher / origin
  /// of the linked material. Free text; not enumerated because the long
  /// tail of vendors is too large.
  externalSource         String?                @map("external_source")

  /// For external_reference: the actual URL. Validation is application-layer;
  /// we store as text because Postgres URL constraints add no value here.
  externalUrl            String?                @map("external_url")

  /// SHA-256 hex of the normalized externalUrl. Used for partial-unique
  /// dedup (only one external_reference per URL). NULL when not external.
  externalUrlHash        String?                @map("external_url_hash")

  /// For external_reference: timestamp of the last manual re-check that
  /// the linked source still exists and still says what we summarized.
  lastVerifiedAt         DateTime?              @map("last_verified_at")

  /// Who performed the last verification.
  lastVerifiedByUserId   String?                @map("last_verified_by_user_id") @db.Uuid

  /// Reliability tier for sourcing. Always present; defaults to
  /// `single_source` so the column can be NOT NULL without a backfill that
  /// makes optimistic assertions.
  reliabilityTier        KnowledgeReliabilityTier @default(single_source) @map("reliability_tier")

  /// 0..100 confidence score. Optional; only populated when produced by an
  /// automated check or by an explicit reviewer rating.
  confidenceScore        Int?                   @map("confidence_score") @db.SmallInt

  /// JSON snapshot of the LLM-structured output captured at AI structuring
  /// time. Immutable after capture; further editing goes into revisions.
  aiStructuredSnapshot   Json?                  @map("ai_structured_snapshot")

  /// The original raw text the worker submitted before structuring.
  /// Stored as TEXT (not Json) because the input is plain text, not a
  /// structured object.
  rawInputSnapshot       String?                @map("raw_input_snapshot") @db.Text

  /// Monotonically incrementing revision counter. The history is in the
  /// new KnowledgeArticleRevision table; this column is the "head" pointer.
  currentVersion         Int                    @default(1) @map("current_version") @db.SmallInt

  /// Last time a reviewer recorded a decision on this article.
  lastReviewedAt         DateTime?              @map("last_reviewed_at")

  /// Most recent reviewer. Tracked here for fast lookups; full history
  /// lives in KnowledgeArticleReview.
  reviewerUserId         String?                @map("reviewer_user_id") @db.Uuid

  /// Why this article matters in the codebase / operationally. 1-3
  /// sentences. Optional for `internal_task_lesson`; recommended for the
  /// other five kinds.
  whyItMatters           String?                @map("why_it_matters") @db.Text

  /// Soft-archive timestamp. Distinct from `status = 'archived'` because
  /// we want to know WHEN it was archived, not just THAT it is archived.
  archivedAt             DateTime?              @map("archived_at")
  archivedByUserId       String?                @map("archived_by_user_id") @db.Uuid

  // ... new relations are added below ...
  sourceJob              Job?                   @relation("KnowledgeSourceJob", fields: [sourceJobId], references: [id])
  sourceWorkReport       WorkReport?            @relation("KnowledgeSourceWorkReport", fields: [sourceWorkReportId], references: [id])
  lastVerifiedBy         User?                  @relation("KnowledgeLastVerifier", fields: [lastVerifiedByUserId], references: [id])
  reviewer               User?                  @relation("KnowledgeReviewer", fields: [reviewerUserId], references: [id])
  archivedBy             User?                  @relation("KnowledgeArchiver", fields: [archivedByUserId], references: [id])

  revisions              KnowledgeArticleRevision[]
  reviews                KnowledgeArticleReview[]
  references             KnowledgeArticleReference[] @relation("KnowledgeRefOwner")
  referencedBy           KnowledgeArticleReference[] @relation("KnowledgeRefTarget")
}
```

Required reciprocal relations on existing models. The implementer adds these without touching anything else:

```prisma
// in model User (schema.prisma line 235-282)
knowledgeReviewed     KnowledgeArticle[]         @relation("KnowledgeReviewer")
knowledgeVerified     KnowledgeArticle[]         @relation("KnowledgeLastVerifier")
knowledgeArchived     KnowledgeArticle[]         @relation("KnowledgeArchiver")
knowledgeRevisions    KnowledgeArticleRevision[]
knowledgeReviews      KnowledgeArticleReview[]

// in model Job (schema.prisma line 284-338)
knowledgeArticles  KnowledgeArticle[] @relation("KnowledgeSourceJob")

// in model WorkReport (schema.prisma line 359-378)
knowledgeArticles  KnowledgeArticle[] @relation("KnowledgeSourceWorkReport")
```

New enum `KnowledgeReliabilityTier` (used by `reliabilityTier` above):

```prisma
enum KnowledgeReliabilityTier {
  /// Independently confirmed by two sources or by the team in production.
  verified
  /// Reviewer ran the steps and confirmed they work in our environment.
  validated
  /// Comes from one source; not retested by us.
  single_source
  /// Useful but unverified; "we have heard this" rather than "we have tried this".
  anecdotal
}
```

### 2d. New model `KnowledgeArticleRevision`

Full version history. Every time the body, summary, or whyItMatters changes after the article first leaves `draft`, a new revision row is appended.

```prisma
model KnowledgeArticleRevision {
  id            String   @id @default(uuid()) @db.Uuid
  articleId     String   @map("article_id") @db.Uuid
  version       Int      @db.SmallInt
  title         String
  summary       String?
  body          String   @db.Text
  whyItMatters  String?  @map("why_it_matters") @db.Text
  authorUserId  String   @map("author_user_id") @db.Uuid
  /// Free-form note from the editor describing the revision. Optional.
  changeNote    String?  @map("change_note") @db.Text
  createdAt     DateTime @default(now()) @map("created_at")

  article KnowledgeArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  author  User             @relation(fields: [authorUserId], references: [id])

  @@unique([articleId, version])
  @@index([articleId, createdAt(sort: Desc)])
  @@map("knowledge_article_revisions")
}
```

Design decisions for revisions:
- Snapshot pattern, not delta pattern. Disk is cheap; reconstructing a body from deltas is operationally painful and we have no high-volume churn case here.
- `version` is unique within `articleId`. The application increments `KnowledgeArticle.currentVersion` and inserts the snapshot in the same transaction.
- Cascade delete is intentional: if an article is hard-deleted (admin only, audited), its revisions go too. Soft delete (`status = 'archived'`) does not delete revisions; only hard delete does. Compliance retention is discussed in section 7.

### 2e. New model `KnowledgeArticleReview`

One row per review cycle (a "cycle" is "from when the author submitted for review until a decision was rendered"). If the reviewer requests changes and the author re-submits, that is a new cycle and a new row. This lets us show "this article has been through three review rounds" with a clean audit trail.

```prisma
enum KnowledgeArticleReviewStatus {
  pending
  approved
  changes_requested
  rejected
}

model KnowledgeArticleReview {
  id              String                       @id @default(uuid()) @db.Uuid
  articleId       String                       @map("article_id") @db.Uuid
  /// The version of the article that this review cycle is reviewing. Lets us
  /// say "approved at v3, but v4 added a new section and needs re-review".
  articleVersion  Int                          @map("article_version") @db.SmallInt
  reviewerUserId  String                       @map("reviewer_user_id") @db.Uuid
  status          KnowledgeArticleReviewStatus @default(pending)
  /// Free-text reviewer comment. Optional on approve, expected on
  /// changes_requested or rejected.
  comment         String?                      @db.Text
  decidedAt       DateTime?                    @map("decided_at")
  requestedAt     DateTime                     @default(now()) @map("requested_at")

  article  KnowledgeArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  reviewer User             @relation(fields: [reviewerUserId], references: [id])

  @@index([articleId, requestedAt(sort: Desc)])
  @@index([reviewerUserId, status])
  @@map("knowledge_article_reviews")
}
```

Design decisions:
- We do NOT enforce uniqueness on `(articleId, reviewerUserId)` because the same reviewer can review the same article across multiple cycles.
- Partial unique on `(articleId)` where `status = pending` is the right database-level invariant: an article should have at most one open review at a time. See section 4.

### 2f. New model `KnowledgeArticleReference`

Cross-link between two articles. Common case: an architecture decision references the runbooks it depends on; a troubleshooting note supersedes an earlier one.

```prisma
enum KnowledgeArticleReferenceKind {
  related
  supersedes
  superseded_by
  see_also
}

model KnowledgeArticleReference {
  id                  String                       @id @default(uuid()) @db.Uuid
  /// The article that "owns" this reference (the one whose page renders it).
  articleId           String                       @map("article_id") @db.Uuid
  /// The other article being referenced.
  referencedArticleId String                       @map("referenced_article_id") @db.Uuid
  kind                KnowledgeArticleReferenceKind @default(related)
  createdAt           DateTime                     @default(now()) @map("created_at")
  createdByUserId     String                       @map("created_by_user_id") @db.Uuid

  owner       KnowledgeArticle @relation("KnowledgeRefOwner", fields: [articleId], references: [id], onDelete: Cascade)
  target      KnowledgeArticle @relation("KnowledgeRefTarget", fields: [referencedArticleId], references: [id], onDelete: Cascade)
  createdBy   User             @relation(fields: [createdByUserId], references: [id])

  @@unique([articleId, referencedArticleId, kind])
  @@index([referencedArticleId])
  @@map("knowledge_article_references")
}
```

Design decisions:
- `supersedes` and `superseded_by` are stored as distinct rows even though one implies the other. The implementer can keep them in sync at the application layer (a transaction that writes both rows) or leave them independent. Storing both makes the read query trivial in either direction (no `UNION ALL` to find "what supersedes me" vs "what I supersede").
- We do NOT prevent self-reference at the DB level. The application layer rejects `articleId = referencedArticleId` before insert; doing it as a CHECK constraint is also fine and section 9 includes it.
- Cascade delete on both sides: if either article goes away (admin hard delete only), the reference row goes too. Soft archive does not delete references; archived articles still show up as "referenced by" but are visually marked.

Reciprocal relations on `User`:
```prisma
knowledgeReferencesCreated KnowledgeArticleReference[]
```

### 2g. KnowledgeArticleTag is unchanged structurally, but gets an extra index

The composite primary key `(article_id, tag_id)` only supports lookups by `article_id`. The hot query "which articles carry tag X" is the canonical browse-by-tag flow and benefits from a secondary index. Section 4 proposes adding `@@index([tagId, articleId])` (or equivalently a single-column index on `tag_id`).

## 3. Migrations strategy

Three migrations is the minimum, five is the maximum. The order is fixed because later migrations reference enums and tables created earlier. All migrations are forward-only; no destructive operations.

### Migration M1: `20260527001000_knowledge_kind_and_status_enum`

Goal: introduce the new `KnowledgeArticleType` enum, add the new `KnowledgeArticleStatus` values, add the new `KnowledgeReliabilityTier`, `KnowledgeArticleReviewStatus`, and `KnowledgeArticleReferenceKind` enums.

Steps:
1. `CREATE TYPE "KnowledgeArticleType"` with the six values.
2. `ALTER TYPE "KnowledgeArticleStatus" ADD VALUE 'ai_structured'` (and similarly for `pending_review`, `approved`). Postgres permits these statements outside an explicit transaction; Prisma Migrate emits them at the file level.
3. `CREATE TYPE "KnowledgeReliabilityTier"` with four values.
4. `CREATE TYPE "KnowledgeArticleReviewStatus"` with four values.
5. `CREATE TYPE "KnowledgeArticleReferenceKind"` with four values.
6. `CREATE TYPE "KnowledgeArticleVisibility"` ... actually, see section 6 for the visibility expansion. If we choose to add `department_only`, it folds into this migration: `ALTER TYPE "KnowledgeArticleVisibility" ADD VALUE 'department_only'`.

Backfills: none in this migration. Enums grow; values stay.

### Migration M2: `20260527001100_knowledge_articles_columns`

Goal: add every new column on `knowledge_articles`.

Steps:
1. `ALTER TABLE "knowledge_articles" ADD COLUMN "kind" "KnowledgeArticleType" NOT NULL DEFAULT 'how_to_guide';`
   The default exists so existing rows have a value immediately. The default is then DROPPED at the end of the migration so future inserts must specify `kind`. This is the canonical Postgres pattern for backfilling with a default on a wide table without taking a long lock.
2. `ALTER TABLE "knowledge_articles" ADD COLUMN "source_job_id" UUID;` and similar for every other nullable column from section 2c.
3. `ALTER TABLE "knowledge_articles" ADD COLUMN "reliability_tier" "KnowledgeReliabilityTier" NOT NULL DEFAULT 'single_source';` (default stays; not nullable).
4. `ALTER TABLE "knowledge_articles" ADD COLUMN "current_version" SMALLINT NOT NULL DEFAULT 1;`
5. Add the eight foreign keys (`source_job_id` -> `jobs.id`, `source_work_report_id` -> `work_reports.id`, `last_verified_by_user_id` -> `users.id`, `reviewer_user_id` -> `users.id`, `archived_by_user_id` -> `users.id`). All `ON DELETE SET NULL` or `RESTRICT` per FK semantics. The exact FK actions are spelled out in section 9.

Backfills:
- `kind`: every existing row receives `how_to_guide` by virtue of the column DEFAULT.
- `reliability_tier`: every existing row receives `single_source`.
- `current_version`: 1.

Verdict on the backfill default for `kind`: `how_to_guide` is the least-wrong default because the Phase 3 articles that exist today are operational notes written for the team. We document this in the migration comment so anyone re-classifying old rows knows the default was chosen for migration safety, not as a real classification.

After the table is populated, drop the temporary default on `kind`:
`ALTER TABLE "knowledge_articles" ALTER COLUMN "kind" DROP DEFAULT;`

This prevents new rows from sneaking in with the migration default.

### Migration M3: `20260527001200_knowledge_revisions_and_reviews`

Goal: create the three new tables (`knowledge_article_revisions`, `knowledge_article_reviews`, `knowledge_article_references`) and their indexes.

Steps:
1. `CREATE TABLE "knowledge_article_revisions"` with columns matching section 2d.
2. `CREATE TABLE "knowledge_article_reviews"` with columns matching section 2e.
3. `CREATE TABLE "knowledge_article_references"` with columns matching section 2f.
4. All unique indexes and supporting indexes per section 4.
5. All foreign keys.

Backfills:
- None. Revisions are write-forward; we do NOT manufacture a v1 revision for every existing article. The application code path will, on first edit of a legacy article post-migration, write a v2 row that captures the new state. Reconstructing v1 from the audit log is possible but adds risk; we accept that legacy articles start their revision history at v2.

The implementer can choose, optionally, to seed a v1 row per existing article using the `created_at` and a "(initial Phase 3 import)" change note. Either choice is acceptable; section 10 (open questions) flags this for discussion.

### Migration M4: `20260527001300_knowledge_indexes`

Goal: indexes that need to land after the columns exist. Keeping them in their own migration makes them quick to revert if any one of them turns out to be wrong in production.

Steps:
1. Partial unique on `external_url_hash` (section 4.1).
2. Composite `(kind, status)` index (section 4.2).
3. `(status, last_reviewed_at)` for staleness sweeps (section 4.3).
4. Trigram GIN extensions to `summary` and `external_source` (section 4.5 and section 5).
5. Secondary index on `knowledge_article_tags(tag_id)`.
6. Partial unique on `knowledge_article_reviews(article_id)` `WHERE status = 'pending'` (section 4.4).

This migration is forward-only and contains only `CREATE INDEX` and `CREATE UNIQUE INDEX` statements.

### Migration M5 (optional): `20260527001400_notification_kinds_for_knowledge`

Goal: extend `NotificationKind` (schema.prisma line 176-180) with the new knowledge events.

Steps:
1. `ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_review_requested';`
2. `ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_review_decided';`
3. `ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_published';`
4. `ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_verification_due';`

Optional because the notification fan-out is not strictly required for the schema to be correct. If the sprint chooses to defer notification work, M5 can be deferred too.

Order of application: M1 -> M2 -> M3 -> M4 (-> M5). M2 depends on enums from M1. M3 depends on tables from M2 (`knowledge_article_references` carries an FK to `knowledge_articles`, which exists from Phase 3, so M3 itself does not depend on M2; but the index migration M4 depends on the columns added by M2).

Estimated lock impact: all `ALTER TABLE ... ADD COLUMN` statements with defaults on `knowledge_articles` use Postgres 11+ fast-default (no rewrite), so the lock is short. Each `ALTER TYPE ADD VALUE` is non-blocking. `CREATE INDEX` should be issued with `CONCURRENTLY` in production; section 9's SQL uses plain `CREATE INDEX` because Prisma Migrate does not support `CONCURRENTLY` inside a transaction. Practically: the table size is small (Phase 3 has dozens of rows, not millions), so this is irrelevant today; we still call it out so the runbook for a year-from-now deployment is correct.

## 4. Indexes

Each index proposal carries the query that justifies it. Indexes are listed in priority order.

### 4.1 Partial unique on `external_url_hash`

Index:
```sql
CREATE UNIQUE INDEX "knowledge_articles_external_url_hash_unique"
  ON "knowledge_articles" ("external_url_hash")
  WHERE "external_url_hash" IS NOT NULL;
```

Justified by: "Has someone already added this external reference?" The application normalizes the URL, hashes it (SHA-256), and checks for collision before insert. Without the partial unique we get duplicate external references with subtly different display titles.

The partial filter `WHERE external_url_hash IS NOT NULL` is essential because most rows (every non-external kind) are NULL on that column and NULL deduplication is not the goal.

### 4.2 `(kind, status)` for list browsing

Index:
```sql
CREATE INDEX "knowledge_articles_kind_status_idx"
  ON "knowledge_articles" ("kind", "status");
```

Justified by: "Show me all external_reference articles that are published" and the equivalent for the other five kinds. The kinds tab in the UX plan loads one kind at a time; the status filter limits to published-and-up. This is the canonical list-page query for the new UI.

We chose `(kind, status)` rather than `(status, kind)` because the most-frequent query path is "I am on the External References tab and want to see them"; pinning `kind` first lets the index seek into the right slice. Status secondary then handles the visibility-and-published filter.

### 4.3 `(status, last_reviewed_at)` for staleness sweeps

Index:
```sql
CREATE INDEX "knowledge_articles_status_last_reviewed_at_idx"
  ON "knowledge_articles" ("status", "last_reviewed_at");
```

Justified by: "Find published articles whose last review is older than 12 months." This is the scheduled-job query for the staleness sweep. The application runs it weekly; without the index it scans every article.

`last_reviewed_at` is NULLable. Postgres indexes NULL values by default, which is what we want here. NULL means "never reviewed", so a sweep that says `ORDER BY last_reviewed_at ASC NULLS FIRST` correctly surfaces never-reviewed articles before stale-but-once-reviewed articles.

### 4.4 Partial unique on `knowledge_article_reviews(article_id) WHERE status = 'pending'`

Index:
```sql
CREATE UNIQUE INDEX "knowledge_article_reviews_one_pending_per_article"
  ON "knowledge_article_reviews" ("article_id")
  WHERE "status" = 'pending';
```

Justified by: an article should have at most one open review at a time. This is the database-level expression of that invariant. The application layer also enforces it but the partial unique is the canonical guard against race conditions (two reviewers picking up the same article on the same second).

### 4.5 Trigram coverage for new searchable text columns

The Phase 3 trigram migration (`prisma/migrations/20260524001150_knowledge_fts/migration.sql`) covers `title` and `body`. After we add `summary` (required for external_reference) and `external_source` (vendor name field), the search box should index them too.

```sql
CREATE INDEX "knowledge_articles_summary_trgm_idx"
  ON "knowledge_articles" USING gin ("summary" gin_trgm_ops);
CREATE INDEX "knowledge_articles_external_source_trgm_idx"
  ON "knowledge_articles" USING gin ("external_source" gin_trgm_ops);
```

Justified by: the search query in `lib/knowledge/queries.ts` lines 78-84 already does ILIKE across `title`, `body`, `summary`. Once we publicize the field, the trigram index on `summary` keeps ILIKE fast. `external_source` is a new query path ("show me all references from Microsoft").

We do NOT add a trigram index on `why_it_matters`. It is internal-facing context, not a search-anchor field. If product asks for it later, the same `CREATE INDEX` template works.

### 4.6 Composite `(source_job_id)` index

Index:
```sql
CREATE INDEX "knowledge_articles_source_job_id_idx"
  ON "knowledge_articles" ("source_job_id")
  WHERE "source_job_id" IS NOT NULL;
```

Justified by: "On the job detail page, show the linked lessons" is a planned UX flow. The partial filter (most articles are not linked to a job) keeps the index small.

### 4.7 Tag join secondary index

Index:
```sql
CREATE INDEX "knowledge_article_tags_tag_id_idx"
  ON "knowledge_article_tags" ("tag_id");
```

Justified by: "List articles for tag X" runs `WHERE tag_id = $1` and the existing composite PK only covers leading-column `article_id`. This is the same pattern Phase 3 uses on `post_tags` and `job_tags` (and the absence of that index on `knowledge_article_tags` today is a small but real gap).

### 4.8 Cross-reference back-index

Index:
```sql
CREATE INDEX "knowledge_article_references_referenced_article_id_idx"
  ON "knowledge_article_references" ("referenced_article_id");
```

Justified by: "Which articles reference me?" is the reverse-lookup that drives the "Referenced by" panel on an article page.

### 4.9 Revisions article+version (already covered by unique)

The `@@unique([articleId, version])` on `KnowledgeArticleRevision` plus the secondary `@@index([articleId, createdAt(sort: Desc)])` covers the two queries that matter: "fetch version N of article X" and "list versions of article X newest first". No additional indexes required.

### 4.10 Reviewer dashboard index

Index already proposed inline:
```prisma
@@index([reviewerUserId, status])
```

Justified by: "Show me all reviews I have pending" is a reviewer's home page query. Filtering by `(reviewer_user_id, status)` is direct.

## 5. Search columns

This section confirms what the search index should cover after the migrations land.

Today:
- `title` trigram GIN
- `body` trigram GIN

After this sprint:
- `title` trigram GIN (unchanged)
- `body` trigram GIN (unchanged)
- `summary` trigram GIN (new)
- `external_source` trigram GIN (new)

We do NOT add a trigram index on `raw_input_snapshot` because that field is for compliance and audit, not search; mixing the raw input into search would surface the un-edited version of the article and is exactly the failure mode the AI-structuring pipeline was meant to fix.

We do NOT add a trigram index on `ai_structured_snapshot` because it is JSONB. If product later wants search across the structured fields, the right answer is to materialize the searchable subset (e.g. "key steps") to a TEXT column at write time and trigram-index that materialized column, not to GIN-index JSON.

`why_it_matters` is left out of the search index. Rationale: it is reader-facing context, but searches for it are low-volume and the field is short. ILIKE without an index is acceptable at the table sizes we expect.

Whole-document search alternatives:
- Postgres FTS (`tsvector`) was considered. The current Phase 3 search stack uses pg_trgm only (see migration 20260524000200). Switching to tsvector would be a project-wide change; for the sprint we stay on trigram.
- External search (Meilisearch, Typesense) is out of scope. The article volume is small enough that trigram on summary+title+body is plenty.

## 6. Permissions and visibility data

Current state: `KnowledgeArticleVisibility` has two values, `internal` and `admin_only` (schema.prisma line 1035-1040). The query layer uses them as in `lib/knowledge/queries.ts` line 70-77.

Verdict: the two-value enum is INSUFFICIENT once the article corpus grows to include process_policy_note and architecture_decision content that may be department-restricted.

Proposed expansion:

```prisma
enum KnowledgeArticleVisibility {
  internal
  admin_only
  /// Visible only to members of the article's primary department. Requires
  /// a non-null `primary_department_id` (added in the same migration).
  department_only
}
```

This adds one column to `KnowledgeArticle`:

```prisma
/// Required when `visibility = 'department_only'`. Otherwise NULL.
primaryDepartmentId String? @map("primary_department_id") @db.Uuid
primaryDepartment   Department? @relation("KnowledgeArticleDepartment", fields: [primaryDepartmentId], references: [id])
```

Reciprocal relation on `Department` (schema.prisma line 202-218):
```prisma
knowledgeArticles KnowledgeArticle[] @relation("KnowledgeArticleDepartment")
```

Data integrity rule (CHECK constraint or application-layer):
- If `visibility = 'department_only'` then `primary_department_id IS NOT NULL`.
- If `visibility != 'department_only'` then `primary_department_id` is permitted to be NULL or set. We do NOT force it to be NULL because product may want a "filed under" hint even when visibility is broader.

This is included in the index migration via:

```sql
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_dept_visibility_check"
  CHECK ("visibility" != 'department_only' OR "primary_department_id" IS NOT NULL);
```

Open question for the sprint (section 10): if a department is renamed or merged, what happens to articles filed under it? Default answer: nothing; the FK stays and the article remains. Acceptable because departments are stable.

We do NOT introduce per-role ACLs (e.g. "this article is visible to FieldServiceLead only"). Visibility stays coarse-grained: org-wide, admin-only, or department-only. Finer-grained access is a future-quarter concern and would push us into a `KnowledgeArticleAcl` table that is out of scope here.

Inheritance question: does `admin_only` override `department_only`? Decision: admins see everything regardless of visibility (current Phase 3 behavior). A `department_only` article is visible to (admins) UNION (members of the matching department).

## 7. Audit and retention

This section codifies retention posture for archived articles.

### 7.1 Soft delete vs hard delete

Soft delete is the default. Hard delete (`DELETE FROM knowledge_articles WHERE id = $1`) is admin-only and audited (`lib/knowledge/queries.ts` line 364-384 already implements it). The sprint does not change this.

Soft delete is implemented as `status = 'archived'` with `archived_at` and `archived_by_user_id` populated. The article disappears from list and search views (see `lib/knowledge/queries.ts` line 76-77) but remains in the database, in the revisions table, and is still referenced from any cross-link rows.

### 7.2 Retention windows

Proposed posture (subject to legal review, see section 10):
- Archived articles stay forever. Disk is cheap; we have no per-row PII concerns on a `KnowledgeArticle`.
- Revisions stay for the lifetime of the parent article. Hard-delete of the parent cascades.
- Reviews stay for the lifetime of the parent article. Hard-delete cascades.
- References (cross-links) cascade on both sides.

### 7.3 Hard delete authorization

The current implementation requires admin-tier authorization (handled outside the schema). The audit log captures the title and slug of the deleted article (`lib/knowledge/queries.ts` line 379-382). We extend that diff to also capture `kind`, `current_version`, and the count of revisions that were destroyed; this is application-layer work, not schema.

### 7.4 Compliance read

The raw worker writeup (`raw_input_snapshot`) is the closest thing to PII in this table because workers sometimes paste customer-specific details into their writeup. Retention posture for this field is the same as the parent article: it lives until the article is hard-deleted. Section 10 flags whether `raw_input_snapshot` should live in its own immutable table for compliance.

### 7.5 Soft delete query pattern

Existing query already correctly hides archived articles from non-admin users (`lib/knowledge/queries.ts` line 73-77). With the new statuses `ai_structured`, `pending_review`, `approved`, the non-admin query still gates on `status = 'published'` (line 72), so the new statuses are automatically invisible to non-admins. No change needed; document the invariant.

## 8. Country / multi-tenant placeholder

The active country profile lives on `CompanySettings` (schema.prisma line 938-970, behind `CountryCode` at line 195-198). Today only IL is supported.

Cross-country considerations for `KnowledgeArticle`:

### 8.1 Language

`LanguagePref` (schema.prisma line 25-28) is per-user. Today the article does not carry its own language; readers consume in their language and we trust the author to write something globally sensible.

Proposed forward-compatible addition (optional, can defer to a later sprint):

```prisma
/// ISO 639-1 language code of the article body. NULL means "language not
/// declared"; the application falls back to assuming the org's primary
/// language (today: en). Future translation flows attach a sibling article
/// for each language variant, linked through KnowledgeArticleReference.
language String? @map("language") @db.VarChar(8)
```

This is a single nullable column. Adding it now buys the option of bilingual content later (e.g. a runbook written in Hebrew because the underlying tool's UI is Hebrew) without a future migration. Recommendation: ADD this column in M2 above as a no-cost forward-compatible field.

### 8.2 Country-specific compliance text

External references for an Israel-only regulation should not surface to a future US-region user. We propose a nullable `applicable_country` column:

```prisma
applicableCountry CountryCode? @map("applicable_country")
```

Today, every row will be NULL (cross-country irrelevant). Tomorrow, when we onboard a non-IL profile, we filter the list by `applicable_country IN (NULL, $currentCountry)`.

Recommendation: ADD this column in M2. Cost is one nullable enum column. Cost of NOT adding it is a future migration.

### 8.3 Tenancy

The system is single-tenant today (one company, one set of users). The schema does not carry a `tenant_id` and we are not retrofitting one. If multi-tenancy is required in the future, the retrofit pattern (add `tenant_id` to every row, scoped FK constraints) is well-understood. Out of scope here.

## 9. Sample SQL for the critical migrations

Each block below is the SQL form of one migration. Comments are kept terse; the migration descriptions in section 3 carry the rationale.

### 9.1 M1: enums

```sql
-- M1: Enums for the new knowledge surface.

-- New: KnowledgeArticleType
CREATE TYPE "KnowledgeArticleType" AS ENUM (
  'internal_task_lesson',
  'external_reference',
  'how_to_guide',
  'troubleshooting_note',
  'architecture_decision',
  'process_policy_note'
);

-- Expand: KnowledgeArticleStatus (existed since 20260524001100).
ALTER TYPE "KnowledgeArticleStatus" ADD VALUE IF NOT EXISTS 'ai_structured';
ALTER TYPE "KnowledgeArticleStatus" ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE "KnowledgeArticleStatus" ADD VALUE IF NOT EXISTS 'approved';

-- Expand: KnowledgeArticleVisibility (if section 6 is accepted).
ALTER TYPE "KnowledgeArticleVisibility" ADD VALUE IF NOT EXISTS 'department_only';

-- New: KnowledgeReliabilityTier
CREATE TYPE "KnowledgeReliabilityTier" AS ENUM (
  'verified',
  'validated',
  'single_source',
  'anecdotal'
);

-- New: KnowledgeArticleReviewStatus
CREATE TYPE "KnowledgeArticleReviewStatus" AS ENUM (
  'pending',
  'approved',
  'changes_requested',
  'rejected'
);

-- New: KnowledgeArticleReferenceKind
CREATE TYPE "KnowledgeArticleReferenceKind" AS ENUM (
  'related',
  'supersedes',
  'superseded_by',
  'see_also'
);
```

### 9.2 M2: new columns on knowledge_articles

```sql
-- M2: New columns on knowledge_articles to support article kinds,
-- AI-structured snapshots, raw input retention, version pointer,
-- reviewer/verifier tracking, archive metadata, and country/language hints.

ALTER TABLE "knowledge_articles"
  ADD COLUMN "kind" "KnowledgeArticleType" NOT NULL DEFAULT 'how_to_guide';

-- Source links for internal_task_lesson rows. Nullable everywhere else.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "source_job_id" UUID,
  ADD COLUMN "source_work_report_id" UUID;

-- External reference columns. All nullable.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "external_source" TEXT,
  ADD COLUMN "external_url" TEXT,
  ADD COLUMN "external_url_hash" TEXT,
  ADD COLUMN "last_verified_at" TIMESTAMP(3),
  ADD COLUMN "last_verified_by_user_id" UUID;

-- Reliability tracking. NOT NULL with default so existing rows have a value.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "reliability_tier" "KnowledgeReliabilityTier" NOT NULL DEFAULT 'single_source',
  ADD COLUMN "confidence_score" SMALLINT;

-- AI / raw snapshots.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "ai_structured_snapshot" JSONB,
  ADD COLUMN "raw_input_snapshot" TEXT;

-- Version pointer and review tracking.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "current_version" SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN "last_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewer_user_id" UUID;

-- Reader-facing context.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "why_it_matters" TEXT;

-- Soft-archive metadata.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by_user_id" UUID;

-- Department visibility scope (paired with the `department_only` enum value).
ALTER TABLE "knowledge_articles"
  ADD COLUMN "primary_department_id" UUID;

-- Forward-compatible country / language fields. Both nullable.
ALTER TABLE "knowledge_articles"
  ADD COLUMN "applicable_country" "CountryCode",
  ADD COLUMN "language" VARCHAR(8);

-- Foreign keys for the new columns.
ALTER TABLE "knowledge_articles"
  ADD CONSTRAINT "knowledge_articles_source_job_id_fkey"
    FOREIGN KEY ("source_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_articles_source_work_report_id_fkey"
    FOREIGN KEY ("source_work_report_id") REFERENCES "work_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_articles_last_verified_by_user_id_fkey"
    FOREIGN KEY ("last_verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_articles_reviewer_user_id_fkey"
    FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_articles_archived_by_user_id_fkey"
    FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_articles_primary_department_id_fkey"
    FOREIGN KEY ("primary_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraint: department_only requires a department.
ALTER TABLE "knowledge_articles"
  ADD CONSTRAINT "knowledge_articles_dept_visibility_check"
    CHECK ("visibility" != 'department_only' OR "primary_department_id" IS NOT NULL);

-- CHECK constraint: external_reference requires a URL.
-- This is enforced only for newly inserted rows of kind external_reference.
-- Existing rows are backfilled to how_to_guide (default), so they sail past.
ALTER TABLE "knowledge_articles"
  ADD CONSTRAINT "knowledge_articles_external_requires_url_check"
    CHECK ("kind" != 'external_reference' OR "external_url" IS NOT NULL);

-- Drop the temporary DEFAULT on kind so future inserts must specify it.
ALTER TABLE "knowledge_articles" ALTER COLUMN "kind" DROP DEFAULT;

-- Confidence score range guard.
ALTER TABLE "knowledge_articles"
  ADD CONSTRAINT "knowledge_articles_confidence_range_check"
    CHECK ("confidence_score" IS NULL OR ("confidence_score" >= 0 AND "confidence_score" <= 100));
```

### 9.3 M3: revisions, reviews, references tables

```sql
-- M3: Version history, review cycles, cross-links.

CREATE TABLE "knowledge_article_revisions" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "version" SMALLINT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "why_it_matters" TEXT,
  "author_user_id" UUID NOT NULL,
  "change_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_article_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_article_revisions_article_id_version_key"
  ON "knowledge_article_revisions" ("article_id", "version");

CREATE INDEX "knowledge_article_revisions_article_id_created_at_idx"
  ON "knowledge_article_revisions" ("article_id", "created_at" DESC);

ALTER TABLE "knowledge_article_revisions"
  ADD CONSTRAINT "knowledge_article_revisions_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_article_revisions_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "knowledge_article_reviews" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "article_version" SMALLINT NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "status" "KnowledgeArticleReviewStatus" NOT NULL DEFAULT 'pending',
  "comment" TEXT,
  "decided_at" TIMESTAMP(3),
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_article_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_article_reviews_article_id_requested_at_idx"
  ON "knowledge_article_reviews" ("article_id", "requested_at" DESC);

CREATE INDEX "knowledge_article_reviews_reviewer_user_id_status_idx"
  ON "knowledge_article_reviews" ("reviewer_user_id", "status");

ALTER TABLE "knowledge_article_reviews"
  ADD CONSTRAINT "knowledge_article_reviews_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_article_reviews_reviewer_user_id_fkey"
    FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "knowledge_article_references" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "referenced_article_id" UUID NOT NULL,
  "kind" "KnowledgeArticleReferenceKind" NOT NULL DEFAULT 'related',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" UUID NOT NULL,

  CONSTRAINT "knowledge_article_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_article_references_self_ref_check"
    CHECK ("article_id" != "referenced_article_id")
);

CREATE UNIQUE INDEX "knowledge_article_references_unique_triple"
  ON "knowledge_article_references" ("article_id", "referenced_article_id", "kind");

CREATE INDEX "knowledge_article_references_referenced_article_id_idx"
  ON "knowledge_article_references" ("referenced_article_id");

ALTER TABLE "knowledge_article_references"
  ADD CONSTRAINT "knowledge_article_references_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_article_references_referenced_article_id_fkey"
    FOREIGN KEY ("referenced_article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_article_references_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### 9.4 M4: indexes

```sql
-- M4: Indexes that need the new columns / tables in place.

-- 4.1: external URL dedup.
CREATE UNIQUE INDEX "knowledge_articles_external_url_hash_unique"
  ON "knowledge_articles" ("external_url_hash")
  WHERE "external_url_hash" IS NOT NULL;

-- 4.2: kind+status list browsing.
CREATE INDEX "knowledge_articles_kind_status_idx"
  ON "knowledge_articles" ("kind", "status");

-- 4.3: staleness sweeps.
CREATE INDEX "knowledge_articles_status_last_reviewed_at_idx"
  ON "knowledge_articles" ("status", "last_reviewed_at");

-- 4.4: one pending review per article.
CREATE UNIQUE INDEX "knowledge_article_reviews_one_pending_per_article"
  ON "knowledge_article_reviews" ("article_id")
  WHERE "status" = 'pending';

-- 4.5: trigram extensions.
CREATE INDEX "knowledge_articles_summary_trgm_idx"
  ON "knowledge_articles" USING gin ("summary" gin_trgm_ops);
CREATE INDEX "knowledge_articles_external_source_trgm_idx"
  ON "knowledge_articles" USING gin ("external_source" gin_trgm_ops);

-- 4.6: job source linkage.
CREATE INDEX "knowledge_articles_source_job_id_idx"
  ON "knowledge_articles" ("source_job_id")
  WHERE "source_job_id" IS NOT NULL;

-- 4.7: tag join secondary.
CREATE INDEX "knowledge_article_tags_tag_id_idx"
  ON "knowledge_article_tags" ("tag_id");
```

### 9.5 M5 (optional): notification kinds

```sql
-- M5: New notification kinds for the knowledge workflow.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'knowledge_review_requested';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'knowledge_review_decided';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'knowledge_published';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'knowledge_verification_due';
```

## 10. Open questions for the sprint

The architect cannot decide these alone. They are flagged for the sprint review.

### 10.1 Should `raw_input_snapshot` live in a separate immutable table?

Argument for splitting it out: compliance posture is cleaner. A separate table can be append-only (no UPDATE permission), revoked from all but admin reads, and retained on a different schedule (e.g. delete raw input after 24 months even when the article stays).

Argument against: it adds another table to maintain, another FK, another query. The current proposal embeds the raw input in the article row.

Decision needed: yes or no. If yes, M3 grows to add a `knowledge_article_raw_inputs` table; the column on `knowledge_articles` is replaced by an FK.

### 10.2 Should we seed a v1 revision row for every existing article?

Argument for: revision history is "complete" from day one.
Argument against: the seeded v1 is a manufactured snapshot, not a real event; the audit log already has the original create event.

Default position in this doc: do not seed. Flag for sprint discussion.

### 10.3 Should `KnowledgeArticleVisibility` get `department_only`?

The current doc proposes yes (section 6). The sprint should decide if the product really wants department-restricted articles or if `internal` + `admin_only` is enough for v1. If the answer is "later", remove the `department_only` enum value, the `primary_department_id` column, and the CHECK constraint from M1 and M2.

### 10.4 Should `applicable_country` and `language` be added now or deferred?

This doc recommends adding them now as nullable forward-compatible columns. The cost is trivial; the cost of NOT adding them is a future migration once we sell to a second country. Sprint may reject this as YAGNI.

### 10.5 Should we use Postgres FTS (tsvector) instead of pg_trgm?

The Phase 3 stack uses pg_trgm. Switching is a project-wide change, not a knowledge-only one. The doc recommends staying on pg_trgm. Sprint may want to discuss whether a knowledge-only FTS column (`fts tsvector GENERATED ALWAYS AS ... STORED`) is worth introducing alongside trigram.

### 10.6 Cascade vs RESTRICT on hard delete of a User who authored revisions

The current `KnowledgeArticleRevision` proposal uses `ON DELETE RESTRICT` for `author_user_id`. This means we cannot delete a user who has any revision history; we must reassign their authorship first (which is what the Phase 3 KnowledgeArticle.author FK does via RESTRICT also).

Alternative: `ON DELETE SET NULL`, treating the author as anonymous after the user is gone. This is more permissive but loses signal.

Default position: stay on RESTRICT, same as the existing article author FK. Flag for sprint.

### 10.7 Should `supersedes` and `superseded_by` be auto-paired?

The proposal allows storing them as independent rows. An alternative is to enforce pairing at the application layer (insert one, the other is auto-inserted in the same transaction) so the reverse-lookup is always consistent. This is application-layer policy; the schema does not enforce it.

Recommended: auto-pair at the application layer, no DB-level pairing constraint. Sprint may want the constraint anyway; if so, a deferred-constraint or a trigger is needed.

### 10.8 Confidence score: human-set or LLM-set?

The proposal exposes `confidence_score` as a nullable smallint 0..100. We have not decided whether this value comes from the structuring LLM, from the reviewer, or from both (and if both, who wins). This is product policy, not schema. The schema supports either.

### 10.9 Should `lastVerifiedAt` cascade a notification on staleness?

Notification kind `knowledge_verification_due` was added in M5 to support this. The scheduled-job that drives it (probably a daily cron over external_reference articles where `last_verified_at < now() - interval '90 days'`) is application-layer work. Sprint may want to lower or raise the cadence. The schema supports any cadence.

### 10.10 Should the article body be moved out of the table entirely?

Argument: a TEXT column with 20-100 KB of body per row is fine at our volume but starts to dominate the table size as the corpus grows. Pulling body into a sibling table (or into object storage with a pointer) keeps the hot list/search path lean.

Argument against: complicates every read; the trigram index on `body` would need to move too.

Default position: keep the body inline. Revisit at >10k articles. Out of scope for this sprint.

---

End of schema plan. Subsequent sprint deliverables (review-workflow doc, UX plan, security audit) reference this document for the data shape they should target.
