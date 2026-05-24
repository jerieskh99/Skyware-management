# Frontend and UX Audit

Date: 2026-05-24
Auditor: Engineering Lead, audit team
Scope: `app/(portal)/**`, `components/**`, `lib/i18n/**`. Read-only audit. No code changed.

---

## 1. Executive summary

The portal is functionally substantial. Twenty pages render real data via server components, and the shared `PageHeader`, `KpiCard`, `SectionCard`, and `EmptyState` primitives give the app a coherent surface. The bigger problems are not bugs. They are gaps between the shipped UI and the stated UX spec.

Five issues dominate this audit:

1. The i18n layer is unused. `lib/i18n/{en,he}.json` are imported only for types. Every visible string is hardcoded English. Switching the language toggle changes `dir` and `lang` but the UI text is identical.
2. Dark mode tokens exist in `app/globals.css` but `next-themes` is a dependency with zero usage. No `ThemeProvider`, no toggle.
3. The dialog and toast surface is roll-your-own. There is no `Dialog`, `Sheet`, or `Toast` primitive. Eight pages use bespoke `fixed inset-0` overlays. Two flows fall through to native `window.confirm` and `window.alert`.
4. Several destructive actions delete with no confirmation. `ClientBillingTab` deletes monthly items, hourly banks, and one-time charges on a single click. Environment notes also delete silently.
5. Loading and notification scaffolding is missing. There are no `loading.tsx` files, no `Suspense`, no error toasts on success, and no global notification bell. Per-form errors render inline, which is good, but cross-page operations have no feedback.

Three pages are explicitly placeholder: `/receipts`, `/agent`, `/financial-documents`. They are well written and honest about the gap; they should not be confused with implementation debt.

The frontend code itself is tidy. There are zero `TODO`, `FIXME`, `HACK`, `XXX`, `console.log`, `as any`, or `@ts-ignore` markers in `app/` or `components/`. The few `"not implemented"` strings are all intentional placeholder copy. ESLint and typecheck are clean per the Phase 10 audit.

---

## 2. Page-by-page inventory

Status legend: **Working** = real data, full flow; **Partial** = real data but missing pieces; **Placeholder** = page renders but no real functionality.

| Route | File | Status | Completeness | Notes |
|---|---|---|---|---|
| `/login` | `app/(auth)/login/page.tsx` | Working | 100% | Credentials form, Zod validation, callback URL preserved. |
| `/dashboard` | `app/(portal)/dashboard/page.tsx` | Working | 95% | Two layouts (admin/employee). KPI tones, Quick Actions, role-aware sections. Greeting uses local browser time, not `Asia/Jerusalem`. |
| `/my-jobs` | `app/(portal)/my-jobs/page.tsx` | Working | 95% | Filters work, empty state present. Permission-filtered. |
| `/my-jobs/[id]` | `app/(portal)/my-jobs/[id]/page.tsx` | Working | 90% | No tabs (spec calls for Overview/Timeline/Related/Files). No file upload. No reassign control. |
| `/department-jobs` | `app/(portal)/department-jobs/page.tsx` | Working | 90% | Admin sees department chooser; employee jumps to their own dept. Department buttons are bare links, not tabs. |
| `/department-jobs/[dept]` | `app/(portal)/department-jobs/[dept]/page.tsx` | Working | 95% | Filters + empty state. |
| `/global-jobs` | `app/(portal)/global-jobs/page.tsx` | Working | 95% | Same pattern as `/my-jobs`. |
| `/hub` | `app/(portal)/hub/page.tsx` | Working | 100% | Redirector. |
| `/hub/[scope]` | `app/(portal)/hub/[scope]/page.tsx` | Working | 90% | React Query, 30s refresh, optimistic take. Scope tabs only on `sm:` and above. |
| `/communication` | `app/(portal)/communication/page.tsx` | Working | 80% | Shows post counts only. Spec asked for recent post previews. |
| `/communication/[channel]` | `app/(portal)/communication/[channel]/page.tsx` | Working | 85% | Search is a native GET form (full reload). No tag/author/date filters per spec section 12.1. |
| `/communication/[channel]/[postId]` | `app/(portal)/communication/[channel]/[postId]/page.tsx` | Working | 90% | Resolve/pin work. No "convert to job" (Phase 2). |
| `/clients` | `app/(portal)/clients/page.tsx` | Working | 90% | Card list, filters, empty state. Admin-only. |
| `/clients/[id]` | `app/(portal)/clients/[id]/page.tsx` | Partial | 75% | Five tabs. Receipts tab is a placeholder. Billing tab uses `ClientBillingTab` (working). Date format `en-GB`, not `Asia/Jerusalem`. |
| `/billing` | `app/(portal)/billing/page.tsx` | Working | 85% | KPIs, aging list, full table, status filter chips. No time-bucketed aging (0–30/31–60/61–90). No create on this page. |
| `/financial-documents` | `app/(portal)/financial-documents/page.tsx` | Placeholder | 0% functional, 100% UX | Best-built placeholder in the app. Flag-aware, 5-step workflow, 7 categories, disabled filter preview, related links. No ingestion. |
| `/receipts` | `app/(portal)/receipts/page.tsx` | Placeholder | 0% | Compliance hold; correctly labelled. |
| `/statistics` | `app/(portal)/statistics/page.tsx` | Working | 85% | 8 KPIs, 3 tables, range filter. No CSV export. No charts; everything is tables. |
| `/statistics/email-to-job` | `app/(portal)/statistics/email-to-job/page.tsx` | Working | 95% | Manual paste form, clear no-ingestion disclaimer. |
| `/admin` | `app/(portal)/admin/page.tsx` | Partial | 80% | 7 tabs. Users, Tags, Flags, Audit, Roles/Depts work. SLA and Company Details are read-only/disabled placeholders. |
| `/agent` | `app/(portal)/agent/page.tsx` | Placeholder | 0% | Clean status card, capabilities, permissions matrix, empty actions log. |
| `/settings` | `app/(portal)/settings/page.tsx` | Partial | 70% | Display name and password work. Language is a note ("use the header toggle"). No timezone, no notification prefs, no theme. |

