# File-by-File Implementation Plan

Authoritative layout spec.

## 1. Repository state inspection

Current contents of `/Users/jeries/Desktop/projects/Skyware-management/`:

- `.claude/CLAUDE.md`, `.claude/RULES.md`. Project instructions. Do not modify.
- `docs/`. Planning files only. Do not modify outside this folder.
- `docs/internal-management-portal-spec.md`. Original spec. Preserve as history.
- `docs/internal-management-portal-data-model.md`. Original data model. Preserve.
- `docs/internal-management-portal-mvp-plan.md`. Original MVP plan. Preserve.
- `docs/internal-management-portal-enhancement/`. Enhancement pass. Preserve.
- `docs/internal-management-portal-final-plan/`. This folder. The implementation contract.

No application source code exists yet.
The implementation will create the app under a top-level folder.

Reference codebase for visual vocabulary only: `/Users/jeries/Desktop/projects/skyware-com/skyware-site/`. Do not import from it. Reuse Tailwind classes, shadcn/ui components, color palette, fonts.

## 2. Suggested stack

Confirm before coding.

- Next.js 14+ with App Router.
- TypeScript strict.
- Tailwind plus shadcn/ui.
- Postgres 15+.
- Prisma 5 (preferred) or Drizzle.
- Auth.js (NextAuth) or Lucia.
- Zod for validation.
- React Query or SWR for client data fetching.
- S3-compatible object storage.
- Vitest plus React Testing Library.
- Playwright for end-to-end.
- pnpm or npm.

If the user picks a different stack, the entity names and route shapes stay. The folder layout adapts.

## 3. Top-level repository layout

Proposed under repo root.

```
/
  app/                              Next.js routes (App Router)
  components/                       Shared UI components
  lib/                              Shared utilities and clients
  prisma/                           Schema and migrations
  scripts/                          One-off scripts and seeds
  public/                           Static assets
  tests/                            Unit and integration tests
  e2e/                              Playwright tests
  .env.example
  .eslintrc.cjs
  .gitignore
  next.config.ts
  package.json
  postcss.config.js
  tailwind.config.ts
  tsconfig.json
  README.md
  docs/                             Existing planning docs. Do not modify.
```

Pick one of `prisma` or `drizzle/`. Do not create both.

## 4. Route and page structure (`app/`)

Next.js App Router. One folder per route.

```
app/
  layout.tsx                        Root layout, providers, theme, RTL.
  globals.css
  not-found.tsx
  error.tsx
  loading.tsx
  middleware.ts                     Auth gate plus role gate at edge.

  (auth)/
    layout.tsx                      Auth shell, centered card, no sidebar.
    login/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx

  (portal)/
    layout.tsx                      Portal shell with sidebar and header.

    dashboard/page.tsx              Role-aware dashboard.

    my-jobs/page.tsx
    my-jobs/[id]/page.tsx           Job detail.

    department-jobs/page.tsx        Admin unified.
    department-jobs/[dept]/page.tsx Per-department list.

    global-jobs/page.tsx

    hub/page.tsx                    Hub landing, scope picker.
    hub/[scope]/page.tsx            scope in {global, helpdesk, it, rnd}.

    communication/page.tsx          Channel landing.
    communication/[channel]/page.tsx
    communication/[channel]/[postId]/page.tsx

    clients/page.tsx                Admin only.
    clients/[id]/page.tsx           Tabs: overview, jobs, billing, payments, receipts, environment, notes.

    billing/page.tsx
    billing/[paymentId]/page.tsx

    receipts/page.tsx
    receipts/new/page.tsx
    receipts/[id]/page.tsx

    financial-documents/page.tsx    Placeholder, feature-flagged.

    statistics/page.tsx

    agent/page.tsx                  Placeholder, feature-flagged.

    admin/page.tsx
    admin/users/page.tsx
    admin/users/[id]/page.tsx
    admin/tags/page.tsx
    admin/feature-flags/page.tsx
    admin/audit-log/page.tsx
    admin/sla-defaults/page.tsx
    admin/company-details/page.tsx

    settings/page.tsx

  api/                              Route handlers. Server functions are an alternative.
    auth/[...nextauth]/route.ts
    jobs/route.ts
    jobs/[id]/route.ts
    jobs/[id]/transitions/route.ts
    jobs/[id]/time-sessions/route.ts
    jobs/[id]/work-report/route.ts
    hub/[scope]/route.ts
    hub/[scope]/take/route.ts
    clients/route.ts
    clients/[id]/route.ts
    clients/[id]/environment-notes/route.ts
    billing/payments/route.ts
    billing/payments/[id]/route.ts
    billing/payments/[id]/mark-paid/route.ts
    billing/monthly-items/route.ts
    billing/hourly-banks/route.ts
    billing/hourly-banks/[id]/usage/route.ts
    billing/one-time-charges/route.ts
    receipts/route.ts
    receipts/[id]/route.ts
    receipts/[id]/finalize/route.ts
    communication/posts/route.ts
    communication/posts/[id]/route.ts
    communication/posts/[id]/replies/route.ts
    saved-views/route.ts
    saved-views/[id]/route.ts
    search/route.ts
    statistics/route.ts
    tags/route.ts
    admin/users/route.ts
    admin/feature-flags/route.ts
    admin/audit-log/route.ts
    health/route.ts
```

