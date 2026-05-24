# Implementation Notes — Skyware Internal Management Portal

---

## Phase 0 — Foundation

**Status: Complete**
Date: 2026-05-15

### What was built

- `package.json` with all MVP dependencies.
- `tsconfig.json` strict mode.
- `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `eslint.config.mjs`.
- `.env.example`, `.gitignore`, `.npmrc`.
- `vitest.config.ts`, `playwright.config.ts`.
- `prisma/schema.prisma` — full MVP schema with 30 entities, all enums, all relations.
- `prisma/fixtures/` — departments, roles, channels, tags, feature flags.
- `prisma/seed.ts` — idempotent seeder with placeholder demo users.
- `docker-compose.yml` — PostgreSQL 16 Alpine on host port 5433 (avoids conflict with local PG on 5432).
- `.env.local` — local dev credentials, not committed.
- `package.json` scripts: `db:up`, `db:down`, `db:fresh`.

**Key decisions:**
- Auth.js (next-auth v5 beta) with JWT strategy. No DB sessions.
- bcryptjs for password hashing (pure JS, no native build requirement).
- TanStack Query for client data fetching.
- pnpm. Install with `npm install -g pnpm` if not available.
- `@eslint/eslintrc` added as direct dev dep (pnpm does not hoist transitive deps).

**Validation:** typecheck clean, lint clean, 56/56 unit tests, prisma generate succeeds.

---

## Phase 1 — Auth and skeleton

**Status: Complete**
Date: 2026-05-15

### What was built

- `lib/prisma.ts`, `lib/utils.ts`, `lib/auth.ts`, `lib/permissions.ts`.
- `lib/sla.ts` — `deriveSlaTargetMinutes`, `computeSlaState`, `elapsedMinutes`.
- `lib/time.ts` — Asia/Jerusalem timezone display helpers.
- `lib/audit.ts` — `writeAudit()` for append-only audit log inside transactions.
- `lib/jobs/lifecycle.ts` — full transition table, `isTransitionAllowed`, `resolveActorRelation`, `isReopening`.
- `lib/i18n/en.json`, `lib/i18n/he.json`, `lib/i18n/index.ts` — English and Hebrew strings.
- `types/next-auth.d.ts` — session, JWT, User type augmentation.
- `middleware.ts` — route auth gate.
- `app/layout.tsx` — reads `locale` cookie, sets `<html lang dir>` for RTL.
- `app/globals.css` — shadcn CSS variables.
- `app/(auth)/login/page.tsx` — credentials form.
- `app/api/auth/[...nextauth]/route.ts`.
- `app/(portal)/layout.tsx` — portal shell with sidebar and header.
- `app/(portal)/dashboard/page.tsx` — skeleton (live data added later).
- `app/(portal)/settings/page.tsx` — profile display.
- `app/api/health/route.ts`.
- shadcn primitives: Button, Input, Label, Card, Separator.
- `components/layout/` — Sidebar, Header, LanguageToggle, UserMenu.
- `components/shared/EmptyState`.
- `tests/unit/lifecycle.test.ts` (18), `permissions.test.ts` (24), `sla.test.ts` (14).
- `e2e/login.spec.ts` (5 Playwright scenarios).

---

## Docker Compose Setup

**Status: Working**
Date: 2026-05-15

- `docker-compose.yml` — PostgreSQL 16 Alpine, port 5433→5432, named volume, healthcheck.
- Port 5433 avoids conflict with any existing local Postgres on 5432.
- `DATABASE_URL` in `.env.local` uses port 5433.
- Migration `20260515091525_init` applied and up to date.

### Quick start

```bash
pnpm install
pnpm db:fresh       # starts Docker, runs migration, seeds demo data
pnpm dev            # http://localhost:3000
```

Login: `admin.ceo` / `changeme123` (placeholder — change before pilot).

### DB scripts

| Script | Action |
|---|---|
| `pnpm db:up` | Start the Postgres container |
| `pnpm db:down` | Stop and remove the container |
| `pnpm db:migrate` | Apply pending Prisma migrations |
| `pnpm db:seed` | Insert or update fixture + demo data |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:reset` | Drop + recreate schema, re-seed |
| `pnpm db:fresh` | `db:up` + `db:migrate` + `db:seed` |

---

## Phase 2 — Core Jobs

**Status: Complete**
Date: 2026-05-15

### What was built

**API routes:**
- `app/api/jobs/route.ts` — GET (permission-filtered list) + POST (admin create).
- `app/api/jobs/[id]/route.ts` — GET detail + PATCH admin update.
- `app/api/jobs/[id]/transitions/route.ts` — POST with full lifecycle validation and audit.
- `app/api/jobs/[id]/work-report/route.ts` — POST mark-done with WorkReport.
- `app/api/jobs/[id]/time-sessions/route.ts` — GET list + POST start session (backend only, no UI).
- `app/api/hub/[scope]/route.ts` — GET available jobs in hub scope.
- `app/api/hub/[scope]/take/route.ts` — POST take (conditional update, concurrency-safe).
- `app/api/tags/route.ts` — GET all tags.

**Lib:**
- `lib/api-utils.ts` — requireAuth, forbidden, badRequest, notFound helpers.
- `lib/jobs/queries.ts` — permission-filtered list and detail queries. Supports `showClosed` filter.
- `lib/jobs/numbers.ts` — sequential YYYY-NNNN public number generator.

**Pages:**
- `app/(portal)/my-jobs/page.tsx`.
- `app/(portal)/my-jobs/[id]/page.tsx` — job detail with timeline and actions.
- `app/(portal)/department-jobs/page.tsx`.
- `app/(portal)/department-jobs/[dept]/page.tsx`.
- `app/(portal)/global-jobs/page.tsx`.
- `app/(portal)/hub/page.tsx` — redirects to user scope.
- `app/(portal)/hub/[scope]/page.tsx` — React Query, 30s refresh, take action.