Reference for terms: `docs/internal-management-portal-enhancement/05-ux-ui-review.md`.

---

## 3. Component health

### 3.1 Shared layer

`components/shared/` has five well-scoped pieces: `EmptyState`, `KpiCard`, `PageHeader`, `SectionCard`, `StatusDot`. They are used across dashboard, billing, communication, financial-documents, my-jobs, clients, admin. This is the strongest part of the codebase.

### 3.2 Reuse patterns that work

- `JobStatusChip`, `JobPriorityChip`, `JobSeverityChip`, `JobTagChips`, `JobSlaBar`, `JobRow`, `JobTimeline` are used across `/my-jobs`, `/department-jobs/*`, `/global-jobs`, `/hub/*`, `/clients/[id]`, and `GlobalSearch`. Consistent visual vocabulary.
- `PaymentStatusChip` and `BurnRateBar` are shared between `/billing` and `ClientBillingTab`.
- `MarkPaidSheet` is reused by `BillingPageActions` and `ClientBillingTab` payments section.

### 3.3 Broken or weak patterns

- **No dialog primitive.** Eight modals built as `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">`. They lack focus trap, ESC handling, scroll lock, and `aria-modal`. Files: `components/jobs/CreateJobDialog.tsx`, `components/jobs/MarkDoneSheet.tsx`, `components/clients/ClientDialog.tsx`, `components/billing/MarkPaidSheet.tsx`, `components/billing/ClientBillingTab.tsx` (four inline dialogs), `components/admin/UserManagementSection.tsx` (three inline dialogs), `components/admin/TagManagementSection.tsx` (two inline dialogs), `components/admin/FeatureFlagSection.tsx` (one inline confirm dialog).
- **No toast/notification system.** Every success state writes "Saved." or similar text inline and the dialog closes. There is no global feedback for cross-page actions. `components/settings/DisplayNameForm.tsx:56` is a good local example; `components/settings/PasswordForm.tsx:84` likewise.
- **`window.alert` and `window.confirm`** in `components/admin/TagManagementSection.tsx:84` (delete confirm) and line 87 (delete error). The rest of the app uses inline error banners; these are the only browser-native dialogs.
- **Silent destructive actions** in `components/billing/ClientBillingTab.tsx:183` (delete monthly item), line 337 (delete hourly bank), line 508 (delete one-time charge), and `components/clients/EnvironmentNotesSection.tsx:180` (clear environment note). No confirmation step. Click and gone.
- **`CreateJobDialog` fetches lists on every mount** (`components/jobs/CreateJobDialog.tsx:39`). `/api/users` and `/api/clients` requests fire each time the dialog opens. No caching, no `useQuery`. Acceptable at MVP scale but worth flagging for the maintainability list.
- **Duplicate `KpiCard` definition** in `app/(portal)/statistics/page.tsx:291` — defines a local `KpiCard` helper even though `components/shared/KpiCard.tsx` exists. The local version uses `colorClass: string` instead of the shared semantic `tone` prop. Statistics page also defines a local `EmptyState` (line 366), again duplicating the shared component.
- **`AdminPage` is 484 lines** and mixes data-fetch, four data fetchers, the Audit tab, Org tab, SLA tab, and Company tab into one file (`app/(portal)/admin/page.tsx`). Splitting into per-tab files would match the pattern used elsewhere.
- **`ClientBillingTab.tsx` is 776 lines** with four large inline sections each carrying its own dialog. Splitting into `MonthlySection`, `HourlyBanksSection`, `OneTimeSection`, `PaymentsSection` files would match the rest of the codebase.
- **`(portal)/financial-documents/page.tsx` is 449 lines** of static decorative copy. Acceptable for an intentional placeholder; flagged here for completeness.

