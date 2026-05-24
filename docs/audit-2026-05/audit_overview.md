# Audit Overview

Project: Skyware Internal Management Portal MVP
Date: 2026-05-24
Owner: Project Manager (audit team coordination)
Status: Audit complete. Implementation has not started. Awaiting approval.

This document consolidates findings from six specialist auditors. It is the
single entry point for the audit. Each section links to the deeper audit file
that owns the detail.

---

## 1. Audit team and outputs

| Role | Auditor | Output file |
|---|---|---|
| Senior Architect | architecture, API, scalability, ops | `backend_audit.md` |
| Engineering Lead | code quality, frontend, UX gaps | `frontend_ux_audit.md` |
| Engineering Lead | unfinished work | `unfinished_tasks_audit.md` |
| Data Engineer | schema, migrations, queries | `database_audit.md` |
| Data Scientist | analytics, dashboards, metrics | `analytics_audit.md` |
| Evaluation Engineer | testing, QA, launch readiness | `testing_qa_audit.md` |
| Experiment Designer | phasing, flags, rollout safety | `experimentation_phasing.md` |

Final plan: `implementation_plan.md`
Approval deck: `improvement_plan_presentation.html`

---

## 2. Product concept (what this MVP is)

Skyware Internal Management Portal is the internal operations system for
Skyware IT LTD, an Israeli IT services company. It supports two user types:

- Employees in three departments (Helpdesk, IT, R&D). They take or receive
  jobs, log time, write work reports, post and reply in department channels.
- Admins (CEO, CTO). They assign jobs, manage clients, manage billing, mark
  payments, oversee statistics, manage users, roles, tags, feature flags,
  and audit logs.

Core surfaces in the as-built application:

- Authentication: NextAuth v5 with username and password.
- Job lifecycle: status machine with 10 states, timestamps per transition,
  status events for full timeline, time sessions, work reports, tags,
  SLA derivation (display only today).
- Job hubs: per-scope queues with race-safe "take" operation.
- Communication: per-department channels, posts and replies, resolve and pin.
- Clients: CRUD, environment notes per section, billing tab combining
  monthly retainers, hourly banks, one-time charges, and payments.
- Billing: payment status workflow, mark-paid handoff, aging list,
  hourly-bank consumption.
- Statistics: admin KPI page with 8 metrics and 3 ranking tables.
- Admin: users, tags, feature flags, audit log, roles and departments.
- Receipts and Financial Documents and Agent: intentional placeholders
  gated by feature flags. Receipts on a compliance hold pending accountant
  sign-off.

The product concept is sound. None of the auditors recommend changing it.
The MVP skeleton is preserved. Improvements rearrange, simplify, or extend.

---

## 3. As-built state (one-page summary)

Stack: Next.js 15 App Router, React 19, TypeScript, Prisma 5, PostgreSQL,
NextAuth 5, React Query 5, Tailwind 3, Radix UI, Zod, Vitest, Playwright,
date-fns and date-fns-tz, bcryptjs.

Surface area:

- 22 server pages under `app/(portal)/` plus `/login`.
- 38 API route files under `app/api/`.
- 52 components under `components/`.
- 35 Prisma models, 22 enums, 812-line schema.
- 5 unit test files (about 94 assertions), 2 e2e files (about 25 specs).

Code health:

- Zero `TODO`, `FIXME`, `HACK`, `XXX`, `as any`, `@ts-ignore`, or stray
  `console.log` in `app/` and `components/`.
- Uniform API shape: `requireAuth` then role gate then Zod parse then
  Prisma transaction with `writeAudit`. Followed in every sampled route.
- Status-code discipline good for an MVP (200/201/204/400/401/403/404/409/422/429).

Infrastructure realities:

- `prisma/migrations/` contains only `migration_lock.toml`. No baselined
  migration exists. All environments rely on `prisma db push`.
- No CI. No `.github/workflows/`, no `husky`, no `lefthook`. Lint,
  typecheck, unit, and e2e are scripts that nothing forces to run.
- No structured logging or error reporter. No `console.*` calls anywhere.
- Rate limiter is in-memory and wired to only two endpoints.
- i18n loader and Hebrew/English JSON files exist, but no component
  reads them. Hebrew users get RTL layout with English text.
- `next-themes` and four Radix UI packages are dependencies with zero
  imports.

---

## 4. Critical findings (top of stack)

Order is by blast radius for the pilot launch, not by effort.

### 4.1 No baselined Prisma migration

`prisma/migrations/` has only the lock file. The 812-line schema has never
been recorded as a migration. The pilot cannot deploy with
`prisma migrate deploy` because there is nothing to deploy. The Phase 10
audit's "migrate status: Up to date" is technically true and operationally
misleading. Source: `database_audit.md` Section 2; `backend_audit.md` 1.6.

### 4.2 Notification model promoted to MVP but missing in schema

`docs/internal-management-portal-enhancement/08-data-model-additions.md`
Section 1.5 promotes Notification to MVP with three triggers. The schema
has no Notification model, no User relation, no API. The Phase 10 audit
treats the portal as MVP-complete without flagging this. Decision needed:
keep in MVP, or formally descope. Source: `database_audit.md` 1.5.

