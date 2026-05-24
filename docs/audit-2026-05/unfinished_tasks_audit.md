# Unfinished Tasks Audit

Date: 2026-05-24
Auditor: Engineering Lead, audit team
Scope: unfinished work visible in code and in existing audit docs. Read-only.

---

## 1. Summary

The codebase is in better shape than typical for an MVP. There are **zero** real `TODO`, `FIXME`, `HACK`, `XXX`, `as any`, `@ts-ignore`, or stray `console.log` markers in `app/` or `components/`. ESLint and typecheck are clean per the most recent phase-10 audit. The team has been disciplined about not leaving in-code debt.

The unfinished work is therefore visible only by:
- explicit "placeholder" / "not yet" copy in three pages,
- entries in the phase audits and `production-readiness.md`,
- unused dependencies that imply deferred features,
- functionality the UX spec calls for but that does not exist.

Three pages are intentional placeholders: `/receipts` (compliance hold), `/agent` (no real agent code), `/financial-documents` (no ingestion). One placeholder lives inside another page: the Receipts tab on `/clients/[id]`. Three feature flags gate placeholder modules: `receipt_finalize_enabled`, `agent_control_center_module`, `financial_documents_module`. The Admin "Company Details" tab is a disabled-input mockup with no backing storage.

The biggest concern is the **unwired i18n layer**: `lib/i18n/{en,he}.json` exist with full translations but no code reads them. The Hebrew toggle changes layout direction but not text. Detailed in `frontend_ux_audit.md` §6.

---

## 2. Unfinished tasks pulled from existing Markdown docs

### 2.1 From `docs/pilot-launch-checklist.md`

The pilot-launch checklist itself is a 296-line of operational gates, not feature work. The items below need to happen before pilot, none of them code:

| Item | Section | In-code status |
|---|---|---|
| Change all demo passwords (`changeme123`) | §1, §5.2 | All 5 seeded users still have this password per `docs/production-readiness.md:30-32`. |
| Set strong `NEXTAUTH_SECRET` | §1, §2 | No code visibility; runtime check only. |
| Remove seeded placeholder data | §1, §4 | Seed exists at `prisma/seed.ts`. Operational. |
| Keep `receipt_finalize_enabled = false` | §1, §6 | Flag default `false` in seed fixtures. UI gates correctly via `FeatureFlagSection.tsx:26-28`. |
| HTTPS in production | §1, §7 | Headers shipped via `next.config.ts`. Operational. |
| Production DB with backups | §1, §3, §8 | Local Docker compose only. Operational. |

### 2.2 From `docs/production-readiness.md`

| Item | Status from doc | Current in code |
|---|---|---|
| Content-Security-Policy header | Deferred — Phase 11 | Not in `next.config.ts`. |
| Redis-backed rate limiter | Deferred | `lib/rate-limit.ts` is in-memory. |
| Login endpoint rate limiting | Deferred to reverse proxy | Confirmed absent in code. |
| Receipt finalization | Placeholder, flag-off | `/receipts` page is a stub. |
| Israeli company details storage | Placeholder, no DB table | `/admin?tab=company` is disabled-input mockup. |
| SLA defaults | Hardcoded in `lib/sla.ts` | Confirmed. `/admin?tab=sla` is read-only. |
| Financial Documents ingestion | Feature-flagged off, no email/IMAP | `/financial-documents` is the finalized placeholder. |
| Agent Control Center | Feature-flagged off | `/agent` is a placeholder. |
| Attachment file uploads | Schema-ready, no UI | No `Attachment`/`JobAttachment`/`PostAttachment` UI exists. |
| CSV export (Statistics) | Not implemented | `/statistics` has no export button. |
| Saved views (billing/jobs/clients) | URL-based filters only | No saved-view UI. Schema has `SavedView`. |
| Email change for users | Not in admin UI | `UserManagementSection.tsx` Edit dialog has no email field. |

### 2.3 From `docs/current-implementation-audit.md` §3 (remaining gaps)

