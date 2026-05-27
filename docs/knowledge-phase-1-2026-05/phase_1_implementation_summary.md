# Knowledge System Phase 1 - Implementation Summary

Project: Skyware Internal Management Portal
Phase: Knowledge System V1
Status: Ready for CEO review
Date: 2026-05-27
Owner: Project Manager

Implementation has finished. Engineering, QA, security, evaluation,
product manager, and product designer all agree V1 is ready for CEO
review.

---

## 1. What shipped (one page)

### Database (Wave 1)

5 forward-only migrations under `prisma/migrations/`:

- `20260527001000_knowledge_v1_enums` - 4 new enums plus widened
  `KnowledgeArticleStatus` (3 -> 6 values) and `NotificationKind`
  (3 -> 7 values).
- `20260527001100_knowledge_v1_columns` - 16 new columns on
  `KnowledgeArticle` (kind, source_job_id, source_work_report_id,
  external_source, external_url, external_url_hash, last_verified_at,
  last_verified_by_user_id, reliability_tier, confidence_score,
  ai_structured_snapshot, raw_input_snapshot, current_version,
  last_reviewed_at, reviewer_user_id, why_it_matters). 4 new FKs (all
  ON DELETE SET NULL). 2 CHECK constraints.
- `20260527001200_knowledge_v1_tables` - 3 new tables:
  `knowledge_article_revisions`, `knowledge_article_reviews`,
  `knowledge_article_references`. Plus the self-reference CHECK.
- `20260527001300_knowledge_v1_indexes` - 4 indexes including the
  partial unique on `external_url_hash WHERE external_url_hash IS NOT
  NULL`.
- `20260527001400_knowledge_v1_fts` - trigram GIN indexes on `summary`
  and `external_source`.

### Library (Wave 2A)

Under `lib/knowledge/`:

- `state-machine.ts` - 9 transitions enforcing the workflow.
- `secrets-scan.ts` - 9-pattern regex sweep, capped at 200 findings.
- `url.ts` - canonical URL + SHA-256 hash for dedup.
- `validators.ts` - title / summary / body / tag rules per kind.
- `markdown.ts` - server-side sanitized HTML render; no new deps.
- `ai-structure.ts` - 3-gate seam; dry-run only in V1.
- `permissions.ts` - 12 helpers mirroring the security audit matrix.
- `notification-triggers.ts` - 4 knowledge notification kinds.
- `audit-actions.ts` - 15 typed action constants.
- `link-check.ts` - HEAD-fetch seam for cron link health.
- `freshness-cron.ts` - per-kind stale thresholds.
- `queries.ts` (extended) - `listArticlesFiltered`, `getArticleDetail`,
  `writeRevision`, `openReview`, `decideReview`, `pendingReviewCount`.

### API (Wave 2B)

12 routes total. New or substantially extended:

- `POST/GET /api/knowledge` (extended: filters + dedup)
- `GET/PATCH/DELETE /api/knowledge/[slug]` (extended)
- `POST /api/knowledge/[slug]/submit-review`
- `POST /api/knowledge/[slug]/review`
- `POST /api/knowledge/[slug]/publish` (extended)
- `POST /api/knowledge/[slug]/archive` (extended)
- `POST /api/knowledge/[slug]/rescind`
- `POST /api/knowledge/[slug]/re-verify`
- `POST /api/knowledge/[slug]/ai-structure`
- `POST /api/knowledge/[slug]/un-approve`
- `POST /api/knowledge/[slug]/un-archive`
- `POST /api/jobs/[id]/create-knowledge-article`
- `GET /api/knowledge/pending-review-count` (added in Wave 3)
- `POST /api/cron/knowledge-freshness`
- `POST /api/cron/knowledge-link-health`

Cron registry now lists `knowledge-freshness` and
`knowledge-link-health` alongside the existing entries.

### Frontend (Wave 2C)

8 pages and 22 components under `app/(portal)/knowledge/` and
`components/knowledge/`. Plus changes to `components/jobs/MarkDoneSheet.tsx`,
`components/layout/Sidebar.tsx`, and `app/(portal)/my-jobs/[id]/page.tsx`.
About 175 new i18n keys per locale (en + he).

### Tests (Waves 2A + 2B + 2C + 3)

- Unit: 158 new assertions across 6 new files.
- Integration: 49 new assertions across 12 new files.
- Component (.tsx): 32 new assertions across 5 new files. First .tsx
  test files in the repo.
