# Performance Sprint — Day 1 Morning Standup (PM log)

Date: 2026-08-22
Logged by: Robin Vale (PM). Upper-management record.
Attendees: Architects Dana Rho (Team Alpha), Sol Aster (Team Bravo); Engineers Kai Vector (lead), Priya N., Marco T. (Alpha); Lena Quist, Theo B., Yusuf A. (Bravo).
Agenda: CEO task 1 — "the website is slow and laggy, make it faster."

## Verdict (both architects concur)

The architecture is sound. No rewrite. Both team leads independently reported: portal pages are server components, data fetched server-side, search debounced, heavy libraries all correctly server-only. The lag the CEO feels on localhost is **mostly Next.js dev-mode compilation** (every route is dynamic due to the auth+cookies shell, so `next dev` recompiles each route on first visit). The remaining real issues are a short, converged list of config + data-shape fixes — not structural rot.

Recommended first move before any code change: benchmark against `next build && next start`. That quantifies how much of the perceived lag is dev-only and disappears in production.

## Challenges logged (ideas killed in discussion)

- **PM's lucide-react theory — REFUTED (Lena).** 93 files barrel-import lucide icons; PM flagged it as the likely #1 cause. Lena proved Next 15.5.18 already hardcodes `lucide-react` into the default `optimizePackageImports` list (`node_modules/next/dist/server/config.js:861-863`). Adding a config entry is a no-op. No PR spent.
- **`date-fns` optimize — dropped (Lena).** Imported in exactly 1 file. Non-issue.
- **Priya's pool-exhaustion finding (#3) — deferred, not killed.** Real, but a production-on-serverless concern. Irrelevant to the localhost complaint. Goes to the prod-hardening backlog, does not jump the queue.
- **Prisma client sprawl — ruled out (Kai + Priya).** Singleton is correct; the only other `new PrismaClient()` is the standalone seed script.

## Converged findings (deduplicated, ranked)

Two-or-more-engineer agreement raised confidence on the top items.

| # | Finding | Sources | Dev/Prod | Impact | Fix class |
|---|---------|---------|----------|--------|-----------|
| 1 | Feature flags read uncached — 92 call sites, 3+ DB reads per navigation on the shell alone, zero caching anywhere in app | Kai #2, Marco #1/#2 | PROD-REAL | H | Quick/Structural |
| 2 | Full i18n dictionary (en 52KB / he 63KB) serialized into RSC payload + client context on every portal route | Yusuf #1 | PROD-REAL | H | Structural |
| 3 | React Query `refetchOnWindowFocus` default-true + 10s staleTime → every tab refocus refetches all mounted queries | Lena #1, Marco #8 | PROD-REAL | M-H | Quick |
| 4 | Polling fleet: 6 always-mounted timers (30-60s) never unmount; 2 sidebar badges are 2 separate polled endpoints | Lena #2, Marco #4/#5 | PROD-REAL | M | Quick |
| 5 | `audit_logs` sorts createdAt desc with OFFSET, no createdAt-leading index → full scan+sort every page, unbounded table | Priya #1 | PROD-REAL | H | Migration |
| 6 | `jobs.completed_timestamp` unindexed but is the hottest stats date-window filter/sort | Priya #2, Kai #7 | PROD-REAL | H | Migration |
| 7 | `getAdminKpis` loads entire active-job set into Node just to `.length` it | Kai #3 | PROD-REAL | M | Quick |
| 8 | Zero `next/dynamic`/`React.lazy` in app — every dialog/drawer/editor/tab-body ships in route's initial JS | Yusuf #2-#8, Theo | PROD-REAL | M-H | Structural |
| 9 | `ClientBillingTab.tsx` 1113 lines — bundle weight + typing-lag re-renders (form state colocated with lists) | Lena #3, Theo, Yusuf #3/#7 | PROD-REAL + DEV | M | Structural |
| 10 | Billing/hub/jobs reads pull wide rows (no `select`); ClientBillingTab ships full `usages[]` arrays used only for sum+count | Kai #4, Marco #6/#7, Theo #7 | PROD-REAL | M | Quick |
| 11 | `/api/statistics` recomputes ~19 aggregations every hit, uncached | Marco #3 | PROD-REAL | M | Structural |
| 12 | Free-text search (jobs/clients/audit action) uses `ILIKE %term%`, no pg_trgm GIN (only knowledge has it) | Priya #5/#8/#10 | PROD-REAL | M | Migration |
| 13 | Unindexed FKs on billing/receipt join paths | Priya #7 | PROD-REAL | M | Migration |
| 14 | `EmbeddedPdfPreview` fires puppeteer PDF render on first paint of every receipt-detail view | Yusuf #6 | PROD-REAL | M | Quick |
| 15 | Prisma logs every SQL query to stdout in dev (~15-18 per dashboard load) | Kai #6 | DEV-ONLY | M (dev loop) | Quick |
| 16 | Radix packages not in `optimizePackageImports`; dead Heebo woff2 files ship nothing | Lena #5/#6 | PROD-REAL | L | Quick |

