# Knowledge System Implementation Plan

Project: Skyware Internal Management Portal - Knowledge module
Sprint: 10-day planning sprint (simulated)
Date: 2026-05-26
Owner: Project Manager
Status: Proposed. Implementation has NOT started. Awaiting approval.

This is the consolidated implementation plan. Reads cleanest after
`knowledge_sprint_audit.md` (the diary). Cites the artifact docs.

---

## 1. What changes vs the shipped module

The Knowledge module shipped in Phase 3 §5.6 is thin CRUD plus tags
plus FTS. It is a foundation - not the goal. This plan turns it into
a reviewed company memory system.

Inputs:
- `knowledge_tab_current_state_audit.md`
- `knowledge_product_strategy.md`
- `knowledge_review_workflow.md`
- `knowledge_database_schema_plan.md`
- `knowledge_ux_plan.md`
- `knowledge_security_permissions_audit.md`
- `knowledge_quality_control_plan.md`

---

## 2. Working principles (apply to every wave)

1. **Preserve the existing shape.** No big-bang rewrite. Forward-only
   migrations. Existing rows continue to work after each migration.
2. **All new flows behind a feature flag.** `knowledge_articles_enabled`
   stays. New `knowledge_funnels_enabled` gates the two creation paths
   (task-to-knowledge + external-reference). `knowledge_ai_structuring
   _enabled` gates the LLM seam. Default off.
3. **Three-gate posture for the LLM.** Mirror the receipts module.
   `knowledge_ai_structuring_enabled` flag + `ALLOW_KNOWLEDGE_AI` env +
   `knowledge_ai_provider_verified` flag. Any false = dry-run mode.
4. **Author cannot be reviewer.** Server-side guard, not just UI.
5. **Cycle cap of 2** for request-changes. Admin arbitrates after.
6. **Reviewer SLA 5 working days.** Soft prod via notification.
7. **Audit every state change.** Reuse existing `lib/audit.ts` +
   `writeAudit` pattern.
8. **No new dependencies** unless absolutely required.

---

## 3. MVP (Phase 1) scope

Goal: workers can capture lessons from completed jobs and useful
external links; reviewers can approve and publish; readers can find
the result.

### 3.1 Foundations (database)

- New enum `KnowledgeArticleType` with 6 values.
- Status enum expanded to 6 values (forward-only).
- New columns on `KnowledgeArticle`:
  - `kind`, `sourceJobId`, `sourceWorkReportId`
  - `externalSource`, `externalUrl`, `externalUrlHash`
  - `lastVerifiedAt`, `lastVerifiedByUserId`
  - `reliabilityTier`, `confidenceScore` (nullable)
  - `aiStructuredSnapshot`, `rawInputSnapshot`
  - `currentVersion`, `lastReviewedAt`, `reviewerUserId`
  - `summary`, `whyItMatters`
- New models: `KnowledgeArticleRevision`,
  `KnowledgeArticleReview`, `KnowledgeArticleReference`.
- New visibility value `department_only` plus
  `primaryDepartmentId` FK.
- 5 forward-only migrations: M1 enums, M2 columns + FKs + CHECKs,
  M3 new tables, M4 indexes (`(kind, status)`,
  `(status, last_reviewed_at)`, partial unique on
  `externalUrlHash`), M5 notification kinds.

### 3.2 Foundations (lib + API)

- New endpoints (admin or author scoped per role matrix):
  - `POST /api/knowledge` (extended to accept `kind`,
    external fields, source job id)
  - `PATCH /api/knowledge/[slug]` (extended)
  - `POST /api/knowledge/[slug]/submit-review` (draft ->
    pending_review)
  - `POST /api/knowledge/[slug]/review` (admin / reviewer decides:
    approve, request_changes, reject)
  - `POST /api/knowledge/[slug]/publish` (approve -> published)
  - `POST /api/knowledge/[slug]/archive` (admin)
  - `POST /api/knowledge/[slug]/rescind` (admin; publish ->
    rescinded)
  - `POST /api/knowledge/[slug]/re-verify` (mark external as
    verified now)
  - `POST /api/knowledge/[slug]/ai-structure` (dry-run by default;
    real LLM only when all three gates pass)
  - `POST /api/jobs/[id]/create-knowledge-article` (creates a draft
    from a reviewed job; pre-fills with source job context)
