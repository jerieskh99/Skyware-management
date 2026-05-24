# Implementation Plan

Project: Skyware Internal Management Portal MVP
Date: 2026-05-24
Owner: Project Manager
Status: Proposed. Implementation has not started. Awaiting approval.

This plan turns the six audit reports into a phased, sized improvement
program. Read `audit_overview.md` first for the consolidated findings.

The plan preserves the core MVP skeleton. It rearranges, simplifies, and
extends only where the audit shows clear UX, maintainability, or business
value.

---

## 1. Plan structure

Three phases, each gated by an exit checklist.

- **Phase 1: Pre-pilot hardening.** Two weeks. Blocks pilot launch.
  Migration baseline, CI, broken e2e, modals, destructive deletes,
  i18n wire-up, health-check truth, two wrong metrics, notifications model.
- **Phase 2: Pilot polish.** Three weeks. Runs during the first
  half of the pilot. Saved views, notification bell, time-bucketed aging,
  hourly-bank burn, employee self-view, job detail tabs, toast surface,
  loading scaffolding, FTS indexes, structured logging.
- **Phase 3: Post-pilot expansion.** Four to six weeks. Runs after pilot
  feedback. SLA backed by DB, company-details storage, file attachments,
  search results page, recurring-job templates, knowledge articles,
  client health snapshots, receipt finalization once accountant signs off.

Total nominal duration: nine to eleven weeks for a small team. Adjust to
team capacity. Each item is sized as S (under one day), M (one to three
days), L (three to seven days).

---

## 2. Working principles

Drawn from the audit. Apply to every phase.

1. **Preserve the API shape.** Every new route uses
   `requireAuth` then role gate then Zod parse then `prisma.$transaction`
   with `writeAudit`. No exceptions.
2. **No new bespoke modals.** Use Radix `Dialog` for every new dialog.
   Replace existing bespoke modals during Phase 1.
3. **No new ad-hoc validation.** Use Zod with a shared form helper. Keep
   schemas inline with the route or move to `lib/validators/` only if
   reused.
4. **No new `prisma db push`.** After the baseline, every schema change
   goes through `prisma migrate dev` with a named migration.
5. **No new hardcoded English strings in JSX.** Pull from `lib/i18n/`.
   Add the key to both `en.json` and `he.json` in the same PR.
6. **No new destructive action without confirmation.** Reuse a shared
   `ConfirmDialog`.
7. **Feature flag every user-visible new flow.** Default off. Use the
   per-change-class taxonomy from `experimentation_phasing.md` Section 4.
8. **Every new mutation gets a route-level contract test.** Start light;
   one happy path and one permission denial.
9. **Money fields stay in minor units.** No mid-flight migration to
   `Decimal` during this plan.
10. **Hebrew first when the surface is admin-facing in Israel.** Verify
    every new screen renders correctly RTL with Hebrew strings.

---

## 3. Phase 1: Pre-pilot hardening (two weeks)

**Goal:** make the pilot deployable, observable, and safe. Nothing user-
visible is rebuilt. Existing flows become trustworthy.

### 3.1 Workstream A: Database baseline (M, L)

- A1. Stop all schema edits during the baseline window. (S)
- A2. Generate baseline migration:
  `pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  Save to `prisma/migrations/20260524000000_init/migration.sql`. (M)
- A3. On every existing dev DB and the staging DB, run
  `pnpm exec prisma migrate resolve --applied 20260524000000_init` so
  the baseline is recorded as applied without re-running. (S)
- A4. Add Notification model to schema. Three fields minimum: `userId`,
  `kind` enum (`sla.breached`, `job.assigned`, `mention`), `payload`
  JSON, `seenAt`, `createdAt`. Generate as a fresh
  `prisma migrate dev --name add_notifications`. (M)
- A5. Add `unique-if-present(israeli_tax_id)` partial unique index on
  `Client`. Generate as a fresh migration. (S)
- A6. Add partial index on `TimeSession(user_id) WHERE ended_at IS NULL`.
  Raw SQL in the migration. (S)
- A7. Document the new workflow in `docs/`: "Schema changes go through
  `prisma migrate dev`. No `db push` in any environment after this date." (S)

### 3.2 Workstream B: CI and tests (M)

- B1. Add `.github/workflows/ci.yml` running `pnpm install
  --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` on
  `pull_request` and `push: main`. (M)
- B2. Fix `e2e/admin-access.spec.ts` to match the seed (`helpdesk.demo`
  not `emp.helpdesk.1`). Or rename seed users to match spec; pick one
  and document. (S)
- B3. Add e2e to CI as a manual job initially (non-blocking until stable
  for one week). (S)
- B4. Add a Vitest mock for `@/lib/prisma` and a NextAuth session stub in
  `tests/setup.ts`. (M)
- B5. Add P0 contract tests:
  - Hub take race-condition guard returns 409 for second taker.
  - Mark-paid only by admin; 403 for employee.
  - Job transition validates state machine; 422 for invalid edge.
  - Self-deactivation by admin blocked; 422. (M)

### 3.3 Workstream C: Operational truth (S, M)

- C1. `/api/health`: run `await prisma.$queryRaw\`SELECT 1\`` and return
  503 if it throws. Keep the response under 200 ms. (S)