- E2E: 1 new happy-path spec (`e2e/knowledge-happy-path.spec.ts`),
  honors `SKIP_KNOWLEDGE_E2E=1` env when no browser available.
- Total: 748 tests / 105 files (up from 494 / 82).
- typecheck clean. lint clean.

---

## 2. What is enabled today

`knowledge_articles_enabled` feature flag remains the master switch. It
defaults `false` per the security and product gates. The admin must
enable it explicitly via Admin > Feature Flags to expose the surface
to users. With the flag off:

- `/knowledge`, `/knowledge/new`, `/knowledge/new/external`,
  `/knowledge/review`, `/knowledge/[slug]/*` all 404.
- The Sidebar entry for Knowledge review hides itself.
- The `MarkDoneSheet` checkbox is hidden.
- The "Create knowledge article from this job" button is hidden.
- All knowledge API routes return 404.

This mirrors the receipts module pattern. Implementation is shippable
without flipping anything in production.

A second flag, `knowledge_ai_structuring_enabled`, gates the AI
structuring path. Default `false`. Even when both flags are on, the AI
structuring step runs the deterministic DRY-RUN transform until the
real LLM gates pass (env `ALLOW_KNOWLEDGE_AI` plus
`knowledge_ai_provider_verified` flag). V1 does not enable any real
LLM call.

---

## 3. Compliance with the approved plan

The plan in `docs/knowledge-sprint-2026-05/knowledge_implementation_plan.md`
§3 listed the exact V1 scope. Mapping to what shipped:

| Plan item | Status |
|---|---|
| 5 forward-only migrations | shipped (Wave 1) |
| Status enum 6 values | shipped |
| 6 new article types | shipped |
| 3 new tables (Revision, Review, Reference) | shipped |
| 11 new columns + 3 indexes | shipped (16 + 4) |
| ~10 new endpoints | shipped (12) |
| State machine + same-actor guard | shipped |
| AI dry-run seam | shipped |
| Secrets scanner | shipped (9 patterns) |
| Audit on every state change | shipped |
| 2 cron jobs | shipped |
| 4 new pages | shipped (7 new + 4 modified) |
| 17 new components | shipped (22) |
| Sanitized Markdown body | shipped |
| Task-to-knowledge entry points | shipped (button + checkbox) |
| External-reference form with dedup | shipped (409 on duplicate hash) |
| Hebrew RTL pass | shipped |
| ~129 unit assertions | shipped (158) |
| 13 integration test files | shipped (12 - merged some) |
| 5 component .tsx tests | shipped |
| 1 e2e happy path | shipped |

Everything in the plan landed. Some items came in slightly larger than
planned (16 columns instead of 11; 12 endpoints instead of 10) because
the natural design needed those fields. No scope crept beyond V1.

---

## 4. What product review changed in Wave 3

The product manager, product designer, and knowledge management
specialist reviewed Wave 2C's output and asked for 7 changes. All
landed:

1. New `/api/knowledge/pending-review-count` endpoint (sidebar badge
   was silently 404'ing per Wave 2C's TODO list).
2. `ARTICLE_LIST_SELECT` widened to include kind, reliabilityTier,
   lastVerifiedAt, reviewerUserId. List rows now render their chips
   and pills natively.
3. Reviewer-queue "Unassigned" tab now filters
   `reviewer_user_id IS NULL` server-side, not an in-memory
   approximation.
4. PATCH `/api/knowledge/[slug]` Zod schema widened with kind,
   reliabilityTier, externalSource, externalUrl. State-machine guards
   added: kind and externalUrl are draft-only; reliabilityTier is
   admin-only.
5. Default reliability tier resolved server-side from the kind when
   client omits it (`architecture_decision -> validated`, others ->
   `single_source`). Client value still wins.
6. AI structuring endpoint returns a structured 422 `{ error:
   "ai_ineligible_kind", kind }` for the 3 ineligible kinds.
7. Source job link on the article sidebar resolves to the assignee's
   job route variant with the right `from=` query param.

---

## 5. Where to look

- Implementation summary (this file)
- Engineering audit: `phase_1_engineering_audit.md`
- Daily meetings: `phase_1_daily_meetings.md`
- Product review notes: `phase_1_product_review_notes.md`
- Security review: `phase_1_security_review.md`
- QA test report: `phase_1_qa_test_report.md`
- Deferred items: `phase_1_deferred_items.md`
- Engineering presentation: `phase_1_engineering_presentation.html`
- CEO presentation: `phase_1_ceo_presentation.html`

---

## 6. Final status

**Phase 1 is ready for CEO review.**