### 4.3 No CI; tests do not gate merges

Lint, typecheck, unit, and e2e are runnable but not enforced. A regression
in `lib/permissions.ts`, `lib/jobs/lifecycle.ts`, or `lib/audit.ts` will
ship undetected. The e2e suite is broken at HEAD: `e2e/admin-access.spec.ts`
uses an employee username that does not exist in the seed. Source:
`testing_qa_audit.md` 5 and 11.

### 4.4 i18n built but unwired

`lib/i18n/{en,he}.json` are loaded for types only. No component renders
translated strings. Hebrew toggle flips `dir` and `lang` but UI text stays
English. Source: `frontend_ux_audit.md` 1, 6; `unfinished_tasks_audit.md` 1.

### 4.5 Hand-rolled modals and silent destructive deletes

Eight modals built as bare `fixed inset-0` overlays with no focus trap, no
ESC handling, no `aria-modal`. Four destructive deletes (monthly items,
hourly banks, one-time charges, environment notes) require no confirmation.
Two flows fall through to `window.alert` / `window.confirm`. Source:
`frontend_ux_audit.md` 3.3.

### 4.6 Statistics and dashboard queries are N+1

Per-employee, per-department, and per-client query fan-out into 2-3
Prisma queries inside `Promise.all`. Hidden at seed scale; will dominate
page time at 50 employees and 100+ clients. Source: `backend_audit.md` 6;
`database_audit.md` 7; `analytics_audit.md` 8.

### 4.7 Two analytics metrics are actively wrong

- `avgCompletionHours` samples a 500-row slice with no ordering; drifts
  across page loads once N > 500 (`lib/statistics/queries.ts:80-89`).
- "Reopened" KPI is a raw event count labeled like a rate.
  Source: `analytics_audit.md` 1, 4, 6.

### 4.8 Zero structured logging or error reporting

`grep -rn "console\." app lib` returns nothing. The first production
incident will be invisible until the UI breaks visibly. `/api/health`
returns ok even when Postgres is unreachable. Source: `backend_audit.md` 7.

### 4.9 Spec compliance gaps in analytics surface

Aging buckets, hourly-bank burn rate, monthly-retainer status, employee
self-view, hub-take latency, hub-vs-assignment ratio: all called for by
the spec, all absent. Source: `analytics_audit.md` 5.

### 4.10 Highest-risk mutations have no automated coverage

Hub take (race condition guard), mark-paid (data integrity), admin
self-deactivation (auth lockout), and job transitions (audit trail) are
exercised by manual click-through only. Hub take is the only mutation in
the codebase with an explicit concurrency guard; the guard is verified by
reading code, not by running it. Source: `testing_qa_audit.md` 3, 10.

---

## 5. Strengths to preserve

The audit is critical but the foundation is good. These properties should
not change during the improvement work:

- The uniform API shape (`requireAuth` then role gate then Zod then
  `$transaction` with `writeAudit`). Every new route should follow it.
- The route-group layout (`(auth)`, `(portal)`, `api`). Matches the spec
  faithfully and supports admin-only redirects in layouts.
- The shared component primitives (`PageHeader`, `KpiCard`, `SectionCard`,
  `EmptyState`, `StatusDot`) and job-domain reusables (`JobStatusChip`,
  `JobPriorityChip`, `JobSeverityChip`, `JobTagChips`, `JobSlaBar`,
  `JobRow`, `JobTimeline`). Replicate the pattern for billing and clients.
- The status-code discipline (especially 409 for hub take, 422 for invalid
  lifecycle transitions, 429 for rate-limited endpoints).
- The transaction-wrapped audit log pattern. `writeAudit` is enforced as
  transaction-only.
- The honest placeholder pages for receipts, agent, financial documents.
  They communicate the intent and gate behavior behind feature flags.
- Idempotent and placeholder-only seed. Realistic shape, no PII.
- Pure-function logic layers (`lib/permissions.ts`, `lib/jobs/lifecycle.ts`,
  `lib/sla.ts`, `lib/billing/permissions`) are unit-testable and tested.

---

## 6. Features: keep, improve, rearrange, add

Inputs from all six audits, deduplicated.

### 6.1 Keep as-is

- Authentication (NextAuth credentials, callback URL preservation).
- Job state machine and lifecycle.
- Hub take with concurrency guard.
- Audit log writes on every mutation.
- Feature flag toggle pattern with confirm dialog on irreversible flags.
- Idempotent seed.
- Health endpoint surface (improve its truthfulness in 6.2).

### 6.2 Improve

- Modals: replace eight bespoke overlays with Radix `Dialog`. Already a
  dependency.
- Destructive deletes: add a confirmation dialog to `ClientBillingTab`,
  `EnvironmentNotesSection`, `TagManagementSection`.
- i18n: wire the JSON dictionaries to every page header, button, status
  label, empty state, and form label.