**Components:**
- `components/jobs/` — JobStatusChip, JobPriorityChip, JobSeverityChip, JobSlaBar, JobTagChips, JobRow, JobTimeline, JobTransitionButtons, MarkDoneSheet, CreateJobDialog, JobsPageHeader, HubView.
- `components/providers/QueryProvider.tsx`.
- UI primitives: Badge, Textarea, Skeleton.

---

## Usability Pass — Live Dashboard, Job Filters, Stub Pages

**Status: Complete**
Date: 2026-05-15

### What was built

**Bug fix:**
- `app/api/hub/[scope]/route.ts` and `take/route.ts` — changed `Params` from narrow `Scope` type alias to `string`. Scope validated at runtime. Fixes `.next/types/validator.ts` typecheck error.

**Dashboard live data:**
- `lib/dashboard/queries.ts` — `getAdminKpis`, `getAdminDashboardLists`, `getEmployeeKpis`, `getEmployeeDashboardLists`.
- `lib/feature-flags.ts` — `getFeatureFlag`, `getFeatureFlags` helpers.
- `app/(portal)/dashboard/page.tsx` — wired to real Prisma queries. Admin sees live KPI strip, reviews-pending list, waiting-for-admin list, delayed jobs. Employee sees working list and assigned list.

**Stub pages (all sidebar 404s resolved):**
- `app/(portal)/communication/page.tsx` — accessible to all, explains Phase 4.
- `app/(portal)/clients/page.tsx` — admin-only, explains Phase 5 + inputs needed.
- `app/(portal)/billing/page.tsx` — admin-only, lists planned billing features.
- `app/(portal)/receipts/page.tsx` — admin-only, includes compliance-hold banner.
- `app/(portal)/financial-documents/page.tsx` — admin-only, reads `financial_documents_module` feature flag.
- `app/(portal)/statistics/page.tsx` — admin-only, lists planned metrics.
- `app/(portal)/agent/page.tsx` — admin-only, reads `agent_control_center_module` flag, shows capability list and permissions table.
- `app/(portal)/admin/page.tsx` — admin-only, live feature flags from DB, user count, Phase 9 preview.

**Job list filters:**
- `components/jobs/JobFiltersBar.tsx` — client component. Search input (debounced 350ms), priority chips, show-closed toggle, clear all. Updates URL params via `router.replace` (no page reload).
- `lib/jobs/queries.ts` — `showClosed?: boolean` added to `JobFilters`. `false` = active statuses only, `true` = closed only, `undefined` = all (API default unchanged).
- `app/(portal)/my-jobs/page.tsx`, `department-jobs/[dept]/page.tsx`, `global-jobs/page.tsx` — all accept `searchParams`, pass to query and filter bar.

### Validation results

- `pnpm typecheck`: clean, 0 errors.
- `pnpm lint`: clean, 0 warnings or errors.
- `pnpm test`: 56/56 unit tests pass.
- `pnpm exec prisma migrate status`: up to date.
- Dev server: starts in ~1.7 s.

---

## Blocking items before pilot launch

- Real client list. Seed uses placeholders.
- Real employee identities and emails.
- Skyware IT LTD legal details (Hebrew name, ח.פ., VAT number, address) for receipt headers.
- Israeli VAT rate and allocation-number requirement verified by accountant.
- Accountant sign-off before flipping `receipt_finalize_enabled` to true.

---

## Phase 3 — Productivity

**Status: Complete for committed scope** (saved views deferred; see audit).

### Phase 3 audit checklist

Code and routes were reviewed against this doc. Latest command run: `pnpm typecheck`, `pnpm lint`, `pnpm test` (all pass; see Validation results).

| Item | Status |
|------|--------|
| Active timer UI (`TimerBar`, `/api/timer`, pause/resume/stop, job actions + `MarkDoneSheet` pre-fill from sessions) | Done |
| Global search (`/api/search`, `GlobalSearch` in header, permission-filtered jobs) | Done |
| Settings display name save (`PATCH /api/users/me`, `DisplayNameForm`) | Done |
| Settings password change (`POST /api/users/me/password`, `PasswordForm`, bcrypt + audit) | Done |
| Context-aware job detail back link (`?from=` on list pages, `my-jobs/[id]` reads param) | Done |
| CreateJobDialog employee assignment (`GET /api/users`, admin dropdown, optional assign on create) | Done |
| Saved views (`SavedView` model in Prisma only; no API/UI under `app/`, `components/`, `lib/`) | Deferred (documented below) |

**Minor gaps (not blocking Phase 4):**

- No **idle warning** UI on the timer (bar + controls exist).
- **Sign out** does not auto-stop an active session (`UserMenu` calls `signOut` only).
- **`docs/current-implementation-audit.md`** still describes pre-Phase-3 behavior for search, settings, timer, CreateJob, and back link; use this file for Phase 3 truth.

### What was built

**API routes:**
- `app/api/timer/route.ts` — GET current user's active/paused session (with job include).
- `app/api/timer/[sessionId]/route.ts` — PATCH pause / resume / stop. Tracks `accumulatedMinutes` precisely.
- `app/api/search/route.ts` — GET permission-filtered job search (title, description, publicNumber, ilike). Returns max 15 results.
- `app/api/users/me/route.ts` — PATCH display name with audit log.
- `app/api/users/me/password/route.ts` — POST password change (verifies current, bcrypt hash, audit log).
- `app/api/users/route.ts` — GET active users list (admin-only, for assignment dropdowns).

**Components:**
- `components/timer/TimerBar.tsx` — floating sticky bar, fixed to bottom/start (RTL-safe). Shows live elapsed time (ticks every 30s), pause/resume/stop buttons. Mounts in portal layout behind `QueryProvider`.
- `components/settings/DisplayNameForm.tsx` — live form wired to PATCH /api/users/me. Shows save confirmation.
- `components/settings/PasswordForm.tsx` — live form wired to POST /api/users/me/password. Validates match and length client-side.
- `components/jobs/CreateJobDialog.tsx` — employee assignment dropdown. Loads `/api/users`, filters by selected department.