Server actions (App Router pattern) are an acceptable replacement for many of these.
Pick one style. Keep it consistent.

## 5. Component structure (`components/`)

```
components/
  layout/
    Sidebar.tsx
    Header.tsx
    Breadcrumbs.tsx
    LanguageToggle.tsx
    UserMenu.tsx

  jobs/
    JobCard.tsx
    JobList.tsx
    JobDetailLayout.tsx
    JobTimeline.tsx
    JobStatusChip.tsx
    JobPriorityChip.tsx
    JobSeverityChip.tsx
    JobSlaBar.tsx
    JobTransitionButtons.tsx
    MarkDoneSheet.tsx
    MarkReviewedDialog.tsx
    CreateJobForm.tsx
    CreateJobFromEmailForm.tsx
    TakeTaskButton.tsx

  timer/
    ActiveTimerBar.tsx
    TimerControls.tsx
    IdleWarningDialog.tsx

  communication/
    PostCard.tsx
    PostDetail.tsx
    PostCompose.tsx
    ReplyList.tsx
    ReplyCompose.tsx
    TagPicker.tsx

  clients/
    ClientCard.tsx
    ClientOverview.tsx
    ClientEnvironmentTab.tsx
    BillingTab.tsx
    PaymentsTab.tsx
    ReceiptsTab.tsx
    NotesTab.tsx

  billing/
    PaymentRow.tsx
    AgingBucketsStrip.tsx
    BurnRateBar.tsx
    MarkPaidDrawer.tsx
    MonthlyItemForm.tsx
    HourlyBankForm.tsx
    OneTimeChargeForm.tsx

  receipts/
    ReceiptDraftEditor.tsx
    ReceiptViewer.tsx
    ReceiptVerificationBanner.tsx
    DocumentLinesEditor.tsx
    DocumentNumberDisplay.tsx
    LanguagePicker.tsx

  saved-views/
    SavedViewSelector.tsx
    SaveViewButton.tsx

  search/
    GlobalSearchInput.tsx
    GlobalSearchResults.tsx

  statistics/
    StatsFilters.tsx
    StatsCharts.tsx
    StatsExportButton.tsx

  admin/
    UserTable.tsx
    FeatureFlagTable.tsx
    AuditLogTable.tsx
    TagTable.tsx
    SlaDefaultsForm.tsx
    CompanyDetailsForm.tsx

  agent/
    AgentPlaceholder.tsx

  financial-documents/
    FinancialDocumentsPlaceholder.tsx

  shared/
    DataTable.tsx
    FiltersBar.tsx
    EmptyState.tsx
    ConfirmDialog.tsx
    Drawer.tsx
    Sheet.tsx
    StatusBadge.tsx
    Chip.tsx
    Markdown.tsx
    LoadingSkeleton.tsx
```

## 6. Library structure (`lib/`)

```
lib/
  auth.ts                           Auth helpers, session getters.
  permissions.ts                    Centralized read and write rules.
  prisma.ts                         Singleton Prisma client.
  audit.ts                          AuditLog write helpers.
  feature-flags.ts                  Read and toggle flags.
  i18n/
    index.ts
    en.json
    he.json
  hebrew.ts                         RTL utilities.
  time.ts                           Asia/Jerusalem helpers.
  money.ts                          Minor-unit conversions, currency formatting.
  vat.ts                            VAT calculation helpers.
  sla.ts                            SLA target derivation.
  search.ts                         Full-text query builders.
  jobs/
    lifecycle.ts                    Allowed transitions and validators.
    sla.ts                          SLA derivation per priority and severity.
  receipts/
    numbering.ts                    Sequence helpers.
    draft.ts                        Draft builders.
  billing/
    aging.ts                        Aging-bucket helpers.
    burn-rate.ts                    Burn-rate calculation.
  validators/
    zod-schemas.ts                  Centralized Zod schemas.
  middleware/
    rate-limit.ts
    security-headers.ts
```

## 7. Database schema files (`prisma/`)