### 3.4 Naming and prop conventions

- Page header components (`JobsPageHeader`, `ClientsPageHeader`) wrap `PageHeader` and add a "+" action button. Consistent.
- Some pages pass `tone="warn"` via the shared `KpiCard`; others use ad-hoc Tailwind colors (e.g. `text-blue-600` directly in `statistics/page.tsx`). Inconsistent.
- Hard-coded color combinations for active/inactive client status: `border-green-200 bg-green-50 text-green-700`. Duplicated in `app/(portal)/clients/page.tsx:71-77` and `app/(portal)/clients/[id]/page.tsx:160-167`. A shared `ClientStatusBadge` would clean this up.

### 3.5 Unused dependencies that ship code

- `next-themes` listed in `package.json`. No import anywhere in `app/`, `components/`, or `lib/`. Dark mode CSS variables exist in `app/globals.css:44`. Users cannot reach dark mode.
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-avatar`. All declared in `package.json`. None imported.
- `Skeleton` from `components/ui/skeleton.tsx` is used only in `components/jobs/HubView.tsx:87`.

---

## 4. Forms, validation, error handling

### 4.1 Validation pattern

Most forms validate client-side with bespoke `if (!field.trim())` checks. Only `app/(auth)/login/page.tsx` uses Zod. API routes use Zod (per the existing audits). Mixed.

Examples:
- `components/jobs/CreateJobDialog.tsx:53` — `if (!title.trim()) { setError("Title is required."); return; }`.
- `components/communication/ComposePost.tsx:56` — same pattern, two checks.
- `components/clients/ClientDialog.tsx:44` — same pattern.
- `components/admin/UserManagementSection.tsx:69, 100` — checks all-fields-required and password match.

A shared form validation utility or hook-form integration would reduce repetition.

### 4.2 Error display

All forms render error text inline:
```
{error && <p className="text-sm text-destructive">{error}</p>}
```
Repeated across at least 15 components. Consistent and accessible (it's plain text). Not associated with an input via `aria-describedby`.

### 4.3 Pending states

Every form uses `useTransition` and disables the submit button + sets a "Saving..." label. Good. Examples:
- `components/billing/ClientBillingTab.tsx:221, 385, 433, 533, 724`.
- `components/admin/UserManagementSection.tsx:233, 272, 299`.

### 4.4 Success feedback

Success behavior varies:
- Settings forms (`DisplayNameForm`, `PasswordForm`) show "Saved." / "Password changed." in green text.
- Dialogs close on success (`CreateJobDialog`, `ClientDialog`, `MarkPaidSheet`, etc.) without a toast.
- `EmailToJobForm` shows a success state in place of the form.

No global toast. Users in a different tab or scrolled away will not know an action succeeded.

### 4.5 Form-heavy pages reviewed

| Form | File | Issues |
|---|---|---|
| Create job | `components/jobs/CreateJobDialog.tsx` | No focus trap. No ESC. Fetches users/clients each open. |
| Create client | `components/clients/ClientDialog.tsx` | Cannot set status to inactive on create (per Phase 5 audit). No focus trap. |
| Mark job done | `components/jobs/MarkDoneSheet.tsx` | No tab order test. No keyboard accessibility on the modal. |
| Mark paid | `components/billing/MarkPaidSheet.tsx` | Same. |
| Create payment | `components/billing/ClientBillingTab.tsx:579` | Three-source dropdown (`monthly`, `hourly_bank`, `one_time`) but `one_time` has no UI to pick which charge. |
| Add user / Edit user / Reset password | `components/admin/UserManagementSection.tsx` | Three sequential dialogs, each manually styled. Reset password lacks "show password" toggle and lacks pwned-password check. |
| Add hourly bank usage | `components/billing/ClientBillingTab.tsx:399` | Takes a raw Job ID UUID. User must copy from URL. No job picker. |
| Add one-time charge | `components/billing/ClientBillingTab.tsx:522` | Same. Takes raw Job ID UUID. |
| Add tag | `components/admin/TagManagementSection.tsx:161` | OK. |
| Compose post | `components/communication/ComposePost.tsx` | OK. No attachment support (deferred). No related-job picker. |

---

## 5. Loading, empty, and error states

### 5.1 Loading

- **No `app/**/loading.tsx` anywhere.** Server-component navigation has no progress indicator. Confirmed with `find app -name loading.tsx`.
- **No `Suspense` boundaries** in app code. Confirmed with grep.
- Skeleton component exists (`components/ui/skeleton.tsx`) but is only used by `HubView`.
- Forms show pending state on the submit button only. Page transitions show nothing.

### 5.2 Empty states

Strong. `components/shared/EmptyState.tsx` is used by 8 pages. Pattern: icon + title + optional description.

Good examples:
- `app/(portal)/my-jobs/page.tsx:50` — different title for filtered/closed vs default.
- `app/(portal)/billing/page.tsx:127` — "No payments found." + helper text.
- `app/(portal)/clients/page.tsx:42` — friendly first-time message.

Inconsistent example:
- `app/(portal)/statistics/page.tsx:366` — defines a local `EmptyState({ message })` instead of using the shared one.

### 5.3 Error states

- Root `app/error.tsx` and `app/(portal)/error.tsx` both present, both client components with `reset` and a dashboard link. Adequate.
- `app/not-found.tsx` present.
- No per-route `error.tsx` (e.g. `app/(portal)/billing/error.tsx`). All errors bubble to the portal-level boundary, which loses the local context.
- Network errors in `GlobalSearch.tsx:54` are caught and shown inline as "Search failed. Try again." Good.
- `HubView.tsx:93` shows "Failed to load hub. Refresh the page." in destructive color. Adequate.
- The Timer fetch in `TimerBar.tsx:51` silently returns null on failure. The user has no indication their timer call failed.

---

## 6. i18n and RTL state

### 6.1 i18n: implemented but unused

`lib/i18n/index.ts` exports `getTranslations(locale)`, `isRtl(locale)`, and bundles `en.json` and `he.json`.

**Zero usages of `getTranslations`** in `app/` or `components/`. The Hebrew translation file exists for navigation, auth, common, job statuses, payment statuses, departments, settings, and two placeholder messages. None of these strings are rendered.

Every visible UI string is hardcoded English. Examples:
- Sidebar nav: `components/layout/Sidebar.tsx:38-75` hardcodes "Overview", "Work", "Communication", "Clients & Billing", "Admin", "System", "Dashboard", "My Jobs", etc. The `nav.*` keys in `en.json` are dead.
- Job status chips: `components/jobs/JobStatusChip.tsx:17-28` hardcodes "New", "Assigned", ... ignoring `job.status.*` in i18n files.
- Payment status chips: `components/billing/PaymentStatusChip.tsx:3-11` hardcodes labels.
- All dialogs, error messages, button labels, empty state copy, page descriptions: hardcoded English.

`LanguageToggle.tsx` writes a `locale` cookie and refreshes the page. The root layout reads the cookie and sets `<html lang dir>`. Direction changes; text stays English. Hebrew users see RTL layout with English copy throughout.

**Hebrew label surfaces that do work:** `nameHe` fields on roles, departments, tags. These are stored in the DB and shown alongside English (e.g. `app/(portal)/admin/page.tsx:337, 363`). The display always shows both, gated on `dir="rtl"`.

### 6.2 RTL handling

- Logical Tailwind utilities used: 237 occurrences of `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`. Zero `mr-`, `ml-`, `pr-`, `pl-`, `left-`, `right-` (excluding `text-right` and `text-left` discussed below).
- `<html dir="rtl">` is set when locale=he per `app/layout.tsx:21-24`.
- `dir="auto"` is correctly applied to user-content fields: post body, reply body, job description (via `whitespace-pre-wrap` blocks), email-to-job inputs, environment notes.
- `dir="rtl"` is correctly applied where pure-Hebrew text is rendered: tag Hebrew labels, role/department Hebrew names.

Issues:
- `app/(portal)/statistics/page.tsx:330` and line 345 use `text-right` and `text-left`. These are physical, not logical. Under RTL the alignment will be wrong. Should be `text-end`/`text-start`.
- Hebrew text quality is not verified. The label `סקייוור אי.טי בע"מ` in `app/(portal)/admin/page.tsx:440` is a placeholder. The `placeholders.financialDocuments` string in `he.json:107` reads naturally; `placeholders.agent:108` has the typo "יטייט" (probably intended "יטייטא" / "ינסח") — worth a native review.