- Phase 3: Logout does not auto-stop the active timer session. Saved views not built. Confirmed: no auto-stop logic in `app/api/auth/[...nextauth]/route.ts` or `lib/auth.ts`.
- Phase 4: No post/reply attachments. No related-job picker on compose form. Communication landing shows post counts, not previews. Confirmed: `components/communication/ComposePost.tsx` has no attachment input and no job picker. `app/(portal)/communication/page.tsx:53-65` renders counts only.
- Phase 5: Client list saved views not built. Client reads are admin-only. Create flow cannot directly set inactive status. Confirmed: `components/clients/ClientDialog.tsx:174-187` shows the status field only when `mode === "edit"`.
- Phase 6: No edit dialogs for monthly items, hourly banks, or one-time charges. Confirmed: `ClientBillingTab.tsx` exposes only Add and Delete; the Pencil icon imported on line 14 is used only for the payments "Update" button, not for billing items.
- Phase 6: No time-bucketed aging on dashboard. Confirmed: `app/(portal)/dashboard/page.tsx` shows `unpaidCount`/`overdueCount` numbers, no buckets.
- Phase 8: CSV export not implemented. Confirmed: no export button in `/statistics`.
- Phase 8: Billing/payment summary section on statistics page deferred. Confirmed: `/statistics` has 8 ops KPIs, no money KPIs.
- Phase 8: Per-employee completion time breakdown not implemented.
- Phase 8: Hub take latency metric not implemented.
- Phase 9: Company details storage not implemented. Confirmed: `AdminPage.CompanyTab` (line 437) renders disabled inputs.
- Phase 9: SLA defaults not DB-backed.
- Phase 9: Email change for users not exposed in admin UI. Confirmed via grep of `UserManagementSection.tsx`.
- Phase 10: CSP, login rate limit, multi-instance rate limit, RTL per-page audit, SLA DB-backed editing, company details storage. Documented.

### 2.4 From `docs/phase-4-communication-audit.md` §3

| Item | Severity (doc) | Verified in code |
|---|---|---|
| Recent posts on landing | Low | Confirmed missing. |
| Attachments | Deferred | Confirmed. |
| Related client on posts | Deferred | Confirmed. No UI reads `relatedClientId`. |
| Related job picker on compose | Partial | `ComposePost.tsx` does not expose a picker; API accepts `relatedJobId`. |
| Postgres full-text | Deferred | `lib/communication/queries.ts` uses ilike. |
| Notifications | Out of MVP | Confirmed missing. |
| Communication API/route tests | Gap | Confirmed via test-file list. |
| Loading skeletons on compose | Partial | `useTransition` only. |

### 2.5 From `docs/phase-6-billing-audit.md` (partial reads)

- Create payment dialog on `/billing` page not present (Phase 6 audit §2.2). Verified.
- Time-bucketed aging strips not built. Verified.
- Edit dialogs for monthly/hourly/OTC items not built (delete + recreate is the workaround). Verified.

### 2.6 From `docs/internal-management-portal-enhancement/05-ux-ui-review.md` (spec)

Spec items that the build does not yet match:

| Spec section | Item | Built? |
|---|---|---|
| 1.7 | "Every list has filter, sort, search, save view." | Sort and save-view missing on most lists. |
| 3.1 | Search scope chips (Jobs, Clients, Posts, Documents, KB) | `GlobalSearch` queries `scope=all`; no chip UI. |
| 3.2 | Notifications bell with last-10 dropdown | Missing. Header has only search/lang/admin pill. |
| 4.1.4 | "Available in your hub" cards on employee dashboard | Missing. Quick Action link only. |
| 4.1.5 | "Communication highlights" on dashboard | Missing. |
| 4.1.6 | "Your week" mini stats | Missing. |
| 4.2.5 | "Hourly banks low" on admin dashboard | Missing. |
| 4.2.6 | "Recent client activity" on admin dashboard | Missing. |
| 4.2.7 | "Risk this week" SLA breaches list | Missing. |
| 7.1 | Quick actions on hover (open, take, mark working, mark done) on job card | Missing. Whole card is a Link. |
| 7.2 | Visual states: mine accent, delayed tint, breached border, reopened tag | Partial. SLA bar shows state; row tinting missing. |
| 8.1 | Job detail tabs (Overview, Timeline, Related, Files) | Missing. Single page, no tabs. |
| 8.1 | Reassign control on job detail | Missing. |
| 8.1 | Active timer panel on job detail | Missing. Timer is global only. |
| 9.1 | Client detail tabs include Payments and Notes as separate tabs | Built differently: Overview, Jobs, Billing, Receipts, Environment. Payments live inside Billing tab. Notes live in Overview. |
| 9.2 | CSAT mini-trend, Effort vs revenue chart | Marked Phase 2. |
| 10.1 | Aging buckets pill on Billing top strip | Missing. |
| 10.2 | Tabs: All payments / Monthly / Hourly / OTC / Drafts | Missing on `/billing`. Status filter chips instead. |
| 11.* | Receipts module | Stub. |
| 12.1 | Channel filter strip (tags, author, date, related client, related job, resolved) | Partial. Search + resolved toggle only. |
| 13.* | Agent Control Center | Stub. |
| 14.1 | Sidebar collapses to bottom drawer on mobile | Missing. |
| 14.1 | Job cards stack, list rows become cards on mobile | Mostly present. |
| 14.1 | Mark working / mark done / take task thumb-reachable | Untested. |
| 15 | Empty states link to next action | Partial. Most are descriptive, not actionable links. |
| 16 | Skeleton loaders for lists; inline retry banners | Partial. Skeleton only in HubView. |
| 17 | Two density modes | Single density. |
| 18 | Tab order documented per page | Not documented. |
| 19 (MVP-tagged) | Saved filter views | Missing. |
| 19 (MVP-tagged) | "Resume work" prompt on dashboard | Missing. The Timer bar shows the resume; no dashboard card. |