**Pages / wiring:**
- `app/(portal)/layout.tsx` — mounts `<TimerBar />` inside `QueryProvider`.
- `app/(portal)/settings/page.tsx` — renders `DisplayNameForm` and `PasswordForm`.
- `app/(portal)/my-jobs/page.tsx` — job links pass `?from=my-jobs`.
- `app/(portal)/department-jobs/[dept]/page.tsx` — job links pass `?from=department-jobs`.
- `app/(portal)/global-jobs/page.tsx` — job links pass `?from=global-jobs`.
- `app/(portal)/my-jobs/[id]/page.tsx` — reads `?from=` param, renders correct back link label and href.
- `components/jobs/JobTransitionButtons.tsx` — "Start timer" button calls POST /api/jobs/[id]/time-sessions, invalidates `active-timer` query. "Mark done" pre-fetches session total and passes to `MarkDoneSheet`.
- `components/layout/GlobalSearch.tsx` — wired to GET /api/search, debounced 300ms, keyboard shortcut `/`, click-outside close, dropdown with job results.

**Bug fixes (typecheck errors):**
- `app/api/search/route.ts` — typed `scopeWhere` as `Prisma.JobWhereInput`, cast `departmentKey` to `DepartmentKey`, switched secondary permission check to use `assignedEmployeeId` from select instead of inline sentinel.
- `app/(portal)/settings/page.tsx` — read display name from `session.user.name` (DefaultSession field) before casting to `SessionUser`.
- `components/layout/GlobalSearch.tsx` — removed unused `router` assignment.
- `components/timer/TimerBar.tsx` — removed unused `useCallback` import.

**Not implemented (deferred):**
- SavedView API and UI — schema model exists; no app code started. Per Phase 3 constraint ("only if already partially started"), deferred to Phase 4+.

### Validation results (audit run)

- `pnpm typecheck`: clean, 0 errors.
- `pnpm lint`: clean, 0 warnings or errors (Next.js may print a deprecation notice for `next lint`; ESLint reported no issues).
- `pnpm test`: 56/56 pass.

**First delivered:** 2026-05-15. **Audit / validation refreshed:** same checklist and commands re-run during Phase 3 completion audit.

---

---

## Phase 4 — Communication

**Status: Complete for committed scope.**
Date: 2026-05-15

### What was built

**Lib:**
- `lib/communication/queries.ts` — `getChannelOrNull`, `listVisibleChannels`, `listChannelPosts`, `getPostWithReplies`, `isValidChannelKey`. All enforce permission via `canPostInChannel`.

**API routes:**
- `app/api/channels/route.ts` — GET list of channels visible to the current user.
- `app/api/channels/[key]/posts/route.ts` — GET posts (with optional `search` and `resolved` query params). POST create post (with optional tag keys and related job).
- `app/api/channels/[key]/posts/[id]/route.ts` — GET post detail with replies. PATCH toggle `resolved` (author or admin) or `pinned` (admin only) with audit log.
- `app/api/channels/[key]/posts/[id]/replies/route.ts` — POST create reply with audit log.

**Search extension:**
- `app/api/search/route.ts` — now accepts `scope=jobs|posts|all`. Posts scope returns permission-filtered post results (title, channelKey, author, createdAt). Existing `scope=jobs` behavior unchanged; `GlobalSearch` in header continues to use `scope=jobs` only (footer text in dropdown is still stale; see `docs/phase-4-communication-audit.md`).

**Components:**
- `components/communication/ComposePost.tsx` — collapsible compose form. Loads communication-scoped tags from `/api/tags`. Submits to channel posts API, then `router.refresh()`.
- `components/communication/ComposeReply.tsx` — inline reply textarea. Submits to replies API, then `router.refresh()`.
- `components/communication/PostActions.tsx` — "Mark resolved / Resolved" and "Pin / Unpin" buttons. Calls PATCH, guarded by `isAuthor`/`isAdmin` props. `router.refresh()` on success.

**Pages:**
- `app/(portal)/communication/page.tsx` — replaces stub. Shows channel cards with post counts. Permission-filtered (employees see Global + own dept; admins see all four).
- `app/(portal)/communication/[channel]/page.tsx` — channel page. Lists posts ordered pinned-first then newest. Search input (native form GET). Resolved filter toggle link. `ComposePost` form.
- `app/(portal)/communication/[channel]/[postId]/page.tsx` — post detail. Full body with `dir="auto"` for RTL. Status badges (pinned/resolved). Related job link. Reply thread. `ComposeReply` form. `PostActions` for author/admin controls.

**Permissions enforced at API layer:**
- Global channel: all authenticated users.
- Department channels (helpdesk, it, rnd): employees in that department + admins.
- Resolve toggle: post author or admin.
- Pin toggle: admin only.

**Not implemented (deferred):**
- Attachments on posts and replies (schema ready, no upload infrastructure).
- Related client picker (client list not yet built — Phase 5).
- Full-text index on post body (ilike used; acceptable at MVP scale).
- Notifications.

### Validation results

- `pnpm typecheck`: clean, 0 errors.
- `pnpm lint`: clean, 0 warnings or errors.
- `pnpm test`: 56/56 pass (no schema changes; existing tests unaffected).
- `pnpm exec prisma migrate status`: up to date.

**Phase 4 audit:** `docs/phase-4-communication-audit.md` (2026-05-15).

---

## Phase 5: Clients

**Status:** Complete for committed scope (2026-05-15).

### API routes built

