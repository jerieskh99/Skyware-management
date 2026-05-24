# Testing and QA Audit — Skyware Internal Management Portal

Date: 2026-05-24
Auditor: Evaluation Engineer
Scope: tests, e2e, CI hooks, acceptance criteria, launch readiness, manual QA, test strategy
Source: file inspection of `tests/`, `e2e/`, configs, `package.json`, MVP plan, phase audits, pilot checklist

---

## 1. Executive Summary

Test coverage is materially thin for the surface area. The codebase ships 41 API route files, 22 server pages, and 52 components, against 5 unit test files (~94 assertions total in pure-logic helpers) and 2 e2e files (~20 specs). There are no integration tests, no API route contract tests, no React component tests, no i18n/RTL smoke, and no test database. Only one pure-logic layer is well covered: permissions, lifecycle, SLA, billing-permissions, audit-redaction. Everything that touches Prisma, the HTTP layer, or React is untested by automation.

The two e2e files exist but have never been verified against the seed: `e2e/admin-access.spec.ts` references the username `emp.helpdesk.1`, while `prisma/seed.ts` actually creates `helpdesk.demo`. Any pilot smoke run that follows the documented procedure will fail at login.

There is no CI. No `.github/workflows`, no `.husky`, no `lefthook`. Lint, typecheck, unit tests, and e2e tests all exist as `package.json` scripts but nothing forces them to run before commits, before push, or before deploy. Phase 10 audits confirm `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green at HEAD, but that is a manual snapshot.

The good news: the highest-risk pure logic (permissions, lifecycle transitions, SLA math, audit redaction) is unit-tested with reasonable depth. The bad news: every mutation path that combines permission + database + transaction + audit is exercised only by manual click-through. Concurrency-sensitive paths (hub take, timer state machine, future receipt numbering) have no automated coverage. Feature-flag gates are not asserted in tests at all.

For a pilot of internal users on a single instance with `receipt_finalize_enabled = false`, this is shippable with a disciplined manual smoke checklist. For anything broader — multi-tenant client data, finalized receipts, billing reconciliation — this coverage is not adequate.

---

## 2. Current Test Inventory

| File | Type | Scope | Depth | Assertions |
|---|---|---|---|---|
| `tests/unit/permissions.test.ts` | Unit | `lib/permissions.ts` pure helpers (isAdmin, canAccessDepartment, canReadJob, canTakeInHub, canPostInChannel, canAccessPage) | Strong. Covers admin/employee × multiple departments × all helpers. | ~24 |
| `tests/unit/lifecycle.test.ts` | Unit | `lib/jobs/lifecycle.ts` (isTransitionAllowed, resolveActorRelation, isReopening) | Strong. Covers all status transitions × actor relations × reopen cases. | ~18 |
| `tests/unit/sla.test.ts` | Unit | `lib/sla.ts` (deriveSlaTargetMinutes, computeSlaState, elapsedMinutes) | Adequate. Covers severity/priority interaction and bar thresholds. Misses overrides composition and tz-edge for elapsed. | ~14 |
| `tests/unit/billing-permissions.test.ts` | Unit | `canManageBilling`, `canFinalizeReceipt`, `canAccessPage` for 14 page keys | Strong for permission boolean coverage. Does not assert page-level redirects. | ~30 |
| `tests/unit/audit-redaction.test.ts` | Unit | `redact()` logic, REDACTED_FIELDS | Adequate. Note: REDACTED_FIELDS is duplicated in the test file rather than imported from `lib/audit.ts`. New fields added to `lib/audit.ts` will not break this test. | ~8 |
| `e2e/login.spec.ts` | E2E (Playwright) | `/login` page render, invalid creds, valid login with `admin.ceo`, `/api/health` 200 | Happy-path only. Asserts text strings; no role-based assertions. | 5 specs |
| `e2e/admin-access.spec.ts` | E2E (Playwright) | Admin can reach 7 portal pages; employee redirected from 4 admin-only pages; unauthenticated redirect from 5 routes | Surface-only — asserts URL and one visible label per page. Uses wrong employee username (see Section 11). | ~20 specs |
| `tests/setup.ts` | Setup | Imports `@testing-library/jest-dom` matchers | Bare. No DB stub, no Prisma mock, no MSW. | n/a |

Totals: 5 unit files, ~94 unit assertions; 2 e2e files, ~25 specs. No component tests under `tests/component/` or `tests/integration/`. No `*.test.tsx` files exist anywhere.

---

## 3. Coverage by Domain Map

Domain coverage indicates whether any automated test exercises code in that domain at all.

| Domain | Unit | Component | API contract | Integration (with DB) | E2E | Verdict |
|---|---|---|---|---|---|---|
| Auth / NextAuth | none | none | none | none | login happy + invalid creds | Thin |
| Permissions library | strong | n/a | n/a | n/a | indirect via admin-access | OK at lib layer; not at route layer |
| Sidebar / page-access guard | none | none | none | none | admin-access checks 4 pages | Partial |
| Jobs lifecycle (state machine) | strong | none | none | none | none | OK at lib layer; route untested |
| Jobs CRUD (create / patch / list) | none | none | none | none | none | None |
| Job transitions endpoint | indirect (lib only) | none | none | none | none | None at route level |
| Hub take (concurrency-critical) | indirect | none | none | none | none | None |
| Task hub list / filters | none | none | none | none | none | None |
| TimeSession (start/pause/resume/stop) | none | none | none | none | none | None |
| Mark-done + WorkReport | none | none | none | none | none | None |
| Communication: channels/posts/replies | none (canPostInChannel only) | none | none | none | none | Thin |
| Channel search | none | none | none | none | none | None |
| Clients CRUD | none | none | none | none | none | None |
| Client environment notes | none | none | none | none | none | None |
| BillingAccount auto-create | none | none | none | none | none | None |
| Monthly items / hourly banks / OTC | none | none | none | none | none | None |
| Hourly bank usage logging | none | none | none | none | none | None |
| Payment status workflow | none | none | none | none | none | None |
| Mark-paid + receipt handoff | none | none | none | none | none | None |
| Burn-rate computation | none | none | none | none | none | None |
| Aging-bucket KPI | none | none | none | none | none | None |
| Statistics queries | none | none | none | none | none | None |
| Statistics range filter | none | none | none | none | none | None |
| Manual email-to-job form | none | none | none | none | none | None |
| Receipts (Phase 7 stub) | `canFinalizeReceipt` only | none | none | none | none | Stubbed |
| Admin user management | none | none | none | none | none | None |
| Admin tag management | none | none | none | none | none | None |
| Admin feature flags | none | none | none | none | none | None |
| Audit log viewer | none | none | none | none | none | None |
| Audit redaction logic | strong | n/a | n/a | n/a | n/a | OK |
| Rate limiter | none (noted in Phase 10 audit) | n/a | n/a | n/a | n/a | None |
| Seed integrity | none | n/a | n/a | none | none | None |
| Migration smoke | none | n/a | n/a | none | none | N/A — only 1 migration |
| i18n / RTL | none | none | n/a | n/a | none | None |
| Saved views | none | none | none | none | none | None (also feature deferred) |
| Global search (cross-scope) | none | none | none | none | none | None |
| Feature flag gating server-side | none | none | none | none | none | None |
| Health endpoint | none | n/a | n/a | n/a | covered by `e2e/login.spec.ts` | OK |

Summary: 4 of ~32 domains have meaningful test coverage. ~26 have zero coverage.

---

## 4. Test Infrastructure

### 4.1 Configs

- `vitest.config.ts`: jsdom env, globals on, setup file `tests/setup.ts`, includes `tests/**/*.test.ts(x)`, excludes `e2e/**`, path alias `@` to project root. Plugin `@vitejs/plugin-react` is configured, so `.test.tsx` would work — none exist.
- `tests/setup.ts`: one line — `import "@testing-library/jest-dom";`. No global mocks. No DB cleanup. No `fetch` polyfill. No MSW. No `vi.mock` of `@/lib/prisma`.
- `playwright.config.ts`: testDir `./e2e`, baseURL `http://localhost:3000`, single Chromium project, html reporter, retries=2 in CI, `webServer.command: "pnpm dev"`, `reuseExistingServer: !CI`. No global setup. No fixtures for authenticated state. No per-test database isolation.

### 4.2 Mocking strategy

There is none. The codebase does not stub Prisma. The tested files (`lib/permissions.ts`, `lib/jobs/lifecycle.ts`, `lib/sla.ts`) are pure functions that don't touch the DB, which is why they can be unit-tested with no setup. `tests/unit/audit-redaction.test.ts` works around the need to mock Prisma by duplicating the `REDACTED_FIELDS` constant inline.

This is the single biggest blocker to writing route-level or query-level tests: there is no Prisma mock, no test database, no MSW for HTTP, no React Query test-wrapper, no NextAuth session mock.

### 4.3 DB setup for tests

None. `package.json` has `db:fresh` and `db:reset` for development but no `db:test`, no separate `DATABASE_URL_TEST`, no migration-then-seed step in the e2e flow. Playwright assumes a developer has already run `pnpm db:fresh && pnpm dev` before `pnpm test:e2e`. This is documented in the e2e file header but not automated.

### 4.4 E2E environment

- `webServer` block boots `pnpm dev` (not `pnpm start`/`pnpm build` + start), so e2e exercises the dev bundle, not the production bundle. Acceptable for now but worth flagging.
- No reset between tests. If `e2e/admin-access.spec.ts` mutates anything, the state leaks across runs. Inspection shows it only navigates and reads, so leakage is limited today.
- Authentication is per-test (each test calls `loginAs` in `beforeEach`). No storage state reuse, so the entire login flow is exercised on every spec — slow but acceptable at this volume.
- Single browser project (Chromium). No Firefox / WebKit. No mobile viewport.

---

## 5. CI / Hooks State

### 5.1 What exists

- `package.json` scripts: `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`. All work locally per phase audit logs.
- `next.config.ts`, `eslint.config.mjs`, `tsconfig.json` configured.

### 5.2 What is missing

| Item | Present | Note |
|---|---|---|
| `.github/workflows/*.yml` | No | No GitHub Actions at all |
| `.gitlab-ci.yml` | No | |
| `.husky/` | No | |
| `lefthook.yml` | No | |
| `pre-commit` config | No | |
| `pre-push` hook | No | |
| CI Postgres service | No | |
| CI seed step | No | |
| CI on-PR `pnpm test` | No | |
| CI on-PR `pnpm typecheck` | No | |
| CI on-PR `pnpm lint` | No | |
| CI on-merge `pnpm test:e2e` | No | |
| Deploy workflow | No | |

### 5.3 What to wire (recommendation, not action)

For a minimum-viable CI before pilot:

1. Add `.github/workflows/ci.yml` running on `pull_request` and `push` to main: install pnpm, run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
2. Add a separate job that boots a Postgres service container, runs `pnpm db:migrate:prod && pnpm db:seed`, builds with `pnpm build`, and runs `pnpm test:e2e`. Gate this on success of the unit job.
3. Add a `pre-commit` via `lefthook` or `simple-git-hooks` running at minimum `pnpm lint --fix` and `pnpm typecheck` on staged files. Husky is fine if the team prefers.
4. Branch protection on `main`: require the unit CI job to pass.

Without these, pilot risk is that someone pushes a regression in `lib/permissions.ts` or a Zod schema and nobody notices until a manual click-test catches it.

---

## 6. Acceptance Criteria — Measurable

These criteria are derived from `docs/internal-management-portal-final-plan/04-mvp-build-plan.md` Sections 2 and 5, and `docs/pilot-launch-checklist.md` Section 9. They are written in measurable, observable form so a tester (manual or automated) can mark each as pass / fail without judgement.

### 6.1 Auth and accounts

- AC-A1: Submitting `/api/auth` with a valid `(username, password)` pair returns 200 and sets the NextAuth session cookie. Browser is redirected to `/dashboard` from `/login`.
- AC-A2: Submitting wrong password 5 times within 15 minutes from the same IP returns 429 from `POST /api/users/me/password` (note: NextAuth login itself is NOT rate-limited per Phase 10 audit; this is an admitted gap).
- AC-A3: Unauthenticated `GET /dashboard`, `/my-jobs`, `/clients`, `/billing`, `/admin` returns a redirect to `/login`.
- AC-A4: Logging out clears the session cookie and `GET /dashboard` redirects back to `/login`.
- AC-A5: A user with `isActive=false` cannot log in (must verify — not asserted in any current test).
- AC-A6: Settings page allows the logged-in user to change `displayName`, `password`, `email`, `languagePref`, `timezone`; each persists to the DB and re-reads on next session.

### 6.2 Permissions and page access

- AC-P1: An admin (`roleKey in {ceo, cto}` or `isAdmin=true`) returns 200 on `GET /clients`, `/billing`, `/receipts`, `/financial-documents`, `/statistics`, `/agent`, `/admin`.
- AC-P2: A non-admin employee gets a redirect to `/dashboard` (not a 403 page) on the same routes.
- AC-P3: An employee in department `helpdesk` cannot `GET /api/jobs?dept=it` and receive jobs from `it` unless they are explicitly assigned to one of them. Verify with a job seeded in `it` and an employee in `helpdesk`.
- AC-P4: An employee in department `helpdesk` cannot `POST /api/channels/it/posts` — returns 403.
- AC-P5: An employee in department `helpdesk` cannot `POST /api/hub/it/take` — returns 403.

### 6.3 Jobs lifecycle

- AC-J1: All 10 statuses reachable per the table in `lib/jobs/lifecycle.ts`. Each forbidden transition returns 422 with `reason` from `isTransitionAllowed`.
- AC-J2: Transitioning to `done` without a `WorkReport` row created in the same transaction is rejected (or the API forces work-report creation). Verify — current code does not appear to enforce this server-side (the `WorkReport` table is separate from the transition).
- AC-J3: `assigned → working_on_it` (first-response) writes `firstResponseAt = now()` exactly once. Subsequent transitions in/out do not overwrite it.
- AC-J4: `done → working_on_it` writes `JobStatusEvent.reopened = true`. `reviewed → working_on_it` also writes `reopened = true`.
- AC-J5: `cancelled` is terminal — `POST /api/jobs/[id]/transitions` from `cancelled` to any other status returns 422.
- AC-J6: Only `roleKey in {ceo, cto}` can transition `done → reviewed`. An assignee with the same `userId` as `assignedEmployeeId` is rejected with 422.
- AC-J7: Audit log row written for every successful transition with `action: "job.status_changed"` and `diff.status.old` / `diff.status.new` populated.

### 6.4 Task hub (concurrency)

- AC-H1: Two concurrent `POST /api/hub/[scope]/take` for the same `jobId` produce exactly one 201 and one 409 with body `{"error": "Job is no longer available"}`.
- AC-H2: After a successful take, `job.status = "taken"`, `job.assignedEmployeeId = takerUserId`, `job.takenTimestamp` populated.
- AC-H3: An employee outside the hub scope cannot take — returns 403 from `canTakeInHub`.
- AC-H4: A `JobStatusEvent` row with `fromStatus = "available"`, `toStatus = "taken"`, `note = "Taken from hub"` is created in the same transaction as the job update.

### 6.5 TimeSession

- AC-T1: `POST /api/jobs/[id]/time-sessions` creates a new active session. Any prior active session for the same `userId` (any job) is closed with `endedAt = now()`. Single active session per user is enforced.
- AC-T2: `PATCH /api/timer/[sessionId]` with `action: "pause"` sets `pausedAt = now()` and adds elapsed minutes to `accumulatedMinutes`. A second pause returns 422.
- AC-T3: `PATCH /api/timer/[sessionId]` with `action: "resume"` clears `pausedAt` and sets `resumedAt = now()`. Resuming a non-paused session returns 422.
- AC-T4: `PATCH /api/timer/[sessionId]` with `action: "stop"` sets `endedAt = now()` and finalizes `accumulatedMinutes` (no further deltas).
- AC-T5: Patching a session owned by another user returns 403.
- AC-T6: Mark-done prefills `timeSpentMinutes` with the sum of `TimeSession.accumulatedMinutes` for `(jobId, userId)`. Verify in UI (`MarkDone` component).
- AC-T7: Idle warning fires after a configured period of no input activity. Currently undefined — confirm with implementer what "idle" means before testing.

### 6.6 Communication

- AC-C1: Employee can `POST /api/channels/global/posts` with `title`, `body`, optional `tags`, optional `relatedJobId`. Returns 201.
- AC-C2: Employee in `helpdesk` cannot `POST /api/channels/it/posts` — returns 403.
- AC-C3: `relatedJobId` referencing a job the poster cannot read returns 403 (verified in Phase 4 cleanup pass).
- AC-C4: `PATCH /api/channels/[key]/posts/[id]` with `resolved: true` or `pinned: true` succeeds for admin. Non-admin gets 403 for pin; verify resolve-by-author behavior in code.
- AC-C5: Channel search `?search=X` returns posts whose `title` or `body` contains `X` (case-insensitive ilike).
- AC-C6: Audit log written for `communication_post.created` and `communication_reply.created`.

### 6.7 Clients

- AC-CL1: `POST /api/clients` creates a `Client` and a `BillingAccount` in the same transaction. If the BillingAccount fails, the Client is not persisted.
- AC-CL2: `POST /api/clients/[id]/environment-notes` with the same `(clientId, section)` updates the existing row (upsert), not insert.
- AC-CL3: `DELETE /api/clients/[id]/environment-notes/[noteId]` removes the row and writes audit.
- AC-CL4: `GET /api/clients?search=foo` returns clients whose `companyName`, `contactName`, `email`, or `phone` matches.
- AC-CL5: Non-admin `GET /api/clients/[id]` returns 403.

### 6.8 Billing

- AC-B1: `POST /api/clients/[id]/billing/monthly-items` requires admin (403 otherwise), Zod-validates body, writes audit.
- AC-B2: `POST /api/clients/[id]/billing/one-time-charges` rejects with a clear error when a charge already exists for the same `jobId` (deduplication guard).
- AC-B3: `POST /api/clients/[id]/billing/hourly-banks/[bankId]/usages` requires that `jobId` references an existing job. Usage is applied to the bank's remaining minutes.
- AC-B4: `PATCH /api/billing/payments/[id]` with `status: "paid"` returns 400 if `paidDate` is missing.
- AC-B5: Payment status transitions follow the table in Phase 6 audit Section 5 (the state machine is enforced in UI only; API accepts any enum). Verify product accepts this risk for pilot.
- AC-B6: `BurnRateBar` color: green > 50%, amber ≤ 50%, red ≤ `alertThresholdPercent` (default 25%). Verify with `totalMinutes = 100`, used 60, 70, 75, 80 minutes.
- AC-B7: `/billing` page Unpaid KPI = count where `status in {draft, sent_to_client, waiting_for_payment, partially_paid}`. Overdue KPI = count where `dueDate < now` and status not in `{paid, cancelled}`.
- AC-B8: Aging buckets compute correctly across Asia/Jerusalem boundary (a payment with `dueDate = today UTC midnight` should not flip between "due today" and "overdue" when viewed in IST).

### 6.9 Receipts (stub, behind feature flag)

- AC-R1: With `receipt_finalize_enabled = false`, the Finalize action is hidden in the UI (not just disabled). Verify component conditional renders nothing.
- AC-R2: Server-side, even if a malicious caller invokes the finalize endpoint with the flag off, the server returns 403/422 (defense in depth). Currently there is no receipt API route, so this AC is forward-looking.
- AC-R3: Receipt numbering is monotonic per `(type, year)` and never has gaps after finalize, even under concurrent finalize calls (use `SELECT FOR UPDATE` or sequence).
- AC-R4: Drafts are editable. Finalized receipts are immutable — all field updates return 422.
- AC-R5: Receipt HTML view shows the verification banner "Amounts are reference figures only. Verify with your accountant."

### 6.10 Productivity

- AC-PR1: Global search returns matches from Jobs (title, description), Clients (company name), and Posts (title, body). No cross-scope leak — an employee in `helpdesk` does not see `it`-scoped jobs in search.
- AC-PR2: Saved views are deferred (URL-based filters only per fallback simplification 1 in MVP plan). Verify with PM whether this remains acceptable.
- AC-PR3: Manual create-job-from-email form: submits a job with the disclaimer "manual entry — no inbox connection". Audit log entry written.

### 6.11 Statistics

- AC-S1: Range chips (7/30/90 days) change the URL `?range=`, re-render server-side, and re-query.
- AC-S2: Active jobs KPI is range-independent. Completed jobs KPI is range-filtered by `completedTimestamp`.
- AC-S3: `GET /api/statistics?range=7` returns 200 for admin, 403 for employee.
- AC-S4: CSV export is deferred (per Phase 8 audit). Confirm with PM that this is acceptable for pilot.

### 6.12 Admin

- AC-AD1: `POST /api/admin/users` creates a user with `bcrypt(12)` password hash. Plaintext password never appears in the audit diff.
- AC-AD2: Username uniqueness is enforced — second `POST` with the same username returns 400/409.
- AC-AD3: Self-deactivation is blocked: `PATCH /api/admin/users/[id]` where `[id] === actor.id` with `isActive: false` returns 400.
- AC-AD4: Self-role-downgrade is blocked: same endpoint with `roleKey` changed on own account returns 400.
- AC-AD5: `POST /api/admin/users/[id]/password` is rate-limited at 5 / 15 min per IP.
- AC-AD6: `GET /api/admin/users` never returns `passwordHash`.
- AC-AD7: Tag delete is blocked when the tag is referenced by any Job, Post, or Client. Returns 409 with the count.
- AC-AD8: Feature flag toggle for `receipt_finalize_enabled` requires a confirmation dialog (UI). Audit log row written with before/after `enabled`.
- AC-AD9: Audit log viewer is paginated (default 50/page) and filterable by `action`, `entityType`, `actorUserId`.

### 6.13 Internationalization

- AC-I1: Setting `languagePref = "he"` in Settings re-renders portal copy in Hebrew (`lib/i18n/he.json`).
- AC-I2: Hebrew mode applies `dir="rtl"` on the `<html>` element. Sidebar, header, tables, dialogs render in RTL.
- AC-I3: User-content fields (job description, post body, client notes, environment notes) use `dir="auto"` so mixed Hebrew/English is rendered correctly.
- AC-I4: All timestamps display in `Asia/Jerusalem` regardless of client browser timezone.

### 6.14 Operational

- AC-O1: `GET /api/health` returns 200 `{"status": "ok"}`.
- AC-O2: All API errors return `{"error": "..."}` JSON with no stack trace, no internal field names in error bodies.
- AC-O3: Security headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` are present on `GET /api/health` and on portal pages.
- AC-O4: Audit log row exists for every mutation. Sensitive fields (`passwordHash`, `password`, `newPassword`, `currentPassword`, `secret`, `token`, `apiKey`, `accessToken`, `refreshToken`, plus variants) are replaced with `"[REDACTED]"`.
- AC-O5: Logout terminates the session — `GET /api/users/me` after logout returns 401.

---

## 7. Manual QA Checklist

### 7.1 Pre-merge (every PR)

Run on a local dev environment after `pnpm db:fresh && pnpm dev`. Estimated 10–15 minutes.

- [ ] `pnpm typecheck` passes with 0 errors.
- [ ] `pnpm lint` passes with 0 errors and 0 warnings.
- [ ] `pnpm test` passes 100%.
- [ ] App boots, `http://localhost:3000/login` loads.
- [ ] `admin.ceo / changeme123` logs in and reaches `/dashboard`.
- [ ] Touched pages render with no console errors.
- [ ] Any new API route has Zod validation, `requireAuth()`, and an `isAdmin` or finer permission guard.
- [ ] Any new mutation writes an audit log row.
- [ ] Any new field that may contain secrets is added to `REDACTED_FIELDS` in `lib/audit.ts`.
- [ ] Hebrew RTL pass: load `?locale=he` on the changed page, verify alignment and direction.
- [ ] No `console.log`, no `// TODO` left without a phase reference.

### 7.2 Pre-deploy (every pilot release)

Estimated 30–45 minutes. Run on a staging instance pointed at a non-prod database.

- [ ] All pre-merge checks above pass.
- [ ] `pnpm test:e2e` passes against staging (fix seed-username mismatch first — see Section 11).
- [ ] Smoke: login as admin, create a client, create a job, assign to employee, log in as that employee, see the job, start timer, transition to working_on_it, transition to done with work report, log back in as admin, mark reviewed.
- [ ] Smoke: send a job to hub, log in as a different employee in scope, take the job from hub, confirm assignment.
- [ ] Smoke: concurrent take (open two browsers/incognito as two eligible employees, click take simultaneously; verify one succeeds, one sees "no longer available").
- [ ] Smoke: post in Global channel, reply, mark resolved.
- [ ] Smoke: post in own-department channel; switch user; verify a different-department employee sees the global post but not the other department's channel.
- [ ] Smoke: create client, add monthly billing item, add hourly bank, log usage, verify burn-rate bar updates.
- [ ] Smoke: create draft payment, mark sent, mark paid with paidDate/method, verify status chip updates.
- [ ] Smoke: open Statistics with each range chip; numbers update.
- [ ] Smoke: admin opens Audit Log; recent actions appear; no `passwordHash` visible in any diff.
- [ ] Smoke: admin opens Feature Flags; `receipt_finalize_enabled` shows Disabled; clicking enable requires a confirmation dialog.
- [ ] Smoke: change language to Hebrew, verify RTL, verify timestamps in Asia/Jerusalem.
- [ ] Smoke: log out — `/dashboard` redirects to `/login`.
- [ ] Security: `curl -I https://staging/api/health` shows X-Frame-Options, HSTS, X-Content-Type-Options.
- [ ] Backup: `pg_dump` succeeds; restore drill completed within last 30 days.

---

## 8. Launch-Readiness Scorecard for Pilot

Categories with current state and target. Targets are conservative pilot bars, not full production.

| Category | Current state | Target for pilot | Gap |
|---|---|---|---|
| Unit test coverage on pure logic | 94 assertions across permissions, lifecycle, SLA, billing-permissions, audit-redaction | Same + tests for `lib/rate-limit.ts`, `lib/jobs/numbers.ts`, billing burn-rate math | Add ~20 unit assertions for burn-rate, aging buckets, rate limiter |
| API route contract tests | 0 | At least: hub take concurrency, transition state machine, timer state machine, payment paid-without-date, admin self-deactivation | None exist — biggest gap |
| Component tests | 0 | At least: MarkPaidSheet, BurnRateBar, MarkDone form, FeatureFlagToggle (confirm dialog), GlobalSearch result rendering | None exist |
| Integration tests against DB | 0 | At least one full job lifecycle and one full payment lifecycle | None |
| E2E happy path | 25 specs, but admin-access uses wrong username | Fix username, add: create-job-assign-take-done-review e2e flow, mark-paid e2e flow | Fix + 2 new specs |
| Lint / typecheck | green at HEAD | Enforced by CI | No CI — gap |
| CI on PR | absent | GitHub Actions on PR running lint + typecheck + unit | Gap — major |
| CI on merge | absent | GitHub Actions on main running e2e against ephemeral Postgres | Gap |
| Pre-commit hooks | absent | lefthook or husky running lint and typecheck on staged files | Gap |
| Backup drill | documented | Performed within last 30 days | Manual — verify with admin |
| Restore drill | documented | Performed at least once on a separate environment | Manual — verify |
| Seed integrity | manual | Smoke test: `pnpm db:fresh` succeeds with no errors and produces all 5 demo users + 4 channels + roles + departments + tags + flags | Add a seed-smoke unit test (in-memory or sqlite-less by running the seed function with a mock prisma) |
| Feature flag safety | `receipt_finalize_enabled` default false in seed | Confirmed false in production env at launch + UI hidden when off | Manual checklist |
| Demo passwords rotated | not in code; manual at launch | Rotated and recorded in password manager | Manual checklist |
| `NEXTAUTH_SECRET` strength | `.env.example` placeholder | 32-byte random in prod env | Manual checklist |
| HTTPS | enforced at reverse-proxy | Verified with `curl -I` showing HSTS over HTTPS | Manual checklist |
| Rate limiter scope | in-memory, single-process | Acceptable for pilot single-instance only | OK as documented |
| Monitoring | none | At minimum: uptime ping on `/api/health` from external service | Wire UptimeRobot or equivalent |
| Error tracking | none | Sentry or equivalent for runtime errors | Out of pilot scope per Phase 10 |
| Audit log retention | unbounded | OK for pilot (low volume); document partition plan for production | OK |
| RTL pass | partial (`dir="auto"` on user content) | Visual pass on every page in Hebrew | Manual, not automated |

Overall pilot-readiness verdict: **conditional GO** if and only if (1) the seed-username mismatch is fixed before any e2e run, (2) CI is added so regressions are caught on PR, (3) the documented 6 launch blockers in `docs/pilot-launch-checklist.md` Section 1 are all checked, and (4) the manual pre-deploy checklist (Section 7.2 above) is executed before opening the portal to pilot users.

---

## 9. Test-Strategy Recommendations

What to test at what level for each kind of code in this repo.

### 9.1 Pure functions (`lib/*.ts`, `lib/jobs/lifecycle.ts`, `lib/sla.ts`, `lib/permissions.ts`, future `lib/billing/burn-rate.ts`)

- **Tool:** Vitest unit tests.
- **What to cover:** every branch, every guard, every threshold. Use table-driven tests where there are state matrices (transitions, permission tuples).
- **Status:** done for permissions, lifecycle, SLA, audit-redaction. Missing: `lib/rate-limit.ts` (table-driven with `vi.useFakeTimers()`), `lib/jobs/numbers.ts` (numbering), `lib/billing/queries.ts` aging-bucket helpers, `lib/sla.ts` override composition.

### 9.2 API route handlers (`app/api/**/route.ts`)

- **Tool:** Vitest with a Prisma mock (`vi.mock("@/lib/prisma", ...)`) plus a NextAuth session stub. Call the exported `GET`/`POST`/`PATCH`/`DELETE` directly with a `new Request(...)` and assert on the `NextResponse`.
- **What to cover (P0 routes):** auth shape (401 / 403 / 200), Zod validation rejection (400), permission boundaries, audit-log write, transaction atomicity (mock-asserted), feature-flag gating where present.
- **Status:** zero. This is the single biggest test-strategy gap. Suggested first targets: `POST /api/hub/[scope]/take` (concurrency), `POST /api/jobs/[id]/transitions` (state machine integration), `PATCH /api/billing/payments/[id]` (paid-without-date guard), `PATCH /api/admin/users/[id]` (self-deactivation guard).

### 9.3 React components (`components/**/*.tsx`)

- **Tool:** Vitest + React Testing Library (already installed; `.tsx` tests will work — none exist).
- **What to cover:** state transitions (open dialog, fill form, submit), conditional rendering (admin vs employee, flag on vs off), accessible labels, RTL when `dir="rtl"` parent is provided. Mock `fetch` or use MSW (not installed).
- **Status:** zero. Top candidates: `MarkPaidSheet` (status workflow rendering), `BurnRateBar` (threshold coloring), `MarkDone` (work report required), `FeatureFlagToggle` (confirmation dialog), `GlobalSearch` (scope filtering).

### 9.4 Page-level / server components (`app/(portal)/**/page.tsx`)

- **Tool:** prefer e2e over component tests — RSC + Prisma + cookies are hard to unit-test in isolation. Mount via Playwright with seeded DB.
- **What to cover:** access control redirect, empty state, populated state, basic interactions. Keep these thin; rely on lower-level tests for logic.
- **Status:** thin (admin-access spec covers redirect only).

### 9.5 Integration tests (full DB)

- **Tool:** Vitest with a real Postgres test database (env-isolated `DATABASE_URL_TEST`) and a `beforeEach` that runs `prisma.$transaction` rollback or a truncate helper.
- **What to cover:** lifecycle end-to-end (create job, assign, transition, mark done, mark reviewed; assert all audit rows and state event rows exist), hub take race (two parallel async calls, exactly one wins), receipt numbering uniqueness under concurrency.
- **Status:** zero. Needs new infrastructure: docker-compose service for a test DB, env var, setup file. Not trivial; budget appropriately.

### 9.6 E2E (`e2e/**/*.spec.ts`)

- **Tool:** Playwright (configured). Add a `storageState` for seeded admin and employee to avoid re-logging-in every test.
- **What to cover:** the top 8–10 critical user flows that exercise multiple modules end-to-end. Don't try to test every page.
- **Status:** 2 files. Suggested additions: full job lifecycle, hub take by employee, mark-paid + receipt-handoff link, admin user CRUD, communication post + reply + resolve.

### 9.7 Contract tests for `/api/*`

- **Tool:** could use Vitest snapshot of OpenAPI / Zod schema → docs export. Currently no OpenAPI generation.
- **Status:** none. Lower priority. If/when an external consumer of the API appears, add this.

### 9.8 What NOT to test

- React tree snapshots — brittle, low value.
- The Prisma client itself.
- Trivial UI styles.
- Anything that requires writing a mock-of-a-mock to assert on Prisma SQL.

---

## 10. P0 / P1 / P2 Test Work To Add

Prioritized backlog. P0 = blocker for pilot. P1 = strongly recommended before pilot. P2 = post-pilot.

### P0 (blocker)

- **P0.1 Fix e2e seed-username mismatch.** `e2e/admin-access.spec.ts` lines 28 use `emp.helpdesk.1`; `prisma/seed.ts` produces `helpdesk.demo`. Choose one and align both. Without this, `pnpm test:e2e` will fail at the employee login, which means the "employee redirected from admin pages" coverage does not actually run.
- **P0.2 Add CI.** Minimum: `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` on every PR and push to main. Without this, even the 94 passing unit assertions are not enforced — a regression in `lib/permissions.ts` can ship.
- **P0.3 Hub take concurrency contract test.** This is the single highest-risk untested flow (financial-allocation-adjacent). Add a Vitest test that mocks Prisma's `updateMany` to return `count: 0` and verify the route returns 409 with the right body. Bonus: add a real-DB integration test that fires two parallel `fetch` calls and asserts exactly one 201 and one 409.
- **P0.4 Admin self-deactivation and self-role-downgrade guard tests.** Currently only confirmed by manual review per Phase 9 audit. Add Vitest tests with a session mock for the actor user.

### P1 (before pilot)

- **P1.1 API route contract tests for the 12 highest-risk routes.** Targets: `POST /api/jobs/[id]/transitions`, `POST /api/jobs/[id]/work-report`, `POST /api/billing/payments`, `PATCH /api/billing/payments/[id]`, `POST /api/clients/[id]/billing/hourly-banks/[bankId]/usages`, `POST /api/timer`, `PATCH /api/timer/[sessionId]`, `POST /api/admin/users`, `POST /api/admin/users/[id]/password`, `POST /api/admin/feature-flags/[key]`, `POST /api/channels/[key]/posts`, `POST /api/hub/[scope]/take`.
- **P1.2 Timer state machine unit tests.** `lib/` does not currently isolate the timer logic from the route; either extract a `lib/timer/state.ts` and unit-test it, or test via the route with a Prisma mock. Cover pause-after-pause (422), resume-after-not-paused (422), stop-after-stop (422), self-only enforcement.
- **P1.3 Lefthook or Husky pre-commit hook.** Runs `pnpm lint` and `pnpm typecheck` on staged files. Prevents the most common regressions from reaching CI.
- **P1.4 E2E: full job lifecycle.** Admin creates job, assigns to employee, employee transitions to working_on_it, employee marks done with work report, admin marks reviewed. Single test, real seed.
- **P1.5 E2E: mark-paid flow.** Admin creates payment draft, advances through sent → waiting → paid (with paidDate and method), confirms status chip and audit log entry.
- **P1.6 Feature-flag server-side enforcement test.** When `receipt_finalize_enabled = false`, a direct API call to the (future) finalize endpoint must return 403. Document this AC so Phase 7 implementation cannot skip it.
- **P1.7 Audit-redaction integration smoke.** Import `REDACTED_FIELDS` from `lib/audit.ts` rather than duplicate it. Prevents the test from going stale when new sensitive fields are added.
- **P1.8 Seed-data integrity test.** A unit test that imports the seed function (or its fixture loaders) and asserts: 5 demo users exist, 4 channels, 3 roles, 4 departments, 5 fixture files load. Fast feedback when fixtures drift.

### P2 (post-pilot)

- **P2.1 Component test suite.** Start with `MarkPaidSheet`, `BurnRateBar`, `FeatureFlagToggle`, `MarkDone`, `GlobalSearch`.
- **P2.2 RTL visual smoke.** Playwright run with `locale=he` cookie set, screenshot each portal page, compare to baseline. Catches RTL regressions.
- **P2.3 Integration test infrastructure.** Docker-compose `db_test`, `DATABASE_URL_TEST`, setup file with `prisma.$transaction` rollback. Enables receipt-numbering concurrency tests.
- **P2.4 Rate-limit unit tests.** `vi.useFakeTimers()` to test the window reset and cleanup interval.
- **P2.5 Statistics queries unit tests.** Mock Prisma `count` and assert the range filter applies correctly. Particularly the delayed-jobs JS filter and aging buckets.
- **P2.6 Contract tests / OpenAPI export.** If the API ever gets a consumer.
- **P2.7 Multi-browser e2e.** Add Firefox and WebKit projects. Add a mobile viewport for at least the timer bar.
- **P2.8 Login rate-limiting at the reverse proxy.** Out of test scope, but the gap should be tracked as a P1 in DevOps.

---

## 11. Findings the Audit Surfaced

- **Seed/e2e username mismatch** (P0.1): `e2e/admin-access.spec.ts` employee username `emp.helpdesk.1` does not exist in `prisma/seed.ts` (which uses `helpdesk.demo`). The Phase 10 audit Section 14 flagged this as "verify seeded employee username" but it remains unresolved at HEAD. Confirmed at `/Users/jeries/Desktop/projects/Skyware-management/.claude/worktrees/friendly-swanson-71ed53/prisma/seed.ts` lines 105–141 and `/Users/jeries/Desktop/projects/Skyware-management/.claude/worktrees/friendly-swanson-71ed53/e2e/admin-access.spec.ts` line 28.
- **No CI of any kind**: `.github/`, `.husky/`, `lefthook` absent. The phase audits all report `pnpm test` green, but nothing automatically enforces this on PR.
- **No `.test.tsx` files** exist despite `@vitejs/plugin-react` being configured and `@testing-library/react` being installed.
- **`tests/setup.ts` is one line** — there is no Prisma mock, no NextAuth session stub, no MSW. Any test that needs to call a route handler or render a server component currently cannot be written without significant new test infrastructure.
- **Audit-redaction test duplicates `REDACTED_FIELDS`** inline (`tests/unit/audit-redaction.test.ts` lines 6–20) rather than importing from `lib/audit.ts`. Adding a new sensitive field to `lib/audit.ts` will not break this test, defeating its purpose.
- **Phase 7 Receipts is a stub** — there is no `app/api/receipts/` directory. The pilot launch checklist correctly identifies this as deferred behind `receipt_finalize_enabled = false`.
- **No test exercises the feature-flag gate server-side.** When Phase 7 ships, ensure the AC is written so the test exists before the route exists.
- **Timer route mutates Prisma in three places without a transaction** (`app/api/timer/[sessionId]/route.ts` lines 43, 57, 71) — each PATCH is a single update, but the start-new-session route correctly uses `$transaction` to close prior sessions atomically. Worth a contract test to lock in this behavior.
- **`canPostInChannel` permission check is enforced in API and tested at the lib layer** but no e2e test asserts that an `it` employee cannot POST to `/api/channels/helpdesk/posts`. Add one.
- **`isAdmin(auth.user)` is the only admin gate on billing routes** — there is no second layer (e.g., a separate "billing manager" role). This is intentional per audit, but it means a single misplaced `isAdmin` check could open all billing mutations. A route-level contract test would catch removals.

---

## Handoff to PM

Top three launch-readiness blockers:

1. **No CI and no enforcement of lint/typecheck/tests on PRs.** All test results in phase audits are manual snapshots. A regression in `lib/permissions.ts`, `lib/jobs/lifecycle.ts`, or `lib/audit.ts` will ship undetected because no automated gate exists. Wire `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` on `pull_request` and `push: main` before pilot opens. Without this, every fix becomes a potential regression vector.
2. **E2E suite is broken at HEAD.** `e2e/admin-access.spec.ts` uses an employee username that does not exist in the seed. The "employee cannot reach admin pages" coverage will fail at login, leaving the only role-based access e2e assertion unverified. Either rename the seeded user to `emp.helpdesk.1` (and the other two analogues) or update the spec to `helpdesk.demo`. Pick one; document the choice.
3. **Highest-risk mutation flows are exercised only by manual click-through.** Hub take (concurrency), payment mark-paid (data integrity), admin self-deactivation (auth lockout), and the job transition state machine (audit trail) all have zero contract tests. Of these, hub take is the highest priority — it is the only mutation in the codebase with an explicit race condition guard, and the guard is currently verified by reading the code, not by running it. Add at least the four P0 tests in Section 10 before the pilot opens to non-admin users.

Recommendation: do not block pilot on items 2 and 3 alone, but require item 1 (CI) as a hard gate. The 6 launch blockers in `docs/pilot-launch-checklist.md` Section 1 remain the operational floor.