### 2.7 Schema-only models with no app code

Per `docs/current-implementation-audit.md:111`:
- `ReceiptDocument`, `ReceiptDocumentSequence` — Phase 7.
- `SavedView` — saved-views UI deferred.
- `Attachment`, `JobAttachment`, `PostAttachment`, `ReplyAttachment` — upload UI deferred.

---

## 3. In-code unfinished markers

The grep across `app/`, `components/`, and `lib/` returned no `TODO`, `FIXME`, `XXX`, `HACK`, `as any`, `@ts-ignore`, or `console.log` markers. The matches that grep returned for `placeholder` are all legitimate `placeholder=` attribute strings, the deliberate placeholder-amount field names (`amountPlaceholder`, `priceAmountPlaceholder`, `pricePerHourPlaceholder`, `totalPaymentPlaceholder`), or copy on the three placeholder pages.

| File:line | Marker | Context | Suggested resolution |
|---|---|---|---|
| n/a | TODO | — | None present in app/ or components/. |
| n/a | FIXME | — | None present. |
| n/a | HACK | — | None present. |
| n/a | XXX | — | None present. |
| n/a | `// @ts-ignore` | — | None present. |
| n/a | `as any` | — | None present. |
| n/a | `console.log` | — | None present. |
| `app/(portal)/admin/page.tsx:459` | "Company details storage is not yet implemented." | Copy in Company Details tab | Defer until `CompanySettings` DB table lands. |
| `app/(portal)/agent/page.tsx:71-76` | "is not yet provisioned", "No real agent code exists in this codebase." | Status copy in Agent page | Intentional. |
| `app/(portal)/clients/[id]/page.tsx:295-305` | `ReceiptsPlaceholder` component | Receipts tab on client detail | Remove tab or build receipts module. |
| `lib/i18n/en.json:106-109` and `he.json:106-109` | `placeholders.financialDocuments`, `placeholders.agent` | i18n strings for two placeholder pages | Strings exist but pages don't read them (i18n unused). |

Inferred unfinished work (no explicit marker, but functionality is clearly stubbed):

| File:line | What is missing | Suggested resolution |
|---|---|---|
| `app/(portal)/dashboard/page.tsx:339-345` | `greeting()` reads `new Date().getHours()` (server local time, not Asia/Jerusalem) | Use `formatInTimeZone` from `date-fns-tz` or accept locale via cookie. |
| `app/(portal)/communication/[channel]/page.tsx:57` | Channel search is a native GET form (full page reload) | Replace with debounced client-side filter matching `JobFiltersBar.tsx`. |
| `app/(portal)/communication/[channel]/[postId]/page.tsx:121` | No "Convert to job" action | Phase 2 per spec §12.3. |
| `app/(portal)/statistics/page.tsx:291, 366` | Local `KpiCard` and `EmptyState` re-implementations | Switch to `components/shared/KpiCard` and `EmptyState`. |
| `app/(portal)/statistics/page.tsx:330, 345` | `text-right`/`text-left` (physical) | Use `text-end`/`text-start`. |
| `components/jobs/MarkDoneSheet.tsx:16` | `currentStatus: _currentStatus` indicates a dead prop the consumer still passes | Either consume or remove from `JobTransitionButtons.tsx:153-158` calls. |
| `components/billing/ClientBillingTab.tsx:401, 525` | Raw Job UUID inputs for hourly-usage and one-time-charge dialogs | Build a job picker scoped to current client. |
| `components/billing/ClientBillingTab.tsx:566-572` | "one_time" source has no UI to pick which charge | Disable source until one-time picker is built. |
| `components/admin/TagManagementSection.tsx:84, 87` | `window.confirm`, `window.alert` | Match the inline-dialog pattern used elsewhere in admin. |
| `components/billing/ClientBillingTab.tsx:183, 337, 508` | `onClick={() => deleteX(id)}` with no confirmation | Add inline confirm or `AlertDialog`. |
| `components/clients/EnvironmentNotesSection.tsx:180` | Same — `clearSection` fires on click | Add confirm. |
| `components/timer/TimerBar.tsx:51` | Fetch failure silently returns null | Show a transient error banner. |
| `components/layout/Sidebar.tsx:38-75` | All nav labels hardcoded English | Read from `lib/i18n/nav.*`. |
| `components/jobs/JobStatusChip.tsx:17-28` | Status labels hardcoded English | Read from `lib/i18n/job.status.*`. |
| `components/jobs/JobPriorityChip.tsx:18-23` | Priority labels hardcoded English | Read from `lib/i18n/job.priority.*`. |
| `components/jobs/JobSeverityChip.tsx:11-16` | Severity labels hardcoded English | Read from `lib/i18n/job.severity.*`. |
| `components/billing/PaymentStatusChip.tsx:3-11` | Payment status labels hardcoded English | Read from `lib/i18n/payment.status.*`. |