- Update `lib/knowledge/queries.ts`:
  - List supports filter by `kind`, `status`, `tag`, `author`,
    `reviewer`, `myContributions`, `needsReview`.
  - Detail returns `revisions`, `currentReview`, `references`.
  - Visibility filter respects new `department_only`.
- New `lib/knowledge/state-machine.ts` enforcing the 9 transitions.
- New `lib/knowledge/ai-structure.ts` with the dry-run + real-call
  seam; uses `lib/compliance/gates.ts` pattern.
- New `lib/knowledge/secrets-scan.ts` with the 9 regex patterns
  defined in `knowledge_quality_control_plan.md` §4.
- Audit hook on every state change.

### 3.3 Foundations (UI)

- Replace `<pre>` body rendering with sanitized Markdown rendering
  (use a small server-side renderer; no new client dep).
- New pages:
  - `/knowledge/review` reviewer queue (inbox tabs:
    Unassigned / Mine / All / Closed).
  - `/knowledge/new/external` full-page form for external
    references.
  - `/knowledge/[slug]/revisions` revision history viewer.
  - `/knowledge/[slug]/ai` AI structuring opt-in modal route.
- Refactor `ArticleEditor` to be kind-aware (internal vs external
  field sets).
- Article detail gains: type chip, status chip, reliability tier
  badge, last-verified pill, source-job link, related articles.
- Task-to-knowledge entry point: button on `/my-jobs/[id]` when
  status is `reviewed` plus optional checkbox in `MarkDoneSheet`.
- New components: `ReliabilityTierBadge`, `ArticleKindChip`,
  `ReviewQueueRow`, `AiStructureDialog`, `VerifiedFreshnessPill`,
  `RelatedArticleList`, and 11 others per
  `knowledge_ux_plan.md` §11.
- Sidebar entry "Knowledge review" inside the Communication group
  (gated by reviewer role).

### 3.4 Foundations (search)

- Extend FTS coverage to `summary` and `external_source`.
- Search scope chip in `GlobalSearch` keeps existing "Knowledge"
  scope; results respect new visibility.

### 3.5 Foundations (quality + freshness)

- Validators run server-side on submit-review (title min,
  summary min, body word floor per kind, at least one tag).
- Secret scanner warns the reviewer (does not block the author).
- New cron `/api/cron/knowledge-freshness` (uses Phase 3 cron
  infra). Daily 03:00 IST. Notifies the reviewer on stale rows.
- New cron `/api/cron/knowledge-link-health` (weekly).

### 3.6 Foundations (tests)

- ~129 new unit assertions across the new lib files.
- 13 integration test files (10 new + 3 extended). Covers every new
  route happy path + permission denial + state-machine guard.
- 5 component .tsx tests (first in repo): `ArticleEditor`,
  `ReviewQueueRow`, `AiStructureDialog`, `ReliabilityTierBadge`,
  `VerifiedFreshnessPill`.
- 1 e2e happy path: AI structure -> edit -> submit -> approve ->
  publish -> appear in search -> link back to source job.

### 3.7 Phase 1 exit checklist

- [ ] 5 migrations applied; existing rows continue to render.
- [ ] CI green (lint, typecheck, unit, integration).
- [ ] Markdown body renders sanitized (no XSS).
- [ ] Feature flag matrix correct (defaults off).
- [ ] Reviewer queue lists pending articles.
- [ ] Author can submit for review and respond to changes.
- [ ] Admin can approve and publish.
- [ ] External-reference form prevents duplicates by canonical URL
  hash.
- [ ] AI structuring dry-run mode works; real LLM call blocked by
  three gates.