```
prisma/
  schema.prisma                     Mirrors `03-data-model-final.md` Section 1.
  migrations/                       Auto-generated.
  seed.ts                           Departments, roles, channels, tags, feature flags, demo users, demo clients.
  fixtures/
    departments.json
    roles.json
    channels.json
    tags.json
    feature-flags.json
    demo-users.json
    demo-clients.json
```

If Drizzle is chosen, replace with `drizzle/schema.ts`, `drizzle/migrations/`, `drizzle/seed.ts`.

## 8. Auth and permission files

Centralize all permission rules.

- `lib/auth.ts`: session retrieval, login, logout, password reset.
- `lib/permissions.ts`: read and write rules per entity. Pure functions. Unit tested.
- `middleware.ts`: route gate at the edge. Reads role from session.
- `app/api/*` handlers: every mutation calls `permissions.assert(...)` before doing work.

Rules of thumb:
- Never trust the UI.
- Always check at the API layer.
- 403 responses match the empty-state UI to avoid leaking entity names.

## 9. Placeholder and mock data files

```
scripts/
  reset-db.ts
  seed-demo.ts
  generate-demo-jobs.ts

prisma/fixtures/
  ...                                See Section 7.
```

Demo data uses placeholder amounts.
Real prices and real clients are "Needs user input."

## 10. Admin pages (already in Section 4)

Files under `app/(portal)/admin/`.
Permission: admin only.
Surfaces:
- Users: create, deactivate, reset password, role and department changes.
- Tags: list, create, edit, archive.
- Feature flags: enable, disable, description.
- SLA defaults: per priority and severity.
- Company details: legal name, ח.פ., VAT number, address. Used in receipt headers.
- Audit log viewer with filters.

## 11. Employee pages (already in Section 4)

Files under `app/(portal)/`.
Permission: employees see scoped subset.
Surfaces: Dashboard, My Jobs, Hub, Department Jobs (own), Global Jobs, Communication (global + own), Settings.

## 12. Shared UI components (already in Section 5)

Reuse the public-site visual vocabulary. Match font, color, spacing.

## 13. What each file should contain

This section summarizes purpose only.
Detailed contracts live in `02-implementation-ready-spec.md` and `03-data-model-final.md`.

### 13.1 `app/(portal)/layout.tsx`
- Authenticated shell.
- Sidebar plus header.
- Locale provider.
- RTL applied when locale is Hebrew.

### 13.2 `app/(portal)/dashboard/page.tsx`
- Branches by role.
- Renders KPI strip, lists, widgets per spec Section 6.1.

### 13.3 `app/(portal)/my-jobs/page.tsx`
- Loads jobs for current user.
- Filter, sort, save view.

### 13.4 `app/(portal)/my-jobs/[id]/page.tsx`
- Job detail tabs.
- Timeline.
- Right column: actions, timer, meta.

### 13.5 `app/(portal)/hub/[scope]/page.tsx`
- Loads available jobs in scope.
- Cards layout.
- "Take task" action.

### 13.6 `app/(portal)/communication/[channel]/page.tsx`
- Posts list with filters.
- Compose box.

### 13.7 `app/(portal)/clients/[id]/page.tsx`
- Tabs: overview, jobs, billing, payments, receipts, environment, notes.

### 13.8 `app/(portal)/billing/page.tsx`
- Aging strip.
- Tabs: All, Monthly, Hourly, One-time, Drafts.
- Row actions.

### 13.9 `app/(portal)/receipts/new/page.tsx`
- Draft editor.
- Pre-fill from payment query param.

### 13.10 `app/(portal)/receipts/[id]/page.tsx`
- Editable while draft.
- Read-only when finalized.
- Verification banner.

### 13.11 `app/(portal)/financial-documents/page.tsx`
- Placeholder page.
- Feature-flag check.

### 13.12 `app/(portal)/agent/page.tsx`
- Placeholder page.
- Feature-flag check.

### 13.13 `app/(portal)/statistics/page.tsx`
- Filters, charts, CSV export.

### 13.14 `app/(portal)/admin/audit-log/page.tsx`
- Filters by action, actor, entity.

### 13.15 `app/api/jobs/[id]/transitions/route.ts`
- POST with `to_status`.
- Validates allowed transitions from spec Section 7.
- Writes JobStatusEvent and AuditLog inside a transaction.

### 13.16 `app/api/hub/[scope]/take/route.ts`
- Conditional update where status = 'available'.
- Returns 409 if already taken.

### 13.17 `app/api/billing/payments/[id]/mark-paid/route.ts`
- Validates fields.
- Updates Payment.
- Writes AuditLog.
- Returns next URL when "create receipt" is requested.