---

## 4. Stub pages and placeholder routes

| Route | File | Type | Intentional? | Gating |
|---|---|---|---|---|
| `/receipts` | `app/(portal)/receipts/page.tsx` | Full-page stub | Yes (compliance hold) | Admin-only; feature flag `receipt_finalize_enabled=false`. |
| `/agent` | `app/(portal)/agent/page.tsx` | Full-page placeholder with planned-capabilities copy | Yes (no agent code exists) | Admin-only; feature flag `agent_control_center_module=false`. |
| `/financial-documents` | `app/(portal)/financial-documents/page.tsx` | Decorative placeholder with workflow + filters preview | Yes (no ingestion) | Admin-only; feature flag `financial_documents_module=false`. |
| `/clients/[id]?tab=receipts` | `app/(portal)/clients/[id]/page.tsx:295` | Embedded placeholder (`ReceiptsPlaceholder`) | Yes | Admin-only. |
| `/admin?tab=sla` | `app/(portal)/admin/page.tsx:385` | Read-only table, hardcoded values | Yes (no DB-backed SLA) | Admin-only. |
| `/admin?tab=company` | `app/(portal)/admin/page.tsx:437` | Disabled-input form, no backing storage | Yes (no `CompanySettings` table) | Admin-only. |
| `/admin?tab=org` | `app/(portal)/admin/page.tsx:325` | Read-only roles + departments | Yes (defined in seed) | Admin-only. |

All seven are honest about their state — they label themselves as placeholders, link to relevant flag toggles, and gate behind admin role. No "Coming Soon" emoji confetti.

---

## 5. Half-implemented features

### 5.1 UI exists, backend partial or absent

- **Saved views.** No UI anywhere. Schema has `SavedView` table. `JobFiltersBar` and `ClientFiltersBar` use URL params and would map cleanly to saved views.
- **Attachments on posts, replies, jobs.** Schema has `Attachment`, `PostAttachment`, `ReplyAttachment`, `JobAttachment`. No upload UI, no upload route, no storage backend. Phase 4 audit lists this as deferred.
- **Related-job on posts.** Schema has `relatedJobId` on `CommunicationPost`. API accepts the field. `ComposePost.tsx` has no picker. Display works in `app/(portal)/communication/[channel]/page.tsx:119-121`.
- **Related-client on posts.** Schema has `relatedClientId`. No UI consumes or sets it.
- **Notification bell.** Header has no bell. Spec section 3.2 is Phase 2.

### 5.2 Backend exists, UI absent

- **`/api/admin/users` POST accepts username, email, displayName, password, roleKey, departmentKey.** UI does this. But there is no email-change flow.
- **`POST /api/billing/payments`** accepts `sourceType: "one_time"` with `sourceOneTimeChargeId`. The Create-Payment dialog (`ClientBillingTab.tsx:579`) lets users choose `one_time` as source type but provides no picker for which charge. The form submits without `sourceOneTimeChargeId`, which the API may reject.

### 5.3 Backend done, UI partial

- **Hourly bank usage logging.** UI exists but requires pasting a raw Job UUID. `components/billing/ClientBillingTab.tsx:401-407`.
- **One-time charge creation.** Same. `ClientBillingTab.tsx:525`.
- **Feature flag toggle.** UI is admin-friendly with a special-case confirm for the receipt flag (`FeatureFlagSection.tsx:101-132`). Other flags toggle silently.
- **Audit log filter.** UI has action-substring filter and entity-type dropdown (`app/(portal)/admin/page.tsx:229-251`). No actor filter, no date-range filter.
- **Search.** `GlobalSearch.tsx` queries `scope=all`. Spec section 3.1 asked for scope chips visible in the input; chips are not built.