| Route | Method | Description |
|---|---|---|
| `/api/clients` | GET | List clients with search + status filter. Admin only. |
| `/api/clients` | POST | Create client + auto-create BillingAccount. Admin only. Audit logged. |
| `/api/clients/[id]` | GET | Client detail with billing account and job/payment/receipt counts. Admin only. |
| `/api/clients/[id]` | PATCH | Update client fields. Admin only. Audit logged. |
| `/api/clients/[id]/environment-notes` | GET | List environment notes for a client. Admin only. |
| `/api/clients/[id]/environment-notes` | POST | Upsert note for a section (one canonical note per section). Admin only. Audit logged. |

### Pages built

| Page | Path | Description |
|---|---|---|
| Client list | `/clients` | Admin-facing. Search, status filter, card list, Add client dialog. |
| Client detail | `/clients/[id]` | Tabs: Overview, Jobs, Billing (placeholder), Receipts (placeholder), Environment. |

### Components built

- `components/clients/ClientDialog.tsx` — create/edit dialog for all client fields.
- `components/clients/ClientsPageHeader.tsx` — header with "Add client" button.
- `components/clients/ClientDetailHeader.tsx` — company name, contact, edit button.
- `components/clients/ClientFiltersBar.tsx` — search + status filter (URL-driven).
- `components/clients/EnvironmentNotesSection.tsx` — client component, all 8 sections, inline edit.

### Library

- `lib/clients/queries.ts` — `listClients`, `getClientDetail`, `getClientJobs`, `getClientEnvironmentNotes`.

### Permissions

- All mutations admin-only (`isAdmin()` check at API layer).
- Read (client detail + notes) also admin-only for this phase.

### Security / safety notes

- `ClientEnvironmentNote` stores reference text only; disclaimer shown in UI.
- Israeli tax ID marked as "reference only — validate before use in tax documents".
- No real client data, credentials, or tax numbers invented.

### BillingAccount

- Auto-created in a `$transaction` when a client is created.
- Billing tab in client detail shows Phase 6 placeholder.

### Not implemented (deferred)

- Client saved views (Phase 5 scope, documented for future).
- `relatedPosts` link from communication posts to clients (UI deferred; schema ready).
- Non-admin read access (current: admin-only; can be relaxed in a future pass).

### Validation results

- `pnpm typecheck`: clean, 0 errors.
- `pnpm lint`: clean, 0 warnings or errors.
- `pnpm test`: 56/56 pass.
- `pnpm exec prisma migrate status`: up to date (no schema changes needed).

**Phase 5 audit:** `docs/phase-5-clients-audit.md` (2026-05-15).

---

## Phase 3–5 Cleanup Pass

**Status: Complete.**
Date: 2026-05-15

### What was fixed

| Gap | Resolution |
|-----|-----------|
| Client search missing phone | `lib/clients/queries.ts` OR clause extended to include `phone`. |
| Client PATCH audit `old: null` | `app/api/clients/[id]/route.ts` expanded select to all patchable fields; diff now contains real before/after values. |
| No DELETE for environment notes | New route `app/api/clients/[id]/environment-notes/[noteId]/route.ts` — admin-only DELETE with audit log. |
| No Clear button in environment UI | `EnvironmentNotesSection` now tracks note IDs per section; shows Trash2/Clear button when a note exists; calls DELETE on confirm; updates state without page reload. |
| Job creation has no client selector | `CreateJobDialog` fetches `/api/clients?status=active` on mount; optional client dropdown shown when clients exist; `clientId` passed to POST /api/jobs (already accepted by schema). |
| GlobalSearch shows only jobs | `GlobalSearch` now uses `scope=all`; shows jobs and posts in separate labeled sections; stale "Posts — available after Communication is built" footer removed. |
| `relatedJobId` not validated on post create | `app/api/channels/[key]/posts/route.ts` now queries job existence and permission before transaction; returns 400 for inaccessible or nonexistent job IDs. |
| Invalid `onClick` on server Link in post detail | `onClick={(e) => e.stopPropagation()}` removed from related-job Link in `app/(portal)/communication/[channel]/[postId]/page.tsx`. |
| No idle warning on timer | `TimerBar` now shows amber color and "· timer running long" label when session exceeds 8 hours while running. |

### Deferred (documented, not implemented)

- **Sign-out auto-stop**: Stopping the active timer on sign-out would require intercepting the Auth.js `signOut` flow server-side or adding a client-side `beforeunload`/`signOut` hook in `UserMenu`. Both carry risk of partial state. Deferred; documented in UserMenu comments.
- **Saved views**: `SavedView` schema entity exists but no API or UI. URL-based filters already work for job and client lists. Full saved view management deferred to a future productivity/admin phase.
- **Related job picker on compose form**: API accepts `relatedJobId`; compose form has no picker UI. Deferred — building a job search picker inline in compose is low priority.
- **Attachments**: Schema ready; deferred until file storage is decided.

### Files changed

- `lib/clients/queries.ts`
- `app/api/clients/[id]/route.ts`
- `app/api/clients/[id]/environment-notes/[noteId]/route.ts` (new)
- `components/clients/EnvironmentNotesSection.tsx`
- `components/jobs/CreateJobDialog.tsx`
- `components/layout/GlobalSearch.tsx`
- `app/api/channels/[key]/posts/route.ts`
- `app/(portal)/communication/[channel]/[postId]/page.tsx`
- `components/timer/TimerBar.tsx`

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `pnpm exec prisma migrate status` | Up to date — no schema changes |

---

## Phase 6 — Billing

**Status: Complete for committed scope.**
Date: 2026-05-15

### What was built

**Library:**
- `lib/billing/queries.ts` — `getClientBillingData`, `listPayments`, `getBillingKpis`, `getPaymentById`, `getAgingPayments`.

