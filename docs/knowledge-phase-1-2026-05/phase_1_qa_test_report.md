# Phase 1 QA Test Report

Reviewer: Senior QA Engineer + Evaluation Engineer
Date: 2026-05-27

## Counts

| Metric | Pre-Phase-1 | Post-Phase-1 |
|---|---|---|
| Test files | 82 | 105 |
| Total tests | 494 | 748 |
| Net new tests | - | +254 |
| typecheck | clean | clean |
| lint | clean | clean |

## Test files added

### Unit (under `tests/unit/`)
- `knowledge-state-machine.test.ts`
- `knowledge-secrets-scan.test.ts`
- `knowledge-url-canonical.test.ts`
- `knowledge-validators.test.ts`
- `knowledge-markdown.test.ts`
- `knowledge-permissions.test.ts`

### Integration (under `tests/integration/`)
- `knowledge-create-extended.test.ts`
- `knowledge-patch-draft.test.ts`
- `knowledge-submit-review.test.ts`
- `knowledge-review-decide.test.ts`
- `knowledge-archive-rescind.test.ts`
- `knowledge-re-verify.test.ts`
- `knowledge-ai-structure.test.ts`
- `knowledge-job-create-article.test.ts`
- `knowledge-freshness-cron.test.ts`
- `knowledge-link-health-cron.test.ts`
- `knowledge-pending-review-count.test.ts`
- `knowledge-patch-widened.test.ts`
- (plus extensions to the pre-existing `knowledge-flag-off.test.ts` and `knowledge-publish.test.ts`)

### Component (under `tests/component/` - new directory)
- `article-kind-chip.test.tsx`
- `article-status-chip.test.tsx`
- `reliability-tier-badge.test.tsx`
- `review-decision-dialog.test.tsx`
- `markdown-body.test.tsx`

### E2E (under `e2e/`)
- `knowledge-happy-path.spec.ts` (skippable via `SKIP_KNOWLEDGE_E2E=1`)

## Coverage of the rubric

Per the approved plan §6 (`knowledge_quality_control_plan.md`), V1 must satisfy:

| Surface | Happy | Edge | Attack/abuse |
|---|---|---|---|
| Article create | yes | yes | yes (XSS in body, oversized input, missing kind, external missing URL) |
| AI structuring | yes | yes (ineligible kind) | yes (rate-limit, prompt injection redaction) |
| Review queue | yes | yes | yes (same-actor guard, max cycles) |
| Publish | yes | yes | yes (wrong state, non-admin) |
| Archive | yes | yes | yes (non-admin, wrong state) |
| Link to job | yes | yes (job not reviewed, not assignee) | n/a |
| External URL handling | yes (dedup) | yes (canonical sorting) | yes (javascript: rejected) |
| Search | covered by integration tests on existing route | - | n/a |
| RTL render | manual pass; i18n parity test enforces keys | - | - |

## Definition of done check

Per `knowledge_quality_control_plan.md` §1 per-article DoD:

- Title min length: enforced (validators)
- Summary min length: enforced
- Body min word count per kind: enforced
- At least one tag: enforced
- No broken external links (warned by cron, not blocked at submit): on
- No secrets detected: warned to reviewer (not blocked)

Per `knowledge_quality_control_plan.md` §1 per-feature DoD:

- All routes audited: yes
- All state changes audited: yes
- All UI strings i18n: yes (key parity test green)
- RTL pass: yes for the major screens
- Compliance banner when flag off: yes
- 503 / 404 behavior when flag off: yes (every route 404s, every page redirects)

## Performance bars

The plan called for unit and integration tests to run inside the
existing CI envelope. Confirmed:

- Full suite: ~30s (was ~12s; growth proportional to new files).
- No slow-test outliers; longest test is the freshness cron at ~600ms.

## Known limitations

- The e2e spec is skippable. CI may run it conditionally; for normal
  developer flows it can be left off.
- No `aws_secret` regex in the secrets scanner (40-char alphanum has
  too many false positives). Documented in V2 backlog.
- Link health cron uses HEAD; some servers reject HEAD. V2 could fall
  back to GET with `Range: bytes=0-0` if HEAD fails.

## Verdict

QA + Evaluation sign off on V1.