- C2. Add a single `lib/logger.ts` wrapping `console.error` and (optional)
  a shipper hook (Sentry compatible). Wire it into the
  `app/api/*` catch blocks via a small `withErrorLog` helper. (M)
- C3. Middleware: return JSON 401 from `/api/*` instead of redirecting to
  `/login` HTML. (S)
- C4. Apply rate-limit to `POST /api/auth/[...nextauth]` and to
  `/api/admin/users/[id]/password`. (S)

### 3.4 Workstream D: UX safety (S, M)

- D1. Replace eight bespoke modals with Radix `Dialog`. (L)
- D2. Add `ConfirmDialog` and wire to: monthly item delete, hourly bank
  delete, one-time charge delete, environment notes clear, tag delete. (M)
- D3. Remove `window.alert` and `window.confirm` from
  `TagManagementSection.tsx`. (S)
- D4. Add a global `Toaster` (Radix or a small custom). Replace inline
  "Saved." text in admin and settings flows. (M)

### 3.5 Workstream E: i18n wire-up (M, L)

- E1. Wire `lib/i18n/index.ts` to render strings via a `t(key)` helper
  reading the user locale from the session. (M)
- E2. Replace hardcoded English in: page headers, sidebar nav, KPI tone
  labels, status chips, empty states, button labels. (L)
- E3. Add a lint check that `en.json` and `he.json` have identical
  key sets. (S)
- E4. Manual RTL pass: open every page with Hebrew locale; verify no
  mirrored icons (`ChevronRight` should stay or swap consistently). (M)

### 3.6 Workstream F: Two wrong metrics (S)

- F1. Rewrite `avgCompletionHours` as SQL with full set and ordering.
  Optionally surface median and p90 alongside. (S)
- F2. Rename "Reopened" to "Reopen events" or convert to rate
  `reopened_events / completed_in_window`. (S)

### 3.7 Phase 1 exit checklist

- [ ] `prisma/migrations/` contains a baseline migration and one or more
  additive migrations. `prisma migrate deploy` works end-to-end.
- [ ] CI runs on every PR. Lint, typecheck, unit tests pass.
- [ ] E2E suite runs (manual until stable) and is green at HEAD.
- [ ] `/api/health` returns 503 when Postgres is down.
- [ ] No bespoke modal remains in `app/` or `components/`.
- [ ] No `window.alert` or `window.confirm` calls in code.
- [ ] Hebrew session renders translated text on every visited page.
- [ ] `avgCompletionHours` is deterministic. "Reopened" labeled correctly.
- [ ] Notification model exists in schema. UI surface comes in Phase 2.

Estimated effort: 8 person-days for one engineer, or one week for two
engineers in parallel (workstreams A and B in parallel with D and E).

---

## 4. Phase 2: Pilot polish (three weeks)

**Goal:** the visible improvements promised by the spec. Each gated by a
feature flag, rolled out admin first.

### 4.1 Notifications surface (M)

- N1. Notification bell in header with last-10 dropdown. (M)
- N2. Three triggers wired:
  - `sla.breached` from a scheduled job (Phase 1 baseline; Phase 2 wires
    the writer).
  - `job.assigned` written from the assign-job transition.
  - `mention` written from post/reply creation when `@username` parsed.
  (M)
- N3. Mark all as read; per-notification mark as read. (S)
- N4. Notification preferences in `/settings`. (S)

### 4.2 Saved views (M)

- S1. UI on `/my-jobs`, `/clients`, `/billing` that lists views from
  `SavedView` and persists current filters/sort to a new view. (M)