Heavy-lib containment (Yusuf): puppeteer PASS, lib/pdf PASS, @aws-sdk PASS, bcryptjs PASS, zod bounded to login route. No client leaks across all 103 client files.

## Proposed execution plan

### Phase 0 — Benchmark (diagnostic, non-destructive)
Run `next build && next start`, compare navigation feel to dev. Sets the real baseline and tells us how much of Phase B is even worth doing.

### Phase A — Quick wins (config + surgical, near-zero risk, behavior-preserving)
Helps both dev loop and production. Estimated half a day total.
- A1. `QueryProvider`: `refetchOnWindowFocus: false`, `staleTime: 30_000`. (#3)
- A2. Drop `"query"` from dev Prisma log. (#15)
- A3. Request-dedup feature flags via React `cache()`. (#1, first pass)
- A4. Collapse 2 sidebar badge polls into one `/api/sidebar/badges`; drop the wasted `findMany(take:1)`. (#4)
- A5. `getAdminKpis` → `count()` instead of loading all active jobs. (#7)
- A6. Add `select` to billing/hub list reads. (#10)
- A7. Add `@radix-ui/*` to `optimizePackageImports`; delete dead Heebo woff2. (#16)
- A8. Defer `EmbeddedPdfPreview` render until click/viewport. (#14)

### Phase A-DB — Index migration (one migration, low risk, mechanical)
- `audit_logs (created_at DESC)` (#5)
- `jobs (status, completed_timestamp DESC)` (#6)
- `jobs (priority DESC, created_at DESC)` (#6/Priya #4)
- pg_trgm GIN on `jobs.title`, `clients.company_name`, `audit_logs.action` (#12)
- FK indexes on billing/receipt join columns (#13)

### Phase B — Structural (own PRs, needs sign-off)
- B1. ClientBillingTab 1113-line split — Theo's 6-PR behavior-preserving sequence. (#9)
- B2. Code-splitting pass — `next/dynamic` for dialogs/drawers/PDF preview/tab bodies per Yusuf's candidate list. (#8)
- B3. i18n payload reduction — namespace split / per-route key subset. (#2)
- B4. `unstable_cache` for feature flags + statistics with tag invalidation. (#1, #11)

### Deferred (prod-hardening / scale, not localhost)
Serverless pool params + directUrl (Priya #3); jobs/hub pagination (Marco #6/#7); minor user-FK indexes (Priya #9); notifications poll-count-only (Marco #9).

## Approval gate
CEO approved: quick wins + benchmark. Executed — see below.

## Execution — Phase A (2026-08-22 afternoon)

### Benchmark baseline (prod build, pre-Phase-A)
Compile 48s. Shared First Load JS 102 kB. Heaviest routes: /billing 174 kB, /clients 163 kB, /clients/[id] 152 kB, /receipts/[id] 143 kB, /admin 141 kB, /dashboard 113 kB. **Verdict: the production bundle is already healthy.** Confirms Kai's thesis — the localhost lag is dev-mode compilation, not app weight.

### Shipped
- **A1** `components/providers/QueryProvider.tsx` — `refetchOnWindowFocus: false` + `staleTime: 30_000`. Kills the focus-refetch storm.
- **A2** `lib/prisma.ts` — drop per-query SQL logging in dev (opt back in via `PRISMA_QUERY_LOG=true`). Quiets the dev loop.
- **A3** `lib/feature-flags.ts` — React `cache()` request-dedup on `getFeatureFlag`/`getFeatureFlags`. Collapses the duplicate per-navigation flag reads.
- **A5** `lib/dashboard/queries.ts` `getAdminKpis` — `count()` + a SQL breach-count instead of loading every active job into Node. KPI now uses the same breach predicate as the delayed list, so they agree.
- **A7** `next.config.ts` — Radix added to `optimizePackageImports`.

### Verification
typecheck clean; **868/868 tests pass** (120 files); prod build green (46s).

### Post-Phase-A delta (honest)
Bundle sizes essentially unchanged. **The Radix optimize was a wash** — Radix entry points already tree-shake, so listing them did nothing measurable. Expected: 4 of 5 edits are server-side and the bundle was already lean. Phase A's real wins are in per-navigation **server query volume** (A3, A5) and **dev-loop noise** (A2) + **client refetch behavior** (A1) — none of which the static build table measures.

### Ideas killed on verification (challenge culture working)
- **Heebo "dead fonts" (Lena) — REFUTED.** `lib/pdf/templates/base.ts` loads `/fonts/heebo/*.woff2` for Hebrew receipt PDFs. Deleting them would break Hebrew tax documents. Fonts kept.
- **lucide-react optimize (PM) — REFUTED earlier by Lena.** Next 15 default already covers it.

### Reclassified out of Phase A (regression risk doesn't belong in a near-zero-risk pass)
- **A4** sidebar badge endpoint collapse → Phase B (needs a new `/api/sidebar/badges` + tests).
- **A6** billing `select`-trim → Phase B (folds into Theo's server-DTO trim, his PR #6; needs careful field enumeration to avoid breaking the billing tab).
- **A8** defer PDF preview render → **dropped.** On the receipt-detail page the preview IS the primary content and in view on load, so deferring trades the page's core purpose for a marginal gain.

### Status
Phase A merged to the working tree (uncommitted). Awaiting CEO call on Phase B — the structural work: ClientBillingTab split (Theo's 6-PR plan), code-splitting the dialogs, i18n payload reduction, cross-request flag/stats caching.

## Production-mode enablement (the practical win)

CEO's real goal: a fast site for daily testing/demos on localhost. The answer is running production mode (`next start`) instead of `next dev` — no per-route recompiling. Added a `pnpm serve` script (`next build && next start`). Prod page loads: **0.08–0.24s vs ~9s in dev.**

Enabling it surfaced **two real auth bugs that only appear in production** (dev auto-relaxes, which is why they were hidden):

1. **`UntrustedHost` — all login broken in prod.** Auth.js v5 requires `trustHost: true` in production; without it every `/api/auth/*` call errored and no session resolved. Fix: `trustHost: true` in `lib/auth.ts`. This is also required for any real self-hosted deployment.
2. **Middleware redirect loop.** `middleware.ts` used `!!req.auth`, but the Edge-runtime session (downstream of bug 1) was a truthy-but-empty object, so every request read as "logged in" — bouncing `/login → /dashboard → /login`. Fix: guard on `!!req.auth?.user`. Correct hardening regardless.

Verified end-to-end in prod: CSRF → credentials login → 302 to /dashboard → session resolves (full user) → authed pages 200; unauth still correctly routed to `/login?callbackUrl`. typecheck clean, 868/868 tests pass.

### How to run it (for the CEO)
- **Fast daily use / demos / testing:** `pnpm serve` (build once, then serves production). Currently running on :3000.
- **Active development (live reload on edit):** `pnpm dev`.
- Caveat: in production mode, code edits do NOT appear until you re-run `pnpm serve`.