### 6.3 Timezone display

`lib/time.ts` correctly uses `Asia/Jerusalem` via `formatInTimeZone`. The helpers `formatTz`, `formatDate` are used by:
- `JobTimeline` (`changedAt`).
- `EnvironmentNotesSection` (last edited).
- `app/(portal)/my-jobs/[id]/page.tsx` (timestamps).
- `app/(portal)/communication/[channel]/[postId]/page.tsx`.

Not used by:
- `app/(portal)/dashboard/page.tsx:340` — `greeting()` uses `new Date().getHours()` against the server's local time, not `Asia/Jerusalem`. If the server is in a different timezone, the greeting will be wrong.
- `app/(portal)/clients/page.tsx:91` — `toLocaleDateString("en-GB")`.
- `app/(portal)/clients/[id]/page.tsx:186, 284` — `toLocaleDateString("en-GB")`.
- `app/(portal)/admin/page.tsx:276` — `toLocaleString("en-GB", ...)`.
- `components/admin/UserManagementSection.tsx:34` — `toLocaleDateString("en-GB")`.
- `components/clients/EnvironmentNotesSection.tsx:55` — `toLocaleDateString("en-GB")`.
- `components/billing/MarkPaidSheet.tsx:50` — `new Date().toISOString().slice(0, 10)` uses UTC.
- `components/billing/ClientBillingTab.tsx:95, 115, 244, 570` — mix of `toLocaleDateString("en-GB")` and `toISOString().slice(0, 10)`.