- S2. Pin a view as default. (S)
- S3. Personal scope only in Phase 2; team-shared in Phase 3. (S)

### 4.3 Time-bucketed aging (S, M)

- A1. Compute 0-30, 31-60, 61-90, 90+ buckets in `lib/billing/queries.ts`.
  (S)
- A2. Strip on `/billing` and on admin dashboard. (M)
- A3. Click a bucket to filter `/billing` list. (S)

### 4.4 Hourly-bank burn (M)

- H1. Compute monthly burn per bank from `HourlyBankUsage` rows. (S)
- H2. Show burn-rate bar on client card and on a new "Hourly banks low"
  strip on admin dashboard. (M)
- H3. Threshold for "low" pulled from a constant (no flag yet). (S)

### 4.5 Employee self-view (M)

- E1. New route `/statistics/me`. Same query layer scoped to the session
  user. (M)
- E2. Hide cross-employee tables when the viewer is non-admin. (S)
- E3. Metric definition tooltips on every KPI and column header. (S)

### 4.6 Job detail tabs (M)

- J1. Tabs: Overview, Timeline, Related, Files. Files tab is empty in
  Phase 2 unless attachments ship together. (M)
- J2. Reassign control on Overview tab. Admin only. (S)
- J3. Active timer panel on Overview tab when the viewer has the active
  session for this job. (S)

### 4.7 Loading and feedback (M)

- L1. Add `app/(portal)/loading.tsx`. Skeleton matching the portal shell. (S)
- L2. Add per-domain `loading.tsx` for `/jobs`, `/clients`, `/billing`,
  `/communication`, `/statistics`. (S)
- L3. Replace inline "Saved." text with toast events. Standardize on the
  toaster from D4. (S)

### 4.8 N+1 fixes (M, L)

- N+1.1 Rewrite `lib/statistics/queries.ts` per-employee, per-department,
  per-client to single aggregated queries using `groupBy` or raw SQL. (L)
- N+1.2 Rewrite `lib/dashboard/queries.ts` `lists.delayed` to query for
  delayed first, then sort by priority, not the other way around. (S)
- N+1.3 Snapshot current metric values before swap; reconcile after. (S)

### 4.9 Search and FTS (M)

- F1. Add `pg_trgm` indexes on `Job.title`, `Job.description`,
  `CommunicationPost.title`, `CommunicationPost.body` via raw SQL
  migration. (S)
- F2. Add scope chips to `GlobalSearch`. (M)
- F3. Search results page with paging. (M)

### 4.10 Structured logging integration (S)

- L4. Pick a sink (Sentry, Logtail, or Vercel). One env var. Optional;
  default off for self-host. (S)

### 4.11 Phase 2 exit checklist

- [ ] Notification bell live with three triggers and mark-as-read.
- [ ] Saved views available on Jobs, Clients, Billing.
- [ ] Aging buckets on `/billing` and admin dashboard.
- [ ] Hourly-bank burn-rate visible on client card and admin dashboard.
- [ ] `/statistics/me` live for employees.
- [ ] Job detail has tabs and reassign control.
- [ ] All pages show skeletons during load.
- [ ] Toast feedback on every successful mutation.
- [ ] Statistics page response time at 50 employees under 1.5 s p95.
- [ ] FTS indexes deployed. Global search uses scope chips.

Estimated effort: 12-15 person-days for one engineer; 3 weeks at
half-time across two engineers.

---

## 5. Phase 3: Post-pilot expansion (four to six weeks)

**Goal:** items that need pilot feedback, accountant sign-off, or
longer-term commitment.

### 5.1 SLA backed by DB (M)

- DB-backed defaults editable in `/admin?tab=sla` with audit.
- SLA breach automation: scheduled job, audit event, notification (uses
  the bell from Phase 2).

### 5.2 Company Details storage (M)

- New `CompanySettings` table with one row.
- Edit UI replacing the disabled-input mockup in `/admin?tab=company`.

### 5.3 File attachments (L)

- `Attachment`, `JobAttachment`, `PostAttachment` UI on jobs, posts,
  replies. Schema is ready.
- Upload sink choice: local volume vs S3-compatible. Decision needed.

### 5.4 Receipt finalization (L)

- Israeli Tax Authority allocation number integration (or manual entry).
- Check constraint: `totalAmount = amountBeforeVat + vatAmount` on
  finalized rows.