- Theming: enable `next-themes` and add a toggle.
- Toast / notification surface: add a global toaster and replace inline
  "Saved." text with toast events for cross-page actions.
- Loading and empty states: add `loading.tsx` at portal level and per
  domain. Add `Suspense` on heavy data sections.
- Statistics: fix the two wrong metrics. Add metric-definition tooltips.
  Add employee self-view at `/statistics/me`.
- Billing: add time-bucketed aging strip on `/billing` and admin dashboard.
- Dashboard: add hourly-bank-low strip and recent client activity.
- N+1 queries: rewrite the statistics and dashboard fan-outs as single
  grouped queries.
- `/api/health`: include a real database ping. Return 503 when down.
- `app/(portal)/admin/page.tsx`: split into per-tab files.
- `components/billing/ClientBillingTab.tsx`: split into per-section files.
- Global search: add scope chips, FTS indexes, and search results page.
- Forms: standardize on Zod and a shared form helper to remove the
  ad-hoc `if (!field.trim())` repetition.

### 6.3 Rearrange

- Centralize the duplicated job-scope permission filter
  (`lib/jobs/queries.ts`, `app/api/search/route.ts`,
  `app/api/channels/[key]/posts/route.ts`).
- Move ad-hoc Tailwind color combinations for client status and KPI tones
  into shared `ClientStatusBadge` and `KpiTone` primitives.
- Move the duplicated `KpiCard` and `EmptyState` definitions in
  `statistics/page.tsx` to the shared versions.

### 6.4 Add (high-value)

- Notifications: model, UI bell, three triggers (sla.breached, job.assigned,
  mention) as promoted in `08-data-model-additions.md`.
- Saved views on Jobs, Clients, Billing. Schema is ready (`SavedView`).
- Job detail tabs (Overview, Timeline, Related, Files) and reassign control.
- Notification preferences and timezone display in `/settings`.
- File attachment UI on jobs/posts/replies. Schema is ready.
- Email change for users in admin UI.
- SLA defaults editable in `/admin?tab=sla` and backed by DB rows.
- Company Details storage and edit UI for `/admin?tab=company`.
- CI workflow that runs lint, typecheck, unit, and e2e on every PR.
- Structured logging (server-side) and a single error reporter.
- Baseline Prisma migration plus the team workflow shift to `migrate dev`.
- FTS indexes on Job title/description and CommunicationPost title/body.
- Partial index on active `TimeSession(user_id) WHERE ended_at IS NULL`.

### 6.5 Defer or do not add

- Multi-tenant client portal.
- ML or predictive features.
- A/B testing infrastructure. User count too small.
- Optimizely-style flag platform. Keep flags minimal.
- IMAP/email ingestion (Financial Documents stays a placeholder).
- Agent Control Center (stays placeholder until an agent exists).
- Receipts finalization until the accountant signs off and the Israeli
  Tax Authority allocation flow is integrated.

---

## 7. Risks and trade-offs

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Baseline migration changes a column type and breaks dev DBs | Medium | High | Stop schema edits during baseline; `migrate diff` from empty; `migrate resolve --applied` on existing dev DBs |
| R2 | Wiring i18n introduces missing-key crashes in Hebrew | Medium | Medium | Add fallback to English; lint script that compares en.json and he.json keys |
| R3 | Notification feature scope creep delays pilot | High | Medium | Cap scope to the three triggers in 08 spec; ship only bell + dropdown |
| R4 | CI gate flakes block work | Medium | Low | Allow re-run; mark e2e non-blocking initially; promote to blocking after one stable week |
| R5 | N+1 rewrite changes metric numbers | Medium | Medium | Snapshot current values; reconcile new queries against snapshots before swap |
| R6 | Toast system adds visual noise | Low | Low | Restrict toasts to success/error of mutations; not for navigation |
| R7 | Destructive-action confirms slow down expert users | Low | Low | Use single-step confirms with typed item name only on irreversible deletes |
| R8 | Receipts pressure to enable before accountant sign-off | Low | High | Keep `receipt_finalize_enabled = false` until accountant attests; document in pilot checklist |
| R9 | Adding role-targeted flags introduces accidental admin-only features | Low | Medium | Add tests that flag-off behavior matches the pre-flag baseline |
| R10 | Phasing slows a small team that wants to ship straight | Medium | Low | Use the phasing taxonomy only for changes touching mutations, money, or auth. Skip it for additive UI. |

---

## 8. Definition of done (audit phase)

- [x] Six specialist audits written under `docs/audit-2026-05/`.
- [x] Cross-cutting overview (this document) written.
- [x] Phased improvement plan written (`implementation_plan.md`).
- [x] Approval deck written (`improvement_plan_presentation.html`).
- [ ] User approval received.
- [ ] Implementation has not started.

---

## 9. Approval checkpoint

The audit phase is complete. The implementation plan is sized and phased.
No code, schema, or migration changes have been made. Implementation
starts only after explicit approval of `implementation_plan.md` and the
phased scope it proposes.

Approver: Jeries Khoury
Next action: review `improvement_plan_presentation.html` and either
approve, request changes, or descope.