**API routes:**
- `app/api/billing/payments/route.ts` — GET (list with status/client filter) + POST create.
- `app/api/billing/payments/[id]/route.ts` — GET detail + PATCH status update (mark paid with paidDate, method, reference).
- `app/api/clients/[id]/billing/monthly-items/route.ts` — GET + POST.
- `app/api/clients/[id]/billing/monthly-items/[itemId]/route.ts` — PATCH + DELETE.
- `app/api/clients/[id]/billing/hourly-banks/route.ts` — GET + POST.
- `app/api/clients/[id]/billing/hourly-banks/[bankId]/route.ts` — PATCH + DELETE.
- `app/api/clients/[id]/billing/hourly-banks/[bankId]/usages/route.ts` — GET + POST.
- `app/api/clients/[id]/billing/one-time-charges/route.ts` — GET + POST.
- `app/api/clients/[id]/billing/one-time-charges/[chargeId]/route.ts` — PATCH + DELETE.

All mutations: admin-only, Zod-validated, audit logged.

**Components:**
- `components/billing/PaymentStatusChip.tsx` — status badge for all 7 payment statuses.
- `components/billing/BurnRateBar.tsx` — hourly bank burn-rate progress bar with low-balance warning.
- `components/billing/MarkPaidSheet.tsx` — modal sheet for updating payment status; handles mark-paid flow (paidDate, method, reference, notes); includes Phase 7 receipt handoff placeholder.
- `components/billing/ClientBillingTab.tsx` — full client-side billing tab with inline create dialogs for monthly items, hourly banks, one-time charges, and payments list with update button.
- `components/billing/BillingPageActions.tsx` — "Update" button client component for the global billing page row actions.

**Pages:**
- `app/(portal)/billing/page.tsx` — full billing dashboard: KPI strip (unpaid/overdue/paid-this-month), aging payments list, paginated payment table with status filter chips.
- `app/(portal)/clients/[id]/page.tsx` — billing tab now renders real data via `ClientBillingTab`; `BillingPlaceholder` removed.

**Dashboard:**
- `lib/dashboard/queries.ts` — `getAdminKpis()` now calls `getBillingKpis()`; returns `unpaidCount` and `overdueCount` (replaces `unpaidPlaceholder: 0`).
- `app/(portal)/dashboard/page.tsx` — "Unpaid" KPI card shows live count with overdue note.

### Key decisions

- Amounts stored as nullable `Int` (`*Placeholder` fields). Displayed as integers with currency symbol. UI includes disclaimer: "reference placeholders only — not verified accounting figures."
- Payment status transitions are not a strict state machine at the API layer; valid enum values are accepted. The UI `MarkPaidSheet` shows only contextually allowed transitions.
- Mark-paid requires `paidDate` and `method` when `status = paid`; enforced at the PATCH route.
- Receipt creation after mark-paid is a static placeholder note in `MarkPaidSheet`; not implemented. Phase 7 handles receipts.
- No real prices, client billing data, or tax calculations invented.

### Not implemented (deferred)

- Saved views on billing (deferred; URL-based status filter works).
- Payment create dialog in global billing page UI (payments are created from the client billing tab context).
- Time-bucketed aging strips (dashboard shows flat counts; acceptable for MVP).

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `pnpm exec prisma migrate status` | Up to date — no schema changes |

---

## Phase 6–7 Cleanup Pass

**Status: Complete.**
Date: 2026-05-15

### Gaps fixed

| Gap | Fix |
|-----|-----|
| Phase 6 Gap 2 — No UI to log hourly bank usage | Added "Log usage" button per hourly bank card in `HourlyBanksSection`. Dialog: Job ID, hours (decimal → minutes), optional note. POST to hourly-banks/[bankId]/usages. |
| Phase 6 Gap 3 — No create-payment UI | Added "Create payment" button + dialog to `PaymentsSection`. Fields: sourceType, optional source dropdown, amount, currency, issuedDate, dueDate, notes. Creates as `draft`. |
| Phase 6 Gap 4 — Source not linked when creating payments | Create-payment dialog shows client's monthly items or hourly banks in a contextual dropdown; selected item sets `sourceMonthlyId` or `sourceHourlyId`. |

### Deferred

- Phase 6 Gap 1 — No edit dialogs for monthly items, hourly banks, one-time charges. Admin can delete and recreate. Deferred to Phase 8+ or admin panel pass.
- Phase 7 — Not yet implemented. No Phase 7 cleanup possible; only a stub page exists.

### Files changed

- `components/billing/ClientBillingTab.tsx` — Log usage dialog in `HourlyBanksSection`; Create payment dialog + source dropdown + props in `PaymentsSection`.

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `prisma migrate status` | Up to date — no schema changes |

**Phase 7 Receipts is safe to start.** The create-payment UI gap that was the remaining pre-condition is now resolved.

---

## Phase 7 scope (skipped in this pass — see Phase 8 below)

Per `docs/internal-management-portal-final-plan/04-mvp-build-plan.md`:

- ReceiptDocument with all six types.
- ReceiptDocumentSequence numbering.
- Draft and finalize flow behind `receipt_finalize_enabled` feature flag.
- HTML view with verification banner.
- Link from mark-paid → receipt draft with payment pre-filled.

---

## Phase 8 — Statistics + Email-to-Job

**Status: Complete for committed scope.**
Date: 2026-05-15

### What was built

**Library:**
- `lib/statistics/queries.ts` — `getOverviewKpis`, `getEmployeeStats`, `getDepartmentStats`, `getClientStats`. All queries respect an optional `rangeDays` (7/30/90) date filter. No unbounded aggregations; employee loop capped at active users; clients capped at 100; avg-completion sample capped at 500.

**API route:**
- `app/api/statistics/route.ts` — GET, admin-only. Returns `{ overview, employees, departments, clients, rangeDays }`. Query param `?range=7|30|90` (default 30).

**Pages:**
- `app/(portal)/statistics/page.tsx` — Replaces stub. Server-rendered. Range filter via URL (`?range=`). Sections: Overview KPIs (8 cards), Employee activity table, Department activity table, Client workload table. Empty states per section. Operational framing note in footer.
- `app/(portal)/statistics/email-to-job/page.tsx` — Admin-only. Renders `EmailToJobForm`.