A user near midnight Jerusalem time can see the wrong day in payment date pickers.

---

## 7. Theming, dark mode, accessibility quick checks

### 7.1 Theming

- Tokens in `app/globals.css` include a complete dark theme block (lines 44–73).
- `next-themes` is a dependency. No `ThemeProvider` imported. No toggle UI. Dark mode is unreachable.
- Brand color `--brand: 212 90% 48%` and supporting tokens are correctly used across `KpiCard`, `Sidebar`, `PageHeader`. Consistent.

### 7.2 Accessibility — quick checks (not a full audit)

- Focus rings: shared button/input primitives include `focus-visible:ring-2 focus-visible:ring-ring`. Good.
- Icon buttons: many include `aria-label` (timer controls, language toggle, X close button, search clear). A few do not. Example: the "Clear" button in `ClientBillingTab.tsx:183` delete buttons have no `aria-label`, only an icon.
- Tooltips: `@radix-ui/react-tooltip` is a dependency but never used. Some icon-only buttons rely on `title=` attribute (e.g. `UserManagementSection.tsx:171`). Title text is not screen-reader-friendly for keyboard-only users.
- Form labels: every `<label>` is associated by proximity, not all by `htmlFor`. Settings forms do (`PasswordForm.tsx:45`). Most other forms do not.
- Modals: as noted, the bespoke `fixed inset-0` overlays do not implement focus trap, ESC-to-close, or `aria-modal="true"`. The "Switch to Hebrew" button uses `aria-pressed`, which is good.
- Color contrast: `text-muted-foreground` against `bg-muted/30` may be borderline in light mode. Not measured.
- Reduced motion: `transition-colors` and `animate-pulse` used widely. No `prefers-reduced-motion` handling found.
- Heading levels: most pages use `h1` (PageHeader), then `h2`, then `h3` properly. Statistics tables use `Th` helper rendering `th` with correct semantics.