### 13.18 `app/api/receipts/[id]/finalize/route.ts`
- Refuses without `receipt_finalize_enabled` flag.
- SELECT FOR UPDATE on ReceiptDocumentSequence.
- Sets document_number and finalized_at.
- Locks the row.

### 13.19 `app/api/search/route.ts`
- Accepts query and scope.
- Runs scoped full-text queries.
- Returns top N results per scope.

### 13.20 `app/api/saved-views/route.ts`
- CRUD with permission rules.

### 13.21 `lib/jobs/lifecycle.ts`
- Pure functions.
- `isTransitionAllowed(role, currentStatus, toStatus, actorRelation)`.
- Tested per row in spec Section 7.2.

### 13.22 `lib/sla.ts`
- `deriveSlaTargetMinutes(priority, severity, slaDefaults)`.
- `computeSlaState(elapsedMinutes, targetMinutes) -> green | amber | red | breached`.

### 13.23 `lib/audit.ts`
- `writeAudit(tx, { actor, action, entityType, entityId, diff })`.
- Always inside a Prisma transaction.
- Redacts sensitive fields per a denylist.

### 13.24 `lib/permissions.ts`
- `canReadJob`, `canMutateJob`, `canTakeTaskInScope`, etc.
- Pure functions.

### 13.25 `lib/receipts/numbering.ts`
- `allocateNumber(type, year, tx)`.
- Locks the sequence row.
- Returns the next number.

### 13.26 `prisma/schema.prisma`
- Mirrors `03-data-model-final.md` Section 1.
- Enums and relations explicit.

### 13.27 `prisma/seed.ts`
- Idempotent seeding.
- Departments, Roles, CommunicationChannels, Tags, FeatureFlags.
- Demo users with bcrypt or argon2 hashed placeholder passwords.
- Demo clients with placeholder values.

### 13.28 `middleware.ts`
- Routes the request to login when no session.
- Routes the request to 403 when role is wrong.

### 13.29 `lib/i18n/`
- English and Hebrew JSON strings.
- Per-page namespaces.

### 13.30 `tests/`
- Unit tests for lifecycle, permissions, SLA, numbering, aging.
- Integration tests for API routes.

### 13.31 `e2e/`
- Playwright flows:
  - Login.
  - Create job, take task, mark working, mark done, mark reviewed.
  - Mark payment paid with create receipt.
  - Finalize a receipt with the flag on (dev only).
  - Switch to Hebrew, see RTL.

## 14. Must not be touched

- `docs/internal-management-portal-spec.md`.
- `docs/internal-management-portal-data-model.md`.
- `docs/internal-management-portal-mvp-plan.md`.
- `docs/internal-management-portal-enhancement/` and everything inside.
- `docs/internal-management-portal-final-plan/` files other than as planned in this folder.
- `.claude/CLAUDE.md` and `.claude/RULES.md`.
- The sibling repository `/Users/jeries/Desktop/projects/skyware-com/`.

The implementation may copy visual conventions from `skyware-com` but must not modify or import code from it.

## 15. Recommended package list

Confirm before installing.

- `next`, `react`, `react-dom`.
- `typescript`, `tslib`.
- `tailwindcss`, `postcss`, `autoprefixer`.
- `lucide-react`.
- `@radix-ui/*` via shadcn/ui generators.
- `prisma`, `@prisma/client`.
- `next-auth` or `lucia`.
- `argon2` or `bcryptjs` for password hashing.
- `zod`.
- `react-hook-form`.
- `@tanstack/react-query` or `swr`.
- `date-fns` with `date-fns-tz`.
- `aws-sdk` or `@aws-sdk/client-s3` (or a compatible provider client).
- `pino` for structured logging.
- `vitest`, `@testing-library/react`.
- `playwright`.

## 16. Environment variables

Suggested keys in `.env.example`.

```
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
DEFAULT_LOCALE=en
TZ=Asia/Jerusalem
LOG_LEVEL=info
RECEIPT_FINALIZE_ENABLED=false
FINANCIAL_DOCUMENTS_MODULE=false
AGENT_CONTROL_CENTER_MODULE=false
```

Real values: Needs user input.

## 17. Definition of done per file

A file is done when:

- It compiles under TypeScript strict.
- It has a unit or integration test where it contains logic.
- It respects the permission model from `lib/permissions.ts`.
- It writes audit-log entries on mutation.
- It supports both languages where it renders user-visible text.
- It has an empty state.
- It has a loading state.

## 18. Notes for the implementing agent

- Build behind feature flags whenever a module is placeholder.
- Use transactions for any mutation that writes AuditLog or numbering.
- Never store real client passwords, vault items, or tokens.
- Never finalize a receipt without `receipt_finalize_enabled=true`.
- Never delete from append-only tables.
- Default to admin-private for any new field that touches money or notes.