**Component:**
- `components/jobs/EmailToJobForm.tsx` — Client component. Fields: sender, subject, body, department, client (optional, fetches `/api/clients?status=active`), priority, severity, send-to-hub checkbox. Submits to `POST /api/jobs` with `source: "email_manual"`. Disclaimer banner makes clear this is manual paste, not real email ingestion. Shows success state with "View job" and "Create another" buttons.

### Permissions

- `/statistics` page: `isAdmin` redirect at page level; API route: `requireAuth` + `isAdmin` → 403.
- `/statistics/email-to-job`: `isAdmin` redirect at page level; job creation via existing `POST /api/jobs` which also enforces admin-only.

### Security / safety notes

- No email inbox, IMAP, SMTP, Gmail, or credentials involved.
- No credentials stored in `EmailToJobForm` or the job description.
- Job `source` set to `email_manual`; existing audit log on `job.created` covers traceability.

### Overview KPI metrics

| Metric | Source |
|---|---|
| Active jobs | `count(status in ACTIVE_STATUSES)` |
| Completed | `count(status in [done, reviewed], completedTimestamp in range)` |
| Reviewed | `count(status = reviewed, reviewedTimestamp in range)` |
| Delayed | active jobs where elapsed > slaTargetMinutes (JS filter) |
| Reopened | `count(JobStatusEvent where reopened=true)` |
| Hours reported | `sum(timeSpentMinutes)` on closed jobs |
| Avg. completion | `mean(completedAt - assignedAt)` on last 500 closed jobs |
| Cancelled | `count(status = cancelled)` |

### Not implemented (deferred)

- CSV export (mentioned in plan; deferred — no file-generation dependency added).
- Billing/payment summary on statistics page (data exists via Phase 6 billing queries; would add a section — deferred to keep scope focused).
- Per-employee completion time breakdown.
- Hub take latency metric.

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `prisma migrate status` | Up to date — no schema changes |

---

## Phase 9 — Admin Panel

**Status: Complete for committed scope.**
Date: 2026-05-16

### What was built

**API routes (all admin-only, Zod, audit logged):**
- `app/api/admin/users/route.ts` — GET all users (active+inactive) + POST create (bcrypt, uniqueness check).
- `app/api/admin/users/[id]/route.ts` — PATCH update display name, role, department, isActive.
- `app/api/admin/users/[id]/password/route.ts` — POST admin password reset (no current password required; never logs plaintext).
- `app/api/admin/tags/route.ts` — POST create tag (key/labels/scope/color, key uniqueness check).
- `app/api/admin/tags/[id]/route.ts` — PATCH update labels/color; DELETE guarded by isSystem and usage count.
- `app/api/admin/feature-flags/[key]/route.ts` — PATCH toggle, audit logged.
- `app/api/admin/audit-logs/route.ts` — GET paginated 25/page, filter by action or entityType.

**Client components:**
- `components/admin/UserManagementSection.tsx` — user table, create/edit/reset-pw/deactivate/reactivate dialogs.
- `components/admin/TagManagementSection.tsx` — tag table, create/edit/delete (delete disabled for system/used tags).
- `components/admin/FeatureFlagSection.tsx` — toggle per flag; extra confirmation dialog before enabling receipt_finalize_enabled.

**Admin page (`/admin`):**
Fully replaced with 6-tab interface: Users, Tags, Feature Flags, Audit Log, SLA Defaults, Company Details.
- Users tab: renders `UserManagementSection` with server-fetched user list, role options, dept options.
- Tags tab: renders `TagManagementSection` with all tags including usage counts.
- Feature Flags tab: renders `FeatureFlagSection`.
- Audit Log tab: server-rendered paginated table; HTML GET form for action/entityType filter; pagination via URL params.
- SLA Defaults tab: read-only table of current hardcoded values from `lib/sla.ts`; note that editing requires code change.
- Company Details tab: disabled placeholder fields; amber banner noting accountant verification required.

**Improved placeholder pages:**
- `/financial-documents` — document category cards, filter preview chips, upload/email ingestion placeholder, feature-flag status badge.
- `/agent` — status card, planned capabilities, permissions table, future integrations, recent actions empty state.

### Security / safety notes

- Password hash never logged or returned in any response.
- Tag deletion refused if `isSystem=true` or if the tag has any `jobTags` or `postTags` references.
- `receipt_finalize_enabled` flag toggle shows an extra confirmation dialog before enabling.
- Deactivated users cannot log in (`lib/auth.ts` checks `isActive`). Existing JWT sessions remain valid until expiry — documented in UI.
- No real employee identities, credentials, or tax details invented.

### Not implemented (deferred)

- Company details storage: needs a `CompanySettings` DB table (no schema change in this pass). Shown as disabled placeholder.
- SLA defaults DB-backed editing: currently hardcoded in `lib/sla.ts`. Shown as read-only.
- Email change for users: username/email editing not exposed (deferred; password reset is sufficient for pilot).

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `prisma migrate status` | Up to date — no schema changes |

---

## Phase 8–9 Cleanup Pass

**Status: Complete.**
Date: 2026-05-16

### Issues fixed

| Issue | Fix |
|---|---|
| Feature flag toggle silent failure (Phase 9) | `FeatureFlagSection.doToggle` now checks `res.ok`; shows inline error banner on failure. |
| User PATCH audit diff `old: null` for role/dept (Phase 9) | `GET` for existing user now joins `role.key` and `department.key`; diff records real before/after values. |
| Self-deactivation not blocked (Phase 9) | `PATCH /api/admin/users/[id]` returns 400 if actor sets `isActive: false` on their own account. |
| Self-role-downgrade not blocked (Phase 9) | Same route returns 400 if actor changes their own role. |
| Roles/Departments overview tab missing (Phase 9) | Added "Roles & Depts" tab to `/admin` with read-only role and department tables (name, active user count, admin/global badges). |