- [ ] Freshness cron notifies on stale rows.
- [ ] Audit log shows every state change.
- [ ] i18n parity test passes.
- [ ] RTL render verified on key pages.

Estimated effort: **15-20 engineering days** (single engineer) or
**8-10 calendar days** (two engineers in parallel: BE + FE/UI).

---

## 4. Phase 2 (after pilot feedback)

- Auto-fetch external page title behind SSRF guard
  (`knowledge_external_autofetch_enabled`).
- Reviewer "senior employee" role: opt-in flag on User; can review
  external_reference and how_to_guide.
- Attachments on knowledge articles (reuse S3 layer; per-article
  ACL via visibility).
- Real LLM call path enabled after vendor selection + redaction
  pre-pass review. Three gates flip to true.
- LLM-grader against the rubric (warn reviewer on low-score
  drafts). Gated.
- Per-author monthly LLM-cost quota.
- Saved searches in the Knowledge list (matches existing
  saved-views pattern on Jobs/Clients/Billing).

Estimated effort: 6-8 engineering days.

---

## 5. Phase 3 (longer term)

- Multi-language article bodies (he/en/ar) with side-by-side
  editor.
- Public knowledge subset (selected articles published to a
  customer-facing portal). Far future; gated by separate
  compliance review.
- Article analytics (read count, time-on-page, search-rank
  position). Privacy-aware: per-article, not per-reader.
- Semantic search via embeddings (alongside FTS, not replacing).
- Auto-suggest related articles via embeddings.

---

## 6. Risks and tradeoffs

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Reviewer queue overflows (no one reviews) | High | High | SLA notification at 3 days, escalation at 5 days; pause new submissions when > 30% stuck > 7 days |
| R2 | Secret leaks into a published article | Medium | High | Editor-time regex scanner + reviewer-time warning + post-publish weekly scan |
| R3 | LLM prompt injection from worker writeup | Medium | Medium | Redaction pre-pass + reviewer always sees original |
| R4 | External link rot | High | Low | Weekly link-health cron + freshness pill |
| R5 | AI structuring breaks worker voice | Medium | Low | Side-by-side diff; author accepts/rejects per section |
| R6 | Duplicate external references | Medium | Low | URL canonicalization + SHA-256 + partial unique index |
| R7 | Author-as-reviewer accident | Low | Medium | Server-side guard rejects same actor |
| R8 | Stale articles erode trust | High | Medium | Freshness sweep + reliability tier downgrade on overdue verify |
| R9 | Cross-department visibility leak | Low | Medium | Default `department_only` for internal_task_lesson until approved |
| R10 | Search ranking confusion (FTS bias) | Medium | Low | Boost recent + verified + same-department; monitor click-throughs |
| R11 | Mobile editor unusable | Medium | Low | Banner recommends desktop; reader still works on mobile |
| R12 | Markdown XSS via raw HTML | Medium | High | Use server-side sanitizer (allowlist tags + attrs) |

---

## 7. Definition of done (per item)

1. Code merged behind the relevant feature flag (default off).
2. Migration committed and applied to staging.
3. Unit or contract test for new logic.
4. New i18n keys in en.json + he.json (parity test enforces).
5. Manual RTL pass on new screens.
6. Admin ring enabled for 48 hours; no issues reported.
7. Full rollout flag turned on.
8. Flag marked retired after two weeks of full rollout (in code).

---

## 8. Open items deliberately deferred

- Vendor choice for the LLM provider (Phase 2 decision).
- Public knowledge subset (Phase 3).
- Snapshot-style automated rubric grader (Phase 2).
- Real-time collaborative editing (out of scope forever).
- Customer-facing knowledge portal (Phase 3+).

---

## 9. Approval

Approver: Jeries Khoury
Approval options:
- **approve** -> start Phase 1.
- **approve with changes** -> name items to add, cut, or re-phase.
- **hold** -> ask questions in chat first.

**Implementation has not started. Awaiting approval.**