### 7.3 Mobile responsiveness

- Sidebar is `w-56` fixed (`components/layout/Sidebar.tsx:91`). It does not collapse on small screens. The UX spec section 14.1 says "Sidebar collapses to a bottom drawer." Not done.
- The timer bar accounts for sidebar via `sm:start-56` (`components/timer/TimerBar.tsx:89`), good on desktop, but the sidebar still consumes ~56 of viewport width on mobile.
- Many tables use `overflow-x-auto` and column-hiding via `hidden md:table-cell`. Acceptable.
- Hub scope tabs hide on small screens (`components/jobs/HubView.tsx` / `app/(portal)/hub/[scope]/page.tsx:42` uses `hidden sm:flex`). Mobile users cannot switch scope from the hub page.

---

## 8. Top UX problems (ranked)

1. **i18n is implemented but not wired.** All visible strings hardcoded English. `lib/i18n/en.json`, `lib/i18n/he.json`. Hebrew users get RTL layout with English copy.
2. **No dialog primitive; modals lack focus trap and ESC.** `components/jobs/CreateJobDialog.tsx:91`, `components/clients/ClientDialog.tsx:82`, `components/billing/MarkPaidSheet.tsx:95`, all four dialogs in `components/billing/ClientBillingTab.tsx`, three dialogs in `components/admin/UserManagementSection.tsx`, two in `components/admin/TagManagementSection.tsx`, one in `components/admin/FeatureFlagSection.tsx`.
3. **Destructive actions execute without confirmation.** `components/billing/ClientBillingTab.tsx:183` (delete monthly item), :337 (delete hourly bank), :508 (delete one-time charge), `components/clients/EnvironmentNotesSection.tsx:180` (clear note).
4. **`window.alert` and `window.confirm` in production code.** `components/admin/TagManagementSection.tsx:84, 87`.
5. **No global toast or notification surface.** Users completing actions outside their current viewport (e.g. submitting from a closed dialog) see no confirmation. Spec section 3.2 calls for a notification bell, deferred to Phase 2.
6. **Dark mode dependency loaded but no toggle.** `next-themes` in `package.json`; no import. Tokens in `app/globals.css:44-73` are unreachable.
7. **No `loading.tsx` or `Suspense` boundaries.** Server-component navigation has no progress indicator.
8. **Inconsistent timezone for dates.** Dashboard greeting uses local server time (`app/(portal)/dashboard/page.tsx:340`). Date inputs use `new Date().toISOString().slice(0, 10)` (UTC) instead of `Asia/Jerusalem`. List dates use `en-GB` locale formatting, not the company TZ helpers.
9. **Hardcoded raw IDs in user-facing flows.** `Add hourly bank usage` and `Add one-time charge` ask the admin to paste a Job UUID from the URL (`components/billing/ClientBillingTab.tsx:401-407`, :525). No job picker.
10. **Duplicated components instead of shared.** Local `KpiCard` and `EmptyState` in `app/(portal)/statistics/page.tsx:291, 366` instead of the shared versions. Hardcoded client-status badges in `app/(portal)/clients/page.tsx:71` and `app/(portal)/clients/[id]/page.tsx:160`.
11. **Sidebar does not collapse on mobile.** Spec section 14.1 was explicit. `components/layout/Sidebar.tsx:91`.
12. **Hub scope tabs hidden on small screens.** `app/(portal)/hub/[scope]/page.tsx:42` (`hidden sm:flex`). Mobile users can only see their default scope.
13. **No save-view UI on lists.** Spec section 1.7. URL-driven filters work, but a save/recall layer is not built. (Schema-ready per existing audits.)
14. **No notification bell.** Header has only search, language toggle, admin badge. Spec section 3.2 deferred to Phase 2.
15. **Settings page minimal.** No notification prefs, no timezone, no theme. `app/(portal)/settings/page.tsx`.
16. **Admin "Roles & Depts" tab is read-only with a comment that they are defined in the seed** (`app/(portal)/admin/page.tsx:331`). Discoverability is fine; admins may expect to edit. Not a defect.
17. **Statistics page has no charts.** Spec implies visual representation; all data is in tables. `app/(portal)/statistics/page.tsx`.
18. **`AdminPage` (484 lines) and `ClientBillingTab` (776 lines) violate the per-component split used elsewhere.** Hard to maintain.
19. **Soft TypeScript loophole in `app/(portal)/billing/page.tsx:42`** — `sp["status"] ? [sp["status"]] : []` wraps in array, but the type is then re-cast to `PaymentStatus[]` via `filter`. Works in practice; the type assertion `as PaymentStatus[]` is implicit via filter narrowing. Cosmetic.
20. **Channel search uses a native GET form** (`app/(portal)/communication/[channel]/page.tsx:57`). Page full-reloads on every search. Inconsistent with the React-Query / debounced pattern used in `JobFiltersBar` and `ClientFiltersBar`.