### Phase 8 gaps — all deferred

All Phase 8 gaps in the audit (CSV export, billing summary on statistics, chart view, per-employee filter, heading label) are large features or inconsequential cosmetic issues. None were fixed in this pass.

### Files changed

- `components/admin/FeatureFlagSection.tsx` — error state + `res.ok` check
- `app/api/admin/users/[id]/route.ts` — join role/dept in existing fetch, real diff values, self-deactivation and self-role-downgrade guards
- `app/(portal)/admin/page.tsx` — "Roles & Depts" tab, `OrgTab` component, `getOrgRoles`/`getOrgDepts` fetchers

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `prisma migrate status` | Up to date — no schema changes |

**Phase 10 Hardening is safe to start.**

---

## Phase 10 — Hardening

**Status: Complete for committed scope.**
Date: 2026-05-16

### What was built

**Security headers (`next.config.ts`):**
Added for all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment blocked), `Strict-Transport-Security` (max-age 2 years). CSP deferred — requires per-request nonce injection for App Router (documented in `docs/production-readiness.md`).

**Rate limiting (`lib/rate-limit.ts`):**
Simple in-memory rate limiter (5 attempts / 15 min per IP) applied to `POST /api/users/me/password` and `POST /api/admin/users/[id]/password`. Single-process only; Redis required for multi-instance deployments (documented). Login endpoint rate limiting deferred to reverse-proxy/WAF layer.

**Audit log hardening (`lib/audit.ts`):**
Expanded `REDACTED_FIELDS` set from 2 to 12 entries: covers `password`, `newPassword`, `currentPassword`, `secret`, `token`, `apiKey`, `api_key`, `accessToken`, `access_token`, `refreshToken`, `refresh_token` in addition to the existing `passwordHash` / `password_hash`.

**Error boundaries:**
- `app/error.tsx` — global error boundary (catches root-level render errors, shows recovery UI).
- `app/(portal)/error.tsx` — portal-scoped error boundary (catches errors within the portal layout).

**Test coverage expansion:**
- `tests/unit/billing-permissions.test.ts` — 30 new tests: `canManageBilling`, `canFinalizeReceipt`, `canAccessPage` for all 7 admin-only pages and 7 employee-accessible pages.
- `tests/unit/audit-redaction.test.ts` — 8 new tests: verifies all 12 REDACTED_FIELDS are redacted and safe fields are not.
- `e2e/admin-access.spec.ts` — ~15 Playwright tests: admin page access, employee redirect from admin-only pages, unauthenticated redirect. **Requires live server + seeded DB.**

**Production documentation (`docs/production-readiness.md`):**
- Local dev quick start + demo credentials warning.
- Environment variables table.
- DB backup/restore commands (pg_dump/psql via Docker).
- Production deployment checklist (8 pre-pilot items).
- Pre-billing/receipt go-live checklist (accountant sign-off steps).
- Security headers summary.
- Rate limiting limitation and Redis upgrade path.
- Known placeholders and feature flags table.
- Test coverage summary.
- Pilot launch blockers list.
- Monitoring/observability notes.

### Not implemented (deferred / documented)

- **CSP** — deferred; documented in `docs/production-readiness.md`.
- **Rate limiting on login endpoint** — deferred to reverse proxy/WAF; documented.
- **Redis-backed rate limiter** — documented as required for multi-instance production.
- **RTL per-page audit** — `dir="auto"` is set on user-content fields; full RTL pass deferred.
- **SLA DB-backed editing** — hardcoded; deferred.
- **Company details storage** — placeholder; deferred.
- **Playwright e2e run** — tests written; not runnable in this session (requires live dev server + seeded DB).

### Validation results

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 96/96 (40 new tests) |
| `prisma migrate status` | Up to date — no schema changes |
| Playwright e2e | Tests written; require live server to run |

---

## Pilot readiness

The portal is ready for internal pilot testing with the following pre-launch steps (see `docs/production-readiness.md`):
1. Change all demo passwords.
2. Set a strong `NEXTAUTH_SECRET`.
3. Replace seeded placeholder data.
4. Keep `receipt_finalize_enabled = false` until accountant sign-off.
5. Configure production PostgreSQL with automated backups.
6. Configure HTTPS (HSTS header is already present).

---

## UX/UI Enhancement Pass — 2026-05-16

Scope: non-functional polish across navigation, dashboard, and shared components. No business logic, schema, or API changes. All Phase 0–10 functionality preserved; routes unchanged; permissions unchanged.

### Design tokens
- `app/globals.css`: refined neutral palette, added `--brand`, `--brand-soft`, semantic surface tokens (`--success`, `--warn`, `--danger` + `-soft`), softer borders, and an `.app-shell-bg` layered backdrop used by `(portal)/layout.tsx`. Dark theme tokens updated to match.
- `tailwind.config.ts`: exposed `brand`, `success`, `warn`, `danger` color scales for utility access.

### Shared components (new, in `components/shared/`)
- `PageHeader.tsx` — icon tile + title + description + actions slot + optional meta row. Used on Dashboard, Billing, Communication, Admin, Clients, My Jobs.
- `KpiCard.tsx` — semantic `tone` prop (`default | brand | warn | danger | success`), icon, optional `href`, optional `note`. Replaces three bespoke KPI variants previously living inline.
- `SectionCard.tsx` — icon + title + count badge + "View all" link + actions slot. Wraps the dashboard list sections and the Billing "Needs attention" list.
- `StatusDot.tsx` — small semantic dot for inline status indicators.

### Navigation
- `Sidebar.tsx`: grouped nav into Overview / Work / Communication / Clients & Billing / Admin / System with subtle section labels and a brand-tinted active state (left rail + soft background). Added branded "Skyware Operations" logo tile. The user identity tile moved here, replacing the inline log-out button in the header.
- `Header.tsx`: slimmed — `GlobalSearch` (max-w-xl), language toggle, and an admin pill. User actions live in the sidebar tile.
- `UserMenu.tsx`: avatar-style tile with initials, name, role, and a compact log-out icon button.