- Block cancellation of finalized invoices; require credit-note workflow.
- `exchange_rate` column on non-ILS receipts.
- Feature flag stays default off. Accountant attests before enabling.

### 5.5 Recurring jobs and templates (M)

- `RecurringJobTemplate` model and admin UI. Generate jobs on cadence.
- Feature flag gated.

### 5.6 Knowledge articles (M)

- `KnowledgeArticle` model and surface in communication area.
- Search included in global search.

### 5.7 Client health snapshots (M)

- Compute weekly: open jobs, delayed jobs, hours consumed, payments
  outstanding. Store in `ClientHealthSnapshot` for trend.

### 5.8 Saved views team-shared (S)

- Add visibility scope to `SavedView` and toggle in UI.

### 5.9 Phase 3 exit checklist

- [ ] SLA defaults editable and breaches notify.
- [ ] Company details stored and editable.
- [ ] Attachments work for jobs, posts, replies.
- [ ] Receipt finalization either enabled with accountant sign-off, or
  formally deferred past this plan.
- [ ] Recurring job templates available to admins.
- [ ] Knowledge articles surfaced in communication and global search.
- [ ] Client health snapshots available on client detail and via API.

---

## 6. Phasing per change-class (rollout safety)

From `experimentation_phasing.md` Section 4. Apply per item in the plan.

| Change class | Examples in this plan | Pattern |
|---|---|---|
| Additive UI | Modals, toasts, saved views, aging buckets, burn-rate, job tabs | Flag + admin ring + full rollout. No shadow. |
| Read-only analytics | Self-view, metric tooltips, fixes to `avgCompletionHours` | Flag + qualitative review. Spot-check three numbers. |
| New mutations | Notification writer, reassign, hub-take latency capture | Flag + admin ring + contract test required before ring 1. |
| Money or document | Receipt finalization | Dry-run + accountant review + sign-off. Flag stays off until then. |
| Auth or permissions | Self-deactivation guard, role-targeted flags | No flag. Peer review and rollback-ready release tag. |
| DB schema | Baseline migration, Notification, indexes, attachments | Expand-migrate-contract. Migrate forward only. |

---

## 7. Resourcing assumption

The audit assumes one to two engineers working on this in addition to
pilot operations. With one engineer half-time, Phase 1 fits two calendar
weeks. With two engineers half-time, the same two weeks finishes Phase 1
and starts Phase 2.4 (Hourly bank burn) and 2.1 (Notifications).

If only one engineer is available and pilot launch is hard-dated, cut:

- Phase 2.6 Job detail tabs (defer to Phase 3).
- Phase 2.9 Search and FTS (defer; the existing search works on small
  data sets).
- Phase 2.5 Employee self-view (defer behind a flag).

Do not cut:

- Phase 1 in full. Migration baseline, CI, modals, i18n wire-up,
  destructive-delete confirms, two metric fixes, Notification model.
- Phase 2.7 Loading and feedback. The pilot will surface a lot of
  "did it save?" questions otherwise.
- Phase 2.8 N+1 fixes for any team that grows past 30 jobs per day.

---

## 8. Definition of done (per item)

A plan item is done when:

1. Code merged behind a feature flag (where the class requires one).
2. Migration committed and applied to staging.
3. Unit or contract test added for the new logic.
4. Translations added to `en.json` and `he.json`.
5. Manual RTL pass passed for any new screen.
6. Admin ring enabled for at least 48 hours without an issue report.
7. Full rollout flag turned on.
8. Flag marked `retired` after two weeks of full rollout.

A phase is done when its exit checklist is fully checked.

---

## 9. Out of scope (this plan)

- Multi-tenant client portal.
- Customer-facing surfaces.
- Mobile app.
- ML or predictive features.
- A/B testing.
- IMAP/email ingestion for jobs.
- Agent Control Center logic.
- Optimizely-style flag platform.
- Hebrew collation tuning beyond what Postgres `tr_IL` or similar offers
  by default.

These can be revisited after Phase 3.

---

## 10. Approval

This plan changes no code, schema, or runtime configuration. Approval
unlocks Phase 1 only. Phase 2 and Phase 3 are re-scoped at their entry
gates based on what Phase 1 reveals.

Approver: Jeries Khoury
Approval format: a green light on the deck
(`improvement_plan_presentation.html`) or a written note on
`audit_overview.md` Section 9.

**Implementation has not started. Awaiting approval.**