---

## 9. Recommendations

### P0 — block pilot expansion past current scope

- **Wire the i18n layer.** Use `getTranslations(locale)` in server components and a hook/context in client components. Replace hardcoded English in `Sidebar`, `JobStatusChip`, `PaymentStatusChip`, page headers, empty states, and dialog buttons. If wiring is non-trivial, at minimum render `nav.*` and chip labels from i18n so the Hebrew toggle does something visible.
- **Add focus trap, ESC handling, and `aria-modal` to dialogs.** Either introduce a shared `Dialog` component (the `@radix-ui/react-dialog` dependency is already declared) or extract a `Modal` wrapper from the bespoke pattern.
- **Replace `window.alert` and `window.confirm` in `TagManagementSection`** with the same in-page error/confirm pattern other admin sections use.
- **Confirm destructive deletes** in `ClientBillingTab` and `EnvironmentNotesSection`. A small inline "Are you sure?" toggle is enough.
- **Fix timezone in date inputs and dashboard greeting.** Use `Asia/Jerusalem` consistently via `lib/time.ts`.

### P1 — should land before broader rollout

- **Add a toast/notification surface.** Even a minimal `useToast()` hook with a fixed-corner stack would resolve the success-feedback gap.
- **Wire dark mode** with `next-themes` `<ThemeProvider>` and a small toggle in `Header` or `Settings`. Tokens already exist.
- **Add `loading.tsx` per route group** (`app/(portal)/loading.tsx` at minimum). Use `Skeleton` (already built) for list pages.
- **Replace raw Job UUID inputs** in `ClientBillingTab.tsx:401, 525` with a job picker that queries `/api/jobs` scoped to the current client.
- **De-duplicate** `KpiCard` and `EmptyState` in `statistics/page.tsx`. Replace inline client-status badges with a shared `ClientStatusBadge` component.
- **Mobile sidebar drawer.** Hamburger menu and slide-in panel for `< sm`. Hub scope tabs should remain visible on mobile.
- **Split `AdminPage` and `ClientBillingTab`** into per-tab/per-section files.
- **Use logical `text-end`/`text-start`** in `statistics/page.tsx:330, 345` instead of `text-right`/`text-left`.

### P2 — backlog

- **Notification bell scaffold** per spec section 3.2 (Phase 2 in the plan).
- **Recent posts on `/communication`** landing instead of post counts only.
- **Time-bucketed aging strip** on `/billing` (0–30 / 31–60 / 61–90 / 90+).
- **CSV export** on Statistics page.
- **Charts** on Statistics page (sparkline per row, or a small line chart for completion trend).
- **Saved-views UI** on My Jobs / Billing / Clients (schema ready).
- **Per-route `error.tsx` boundaries** for billing, clients, communication so failures don't propagate to the portal-level boundary.
- **File-attachment UI** for jobs/posts/replies (schema ready).
- **Settings page expansion**: notification prefs, timezone display, theme toggle.

---

## Handoff to PM

Top three concerns:

The portal looks complete on paper, but the Hebrew side is not actually translated. The i18n loader exists, the JSON files are populated, the language toggle works at the cookie level, yet not a single page renders translated text. A Hebrew-speaking pilot user will see right-to-left layout filled with English copy. If Hebrew speakers are in the pilot, this needs immediate work. The second concern is modal quality: eight dialogs in admin and billing flows are hand-rolled overlays with no focus trap, no ESC, no aria-modal, and a few destructive actions delete without any confirmation step — `ClientBillingTab` and `EnvironmentNotesSection` will lose data to a single misclick. The third concern is feedback: there is no toast/notification system, no loading indicators between pages, no notification bell. Admins completing actions in a closed dialog get no acknowledgement that the action succeeded, and a navigation between pages shows nothing while data is fetched. These are all P0/P1 fixes that do not require schema work and would materially raise pilot quality.