### Dashboard (`app/(portal)/dashboard/page.tsx`)
- Time-aware greeting ("Good morning/afternoon/evening, …") via shared `PageHeader`.
- KPIs use shared `KpiCard` with semantic tones (brand for active, warn/danger for delayed/unpaid).
- Added a role-aware Quick Actions strip (Task Hub, Review jobs, Billing, Clients for admin; My Jobs, Hub, Channels, Department for employees).
- "Needs review" / "Waiting for you" / "Past SLA" wrapped in `SectionCard`s; the Past-SLA card uses warn-tinted surface and spans both columns when present.

### Chips
- `JobPriorityChip` now renders a colored dot before the label for faster scanning (no API change).

### Page-level polish
- Billing: shared `PageHeader` + KPI cards + `SectionCard` for the aging list + shared `EmptyState`. Removed the locally-defined `KpiCard` helper.
- Communication: shared `PageHeader` + `EmptyState`. Channel cards now use brand-soft hover, a count badge in the top-right, and a tighter footer caption.
- Admin: shared `PageHeader`. Tab bar gained `overflow-x-auto` for small screens and switched the active underline to brand color.
- Clients: `ClientsPageHeader` now uses shared `PageHeader`.
- My Jobs: title gets an icon and a role-aware description via `JobsPageHeader`.
- `(portal)/layout.tsx`: layered `.app-shell-bg` backdrop, `max-w-6xl` content container, and a thin scrollbar utility.

### Files changed
- Tokens / config: `app/globals.css`, `tailwind.config.ts`.
- Layout: `app/(portal)/layout.tsx`.
- Layout components: `components/layout/Sidebar.tsx`, `Header.tsx`, `UserMenu.tsx`.
- Shared (new): `components/shared/PageHeader.tsx`, `KpiCard.tsx`, `SectionCard.tsx`, `StatusDot.tsx`.
- Pages: `app/(portal)/dashboard/page.tsx`, `billing/page.tsx`, `communication/page.tsx`, `admin/page.tsx`, `my-jobs/page.tsx`.
- Page header components: `components/jobs/JobsPageHeader.tsx`, `components/clients/ClientsPageHeader.tsx`.
- Chips: `components/jobs/JobPriorityChip.tsx`.

### Validation
| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 96/96 |
| `prisma migrate status` | Not run — no schema changes in this pass |

### Deferred design improvements
- Dark-mode toggle (tokens in place but no UI switcher wired).
- Mobile-first sidebar drawer (sidebar still fixed at `w-56`; acceptable for the small internal team).
- Saved-views UI on My Jobs / Billing (Phase 3/6 backlog item).
- Per-page RTL audit beyond the existing `start-/end-/me-/ms-` utilities and `dir="auto"` on user content.
- Visual treatment for `JobSlaBar` and `JobTimeline` left untouched in this pass.
- Dense `AuditLog` table not migrated to cards (table remains scannable for power users).

---

## Financial Documents Page Finalization — 2026-05-16

Scope: frontend-only finalization of `/financial-documents`. No ingestion, storage, OAuth, OCR, or external integrations. Behavior remains safely inert while `financial_documents_module` is off; the feature flag is NOT enabled by this pass.

### What changed
- `app/(portal)/financial-documents/page.tsx` rewritten end-to-end using the shared `PageHeader`, `SectionCard`, and `EmptyState` components introduced in the UX/UI pass.

### Page composition
1. **Header** with `FileText` icon, title, concise description, and a tone-aware "Module enabled / disabled" pill driven by `getFeatureFlag("financial_documents_module")`.
2. **Disabled banner** (only when the flag is off) with a deep link to `/admin?tab=flags`.
3. **Safety / compliance notice** (warn-soft surface) calling out: no email/IMAP/SMTP/bank/cloud connections; do not paste credentials; admin review required; receipt issuance stays in the separate accountant-verified Receipts module.
4. **Planned workflow** (5-step strip): Receive → Classify → Link → Review → Archive. Each step has its own numbered card with icon and one-line description.
5. **Document categories** — 7 cards covering the categories required by the brief: Client payment confirmations, Supplier invoices, Supplier receipts, Company expenses, Subscription receipts, Tax documents, Bank transfer confirmations. Each card carries a short "related to…" caption.
6. **Filters & search preview** — disabled, decorative form (`pointer-events-none select-none`, native `disabled` on every control) with a "Preview" badge in the section header. Covers search, client, supplier, document type, date range (from/to), review status, linked, source.
7. **Ingestion preview** — two dashed tiles (Email ingestion / Manual upload) each flagged "Not connected" / "Not available", with non-functional copy.
8. **Documents placeholder table** — real `<table>` with the column set from the brief (Document, Type, Source, Linked to, Received, Review, Action) and an inline `EmptyState` in the body — communicates the future shape without inventing rows.
9. **Related areas** — quick links to Clients, Billing, Receipts, and Feature Flags, plus a note pointing readers to `docs/production-readiness.md` for accountant-verification context.

### Safety guarantees
- No new API routes, server actions, file uploads, or database writes.
- Feature flag default remains `false` (unchanged in `prisma/fixtures/feature-flags.json`).
- Admin-only access preserved (`isAdmin` redirect on the server component, identical to the previous page).
- No real client, supplier, payment, tax ID, or company data appears anywhere on the page.

### Files changed
- `app/(portal)/financial-documents/page.tsx`

### Validation
| Check | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 96/96 |
| `prisma migrate status` | Not run — no schema changes |

### Deferred (intentionally out of scope)
- Real email ingestion / IMAP / Gmail OAuth.
- Manual file upload + storage backend.
- OCR / auto-classification.
- DB-backed document, supplier, and expense models.
- CSV / bookkeeping export.
- Full RTL screenshot pass on this page.
