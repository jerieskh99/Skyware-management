# Phase 1 Engineering Audit

Reviewer: Production Engineering Lead + Senior Architect
Date: 2026-05-27

## 1. Architecture conformance

| Convention | Verified |
|---|---|
| Uniform API shape (auth -> role gate -> Zod -> transaction -> writeAudit) | yes |
| Permissions in `lib/knowledge/permissions.ts`, reused from routes | yes |
| State transitions enforced server-side via `lib/knowledge/state-machine.ts` | yes |
| Author-as-reviewer rejected server-side | yes |
| Audit on every state change (15 action codes) | yes |
| Notifications fan-out inside the mutation transaction | yes |
| Rate-limit applied to mutation-heavy or expensive routes | yes (AI 5/hr/IP) |
| Schema additions forward-only; existing data identity-mapped | yes |
| Migrations match the Receipts/Phase-3 pattern; CHECK constraints via raw SQL | yes |
| Feature flag gates the whole surface (default off) | yes |
| Three-gate posture for the LLM step | yes |
| Sanitized Markdown rendering on the server | yes |

## 2. Code health

- `pnpm typecheck`: clean
- `pnpm lint`: clean
- 748 tests pass (98 -> 105 files; +254 over Phase 4 baseline)
- No new dependencies (Markdown renderer is hand-rolled allowlist)
- No `as any` introductions in the new code
- All public exports typed; no `any` leaking through to consumers

## 3. Maintainability

- 12 new `lib/knowledge/*.ts` modules, all pure (no Prisma calls) except
  `queries.ts`, `notification-triggers.ts`, `freshness-cron.ts`, and
  `link-check.ts`.
- Each route handler is short; business logic lives in lib.
- Tests cover the pure functions exhaustively (state-machine,
  validators, secrets, markdown, url) and the routes via integration
  tests with Prisma mocked.

## 4. Deployment readiness

- Migrations are independent, forward-only, and applied to a shadow DB
  successfully during Wave 1.
- Cron infrastructure reused from Phase 3 §5.1. Two new entries in the
  cron registry; admin "Run now" UI works automatically.
- No new env vars are required to deploy V1.
- Feature flag stays default false. No production impact on flip-off.

## 5. Outstanding nits (non-blocking for V1)

- `/global-jobs/[id]` route does not exist; the article -> source-job
  link uses `/my-jobs/[id]` for both audiences with a `from=` query
  param. Acceptable for V1; consider a split route in V2 if PM asks.
- PATCH `reliabilityTier` admin guard returns a generic 403. Could be a
  structured error code in V2.
- The e2e spec uses visible button labels; if labels change later the
  test needs the same edit. Acceptable.

## 6. Verdict

Engineering signs off on V1. The plan landed cleanly. The patterns
match the rest of the portal (receipts module 3-gate, cron infra,
audit, notifications). Ready for QA + Security + Eval + Product
review.
