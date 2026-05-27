# Phase 1 Security Review

Reviewer: Security Engineer
Date: 2026-05-27

## Threat model coverage

The 12 threats listed in `docs/knowledge-sprint-2026-05/knowledge_security_permissions_audit.md` were tracked through implementation:

| # | Threat | Mitigation in V1 |
|---|---|---|
| 1 | Prompt injection in worker writeup | Redaction pre-pass via `lib/knowledge/secrets-scan.ts` before any structuring. Reviewer always sees original. Dry-run only in V1 (no real LLM call). |
| 2 | Secret leak in published article | Secrets scanner runs on submit; surfaces warnings to the reviewer. Reviewer sees pattern type and a preview (first 8 chars), never the full match. Cap at 200 findings to prevent input-size DoS. |
| 3 | SSRF via external auto-fetch | Auto-fetch deferred to V2. V1 author types the title manually. The link-health cron uses HEAD only with a 5s timeout. |
| 4 | XSS via raw HTML in Markdown | Hand-rolled allowlist-based sanitizer in `lib/knowledge/markdown.ts`. Output is `dangerouslySetInnerHTML`-safe. Tests cover script-tag stripping and `javascript:` href rejection. External link `target=_blank` always paired with `rel="noopener noreferrer"`. |
| 5 | Cross-department draft visibility | Existing `KnowledgeArticleVisibility` enum (`internal`, `admin_only`) plus author-only edit of own drafts. `department_only` deferred to V2. |
| 6 | Author approves own work | Server-side same-actor guard in `lib/knowledge/permissions.ts canReview`. Returns 422 with `error: same_actor`. |
| 7 | Vendor data leakage via LLM | 3-gate posture mirrors receipts. All 3 gates default false. Even if all 3 flip, redaction pre-pass runs first. V1 never makes a real call. |
| 8 | Privileged action without audit | All 15 state-changing actions write an audit row inside the same transaction. Action codes in `lib/knowledge/audit-actions.ts`. |
| 9 | Notification spam | `notifyFreshnessDue` checks for an existing notification of the same kind for the same article in the last 14 days before firing. |
| 10 | Duplicate external URLs | URL canonical hash + partial unique index `(external_url_hash) WHERE external_url_hash IS NOT NULL`. POST returns 409 on collision. |
| 11 | Reviewer cycle abuse | Cycle counter on `KnowledgeArticleReview`. After 2 `changes_requested` cycles, non-admin actors are blocked from a third with 422. Admin can override. |
| 12 | Rate-limit bypass on AI route | `LIMITS.knowledgeAi = { windowMs: 60*60*1000, max: 5 }` in `lib/rate-limit.ts`. Per-IP. |

## URL hygiene

- `lib/knowledge/url.ts canonicalizeUrl` strips tracking params (utm_*, ref, fbclid, gclid), drops fragments, lowercases scheme + host, removes `www.` prefix, sorts remaining query params.
- `isAcceptableExternalUrl` rejects non-http(s).
- Frontend external-reference form rejects on submit if URL fails the same check.

## Authentication and permissions

- Every knowledge route runs `requireAuth()` first.
- Every state-changing action runs through `lib/knowledge/permissions.ts`.
- Same-actor guard implemented in `canReview`.
- Admin-only verbs: publish, archive, rescind, un-approve, un-archive, change reliability tier on PATCH.

## LLM safety

- `aiStructure` always runs in dry-run mode in V1.
- `canCallRealLlm()` requires three independent gates: `knowledge_ai_structuring_enabled` flag, `ALLOW_KNOWLEDGE_AI` env, `knowledge_ai_provider_verified` flag. All default false.
- Even if accidentally enabled, V1 code throws `real LLM not implemented in V1` rather than calling out.
- Redaction count is exposed in the dry-run output so reviewers see how aggressive the redactor was.

## Cron safety

- Both new cron endpoints follow the existing `lib/cron/auth.ts requireCronAuth` pattern.
- Authenticated either via a Bearer secret OR an admin session.
- The link-health cron uses an `AbortController` with a 5s timeout to prevent slow-loris.

## Open items deferred (with rationale)

- Senior-employee reviewer role - V2 product decision.
- SSRF-guarded title auto-fetch - V2 with allowlist.
- Real LLM call - V2 after vendor verification.
- `department_only` visibility - V2.
- Encrypted-at-rest field-level encryption for `rawInputSnapshot` - not required by current data classification; revisit if any client tax IDs appear there in practice.

## Verdict

Security signs off on V1. The default state is conservative (flag off, AI dry-run, no real LLM, no auto-fetch). Risks documented above are mitigated or explicitly deferred with sound rationale.