### 5.4 i18n: data ready, UI not

- `lib/i18n/{en,he}.json` are complete for the surfaces they cover (nav, common, auth, job/payment statuses, departments, settings labels, two placeholder messages).
- No code reads them outside types. The Hebrew toggle changes layout direction only.

### 5.5 Dark mode: tokens ready, no toggle

- Dark theme tokens in `app/globals.css:44-73`.
- `next-themes` in dependencies. Never imported.
- No `ThemeProvider`, no toggle UI.

---

## 6. Cleanup recommendations

### 6.1 Delete

- `placeholders.financialDocuments` and `placeholders.agent` in `lib/i18n/{en,he}.json` are dead until pages start reading them. Either consume them or remove.
- The `Pencil` icon import in `components/billing/ClientBillingTab.tsx:14` is used (line 636 in payments section), so keep. Re-check.
- The local `KpiCard` (line 291) and `EmptyState` (line 366) in `app/(portal)/statistics/page.tsx` should be deleted in favor of the shared versions.
- The `_currentStatus` parameter in `components/jobs/MarkDoneSheet.tsx:16` is renamed-but-unused. Drop it; the only caller `JobTransitionButtons.tsx` no longer needs to pass it.
- The four unused Radix packages (`@radix-ui/react-dialog`, `react-dropdown-menu`, `react-tooltip`, `react-avatar`) and `next-themes` in `package.json`. Either start using them or remove from dependencies. Recommendation: **use them**, because they would solve the dialog primitive and theming gaps.

### 6.2 Finish

P0 (block expanded pilot):
- Wire i18n into nav, chips, and form labels.
- Add focus trap, ESC, and `aria-modal` to the eight bespoke dialogs (use `@radix-ui/react-dialog`).
- Add confirm dialogs to `ClientBillingTab` and `EnvironmentNotesSection` destructive actions.
- Replace `window.confirm`/`window.alert` in `TagManagementSection.tsx`.
- Fix `Asia/Jerusalem` timezone usage in dashboard greeting and date pickers.

P1 (before broader rollout):
- Wire dark mode toggle.
- Add toast / global notification surface.
- Add `loading.tsx` per route group.
- Replace raw Job-UUID inputs in billing dialogs with a job picker.
- Mobile sidebar drawer; expose hub scope tabs on mobile.

P2 (defer with note):
- Saved views.
- Attachment UI.
- Notification bell.
- Statistics CSV export.
- Time-bucketed aging on `/billing` and dashboard.
- Recent posts preview on `/communication` landing.
- Job detail tabs.
- Edit dialogs for monthly billing / hourly banks / one-time charges.

### 6.3 Defer or formally remove

- **Phase 7 Receipts**: stays as a compliance-flagged stub. Defer until accountant sign-off; do not delete the route — the link is in the sidebar and the placeholder communicates the intent.
- **Agent Control Center**: stays as a placeholder. Defer until an agent actually exists; the placeholder is honest about the gap.
- **Financial Documents**: stays as a placeholder. The 449-line page is over-built for a stub but provides good documentation of the intended workflow; no harm.
- **Company Details (Admin tab)**: either build the `CompanySettings` table soon or hide this tab behind a feature flag. Disabled inputs invite confusion.

---

## Handoff to PM

Top three concerns:

The codebase has no debt-markers in code — zero `TODO`/`FIXME`/`HACK`/`console.log` — which is unusual and a strong signal that the team has been disciplined. The remaining unfinished work is structural rather than scattered: it lives in three intentional placeholder pages, one disabled admin tab, several spec items that were knowingly deferred, and one unwired layer (i18n). My first concern is that the i18n layer is fully built on the data side but completely unused on the UI side; this is the only piece of significant infra that ships with no wiring, and it directly affects pilot Hebrew users. Second, several feature-flag-gated placeholders (`/receipts`, `/agent`, `/financial-documents`, Admin Company Details) are well-built but should have an owner and a "build or hide" decision before pilot — keeping disabled mockups in the production navigation can erode user trust. Third, a small number of UX gaps from the spec are likely to surface as pilot feedback: no notification bell, no saved views, no time-bucketed aging, no job detail tabs, raw Job-UUID inputs in billing flows, and destructive deletes without confirmation. None require backend work; they are all UI tasks that fit a focused two-week polish sprint before pilot expansion.
