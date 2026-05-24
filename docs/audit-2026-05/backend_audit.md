# Backend and Architecture Audit

Project: Skyware-management (internal operations portal).
Date: 2026-05-24.
Scope: system architecture, API and domain layering, auth gating, scalability, operational readiness, tech debt.
Out of scope: schema design, test coverage, UX critique, analytics business value (owned by other auditors).

---

## 1. Executive summary

- The portal is a coherent Next.js 15 App Router application. Route groups, the API layer, and a thin domain layer in `lib/` follow a clean and consistent pattern. There is no obvious cargo cult and no premature framework abstractions.
- API routes have a uniform shape: `requireAuth` -> role gate -> Zod parse -> Prisma transaction with `writeAudit`. This is the single most valuable architectural property in the repo.
- Authorization is partially centralized in `lib/permissions.ts`, but a parallel implementation of the actor-relation idea lives in `lib/jobs/lifecycle.ts`. Permission scope filtering for jobs and posts is repeated inline in three places. This is the largest tech-debt cluster.
- There are no server actions. All mutations are REST routes. This is a defensible single-style decision and matches the spec's "pick one style; keep it consistent" rule (`docs/internal-management-portal-final-plan/05-file-by-file-implementation-plan.md` line 173).
- Operational primitives exist but are underused: rate-limiting is wired to only two endpoints, `writeAudit` is called from every mutation, and there is a working `/api/health` check, but there is no structured logging, no error reporter, and no `console` usage anywhere.
- Scalability concerns are concentrated in the statistics queries and dashboard list builders. Several functions iterate users or clients and issue 2-3 Prisma queries inside `Promise.all` per row, producing classic N+1 query fan-out on what would normally be a single aggregation.
- The Prisma migrations folder contains only `migration_lock.toml`. The schema exists at 812 lines but no migration has ever been generated. The current deployment story relies on `prisma db push` style provisioning or hand-applied SQL. The Data Engineer owns the schema, but this has an immediate architectural and operational impact: no `prisma migrate deploy` will work in production today.
- Several pages re-check the session that the layout already enforces, and a handful of pages run the admin-only redirect a second time after the layout. Light duplication, no security risk, easy to consolidate.

---

## 2. Architecture overview as-built

### 2.1 Route groups and high-level shape

The application uses three Next.js route groups under `app/`:

- `app/(auth)/` - login shell (`app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`). Centered card, no sidebar.
- `app/(portal)/` - authenticated shell with sidebar and header (`app/(portal)/layout.tsx`). Wraps every page that requires a session and runs `QueryProvider` so React Query is available everywhere inside.
- `app/api/` - REST handlers for all server mutations and most reads. NextAuth is wired here via `app/api/auth/[...nextauth]/route.ts`.

The root layout (`app/layout.tsx` lines 14-30) reads the locale cookie and sets `dir="rtl"` for Hebrew. There is one `metadata` block, one font (`Inter`), and `globals.css` for theme variables.

`middleware.ts` (39 lines) is intentionally thin. It does only two things:
1. Pass through `/api/auth/*` and `/api/health` unconditionally (lines 14-19).
2. Redirect unauthenticated requests to `/login`, preserving `callbackUrl` (lines 25-32).

Per-route authorization happens at the API and page-handler layer, not in the middleware. This is the right call for a JWT-session NextAuth setup where role is in the token; middleware does not need to decode the JWT to enforce coarse "logged in or not."

### 2.2 Layered structure (as-built)

```
app/(portal)/<page>/page.tsx     RSC. Calls auth(), then lib/<domain>/queries.ts directly.
app/api/<domain>/route.ts        Edge of the system. Calls requireAuth + lib/<domain>.
lib/<domain>/queries.ts          Read-side helpers. Prisma + permission filtering.
lib/<domain>/lifecycle.ts        Pure functions (only jobs).
lib/{auth,permissions,prisma,
     audit,rate-limit,sla,
     time,utils,
     feature-flags,api-utils}.ts Cross-cutting libs.
lib/i18n/                        en.json, he.json, index.ts.
components/<domain>/             Mix of server and "use client" components.
```

There is **no service/repository layer**. `lib/<domain>/queries.ts` is a thin read-side wrapper over Prisma, and write operations live inline in the route handlers. For this project's MVP scope (about 38 API routes) that is acceptable; the write logic is small and the transactions are local. It would become a problem when the same mutation is needed from two callers.

### 2.3 Key conventions

The codebase has developed real conventions that are followed in every route I sampled:

| Convention | Where established | Followed in |
|---|---|---|
| `requireAuth()` at the top of every handler | `lib/api-utils.ts` lines 10-18 | All 38 routes I sampled |
| Role gate via `isAdmin(auth.user)` | `lib/permissions.ts` line 14 | Every admin-only POST/PATCH |
| Zod schema declared above the handler, `safeParse` then `badRequest(parsed.error.issues)` | Standard | jobs, clients, billing, channels, admin |
| Mutation in `prisma.$transaction(async (tx) => ...)` with `writeAudit(tx, ...)` | `lib/audit.ts` lines 40-58 | Every mutation I sampled |
| Page handlers redirect `/login` if no session, then redirect `/dashboard` if not admin and page is admin-only | Pattern | Every admin-only page |
| `interface Params { params: Promise<{ ... }> }` for Next 15 async params | Pattern | Every `[id]` route |
| HTTP status codes: 200, 201 (create), 204 (delete), 400 (Zod), 401 (no auth), 403 (no perms), 404 (no entity), 409 (concurrency), 422 (state error), 429 (rate-limit) | Pattern | Consistent across routes |

The status-code discipline (especially 409 for hub take and 422 for invalid lifecycle transitions) is unusually good for an MVP and is worth keeping.

---

## 3. API layer review

### 3.1 Surface area

Per `find app/api -name route.ts`, there are 38 route files spread across:

```
admin/{audit-logs,feature-flags/[key],tags,tags/[id],users,users/[id],users/[id]/password}
auth/[...nextauth]
billing/payments, billing/payments/[id]
channels, channels/[key]/posts, channels/[key]/posts/[id], channels/[key]/posts/[id]/replies
clients, clients/[id]
clients/[id]/billing/{hourly-banks,hourly-banks/[bankId],hourly-banks/[bankId]/usages,
                     monthly-items,monthly-items/[itemId],
                     one-time-charges,one-time-charges/[chargeId]}
clients/[id]/environment-notes, clients/[id]/environment-notes/[noteId]
health
hub/[scope], hub/[scope]/take
jobs, jobs/[id], jobs/[id]/time-sessions, jobs/[id]/transitions, jobs/[id]/work-report
search
statistics
tags
timer, timer/[sessionId]
users, users/me, users/me/password
```

This nesting accurately mirrors the domain. The `billing` nesting under `clients/[id]/` is the right shape (the billing items only exist in the context of a client).

### 3.2 Validation

Every POST and PATCH I sampled validates input with `zod` and routes errors through `badRequest(parsed.error.issues)` from `lib/api-utils.ts` line 26.

Schemas are declared inline above the handler. They are not centralized in `lib/validators/zod-schemas.ts` as the original plan recommended (`docs/internal-management-portal-final-plan/05-file-by-file-implementation-plan.md` lines 308-309). For this MVP the inline schemas are readable and there is little reuse to capture, so this is acceptable. If write logic moves to server actions later, central schemas become more useful.

A small inconsistency: the create schemas often use `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` for dates (e.g. `app/api/billing/payments/route.ts` line 38) and then parse to `Date` inside the handler. This is fine; `z.coerce.date()` would be a one-line simplification.

### 3.3 Error contract

The error envelope is `{ error: string }` for 4xx, with an optional `issues` array for 400s. This is uniform across the surface.

A real inconsistency: a few mutations return one-off shapes outside this envelope.
- `app/api/hub/[scope]/take/route.ts` line 19 returns `{ error: "jobId is required" }` with status 400, but inline instead of using `badRequest`. Functionally identical, stylistically out of pattern.
- `app/api/users/me/password/route.ts` line 32 returns `{ error: "User not found" }` with status 404 instead of `notFound("User")`. Also inline.

There is no central error handler. Any uncaught Prisma error becomes a 500 with Next.js's default JSON body. This is fine in dev and acceptable for an internal pilot but should grow into an `errorMiddleware`-style wrapper before any external exposure. There is no `console.error` anywhere in `app/` or `lib/` (`grep -rn "console\." app lib` returns nothing) so the only error visibility today is whatever the Next dev server prints to stdout.

### 3.4 Status code review

Status codes are used correctly and consistently:
- 200: GET success.
- 201: create (every POST that creates a resource returns 201; see `app/api/jobs/route.ts` line 131, `app/api/clients/route.ts` line 79, etc.).
- 204: `app/api/admin/tags/[id]/route.ts` line 83 returns 204 on DELETE. Good.
- 409: `app/api/hub/[scope]/take/route.ts` line 59 returns 409 on optimistic-concurrency loss. Correct.
- 422: `app/api/jobs/[id]/transitions/route.ts` line 42 returns 422 for invalid lifecycle transitions, and `app/api/users/me/password/route.ts` line 36 returns 422 for "current password incorrect." Correct.
- 429: returned by `lib/rate-limit.ts` line 58 via `tooManyRequests()`.

### 3.5 Method coverage and HTTP semantics

- Every collection route supports GET (list) and POST (create) where applicable. Every `[id]` route supports GET (read), PATCH (partial update), and DELETE where applicable.
- PATCH is preferred over PUT consistently. Good - matches the partial-update semantics used.
- Idempotency keys are not used anywhere. Acceptable for an internal portal; relevant if the public/agent surface later accepts user-triggered retries.

### 3.6 RESTfulness vs RPC-ish endpoints

There are a few RPC-style endpoints. They are well-chosen:
- `POST /api/hub/[scope]/take` - this is naturally a verb (take), not a resource creation. Returning the updated job is correct.
- `POST /api/jobs/[id]/transitions` - models the transition as a write to the transition collection. Defensible.
- `PATCH /api/timer/[sessionId]` with `{ action: "pause" | "resume" | "stop" }` (`app/api/timer/[sessionId]/route.ts` lines 8-10). This is the only place a body verb drives meaningfully different code paths; it leaks "method dispatch through a JSON field" into the API. Three sub-routes (`/pause`, `/resume`, `/stop`) would be more honest, but the current shape is small enough that this is a Low-priority style nit.

---

## 4. Domain layer review (`lib/*`)

### 4.1 Organization

```
lib/
  api-utils.ts            Auth + JSON-response helpers (33 lines).
  audit.ts                writeAudit + redaction (58 lines).
  auth.ts                 NextAuth config + Credentials provider (93 lines).
  feature-flags.ts        getFeatureFlag + getFeatureFlags (24 lines).
  i18n/                   en.json, he.json, index.ts.
  permissions.ts          Pure functions (125 lines).
  prisma.ts               Singleton client (13 lines).
  rate-limit.ts           In-memory limiter (68 lines).
  sla.ts                  deriveSlaTargetMinutes, computeSlaState (54 lines).
  time.ts                 date-fns wrappers (30 lines).
  utils.ts                cn() (6 lines).
  billing/queries.ts      Read helpers (100 lines).
  clients/queries.ts      Read helpers (78 lines).
  communication/queries.ts Read helpers (96 lines).
  dashboard/queries.ts    Dashboard aggregates (186 lines).
  jobs/lifecycle.ts       Transition table + pure helpers (119 lines).
  jobs/numbers.ts         Public number generation (25 lines).
  jobs/queries.ts         Permission-aware list/detail (161 lines).
  statistics/queries.ts   Aggregates for stats page (281 lines).
```

This is a healthy shape. Each domain has one or two files; nothing is over-abstracted. No service layer was prematurely introduced.

### 4.2 Separation of concerns

The reads are clean. `lib/jobs/queries.ts` does the right thing: it builds a `where` filter that includes the user's permission scope (`buildWhere` at line 112), uses a constant `JOB_SELECT` (line 19) for shape stability, and exposes a single `listJobsForUser` that the page and the API both call. This avoids the bug where the API and the page diverge in what they return.

The writes are split between the API route and `prisma.$transaction(tx, ...)` callbacks. There is no separation between "transport concern" (parsing request, writing response) and "domain concern" (mutating state, writing audit). For this MVP that is acceptable, but two patterns I noticed will hurt later:

1. `app/api/jobs/[id]/transitions/route.ts` lines 47-106 contains substantial business logic inline: timestamp updates, first-response detection, hub-take handling, status event creation, and audit log. None of this is in `lib/jobs/`. If a second caller (the planned agent, a server action) ever needs to drive the same transition, it has to duplicate the route handler.
2. `app/api/jobs/route.ts` lines 65-129 (POST) similarly inlines the job creation: SLA derivation, initial-status selection, tag lookup, JobStatusEvent creation, and audit. This is reasonable to extract to `lib/jobs/create.ts` if the schema for "create job" is ever needed from another path (e.g., the planned email-to-job, or the agent).

### 4.3 Repeated patterns

The same permission filter for "what jobs can this user see" is written three times:
- `lib/jobs/queries.ts` lines 117-124 (in `buildWhere`).
- `app/api/search/route.ts` lines 38-46 (inline `scopeWhere`).
- `app/api/channels/[key]/posts/route.ts` lines 63-72 (inline for `relatedJobId` validation).

All three express the same rule: "admin sees all; employee sees own + own dept + global." This belongs in `lib/permissions.ts` as a `Prisma.JobWhereInput` builder, e.g., `jobScopeFilter(user): Prisma.JobWhereInput`. Today, if that rule changes, three files need to change in sync.

The same `JSON diff` building shape - `Object.entries(parsed.data).map(([k, v]) => [k, { old: ..., new: v }])` - is repeated in `app/api/jobs/[id]/route.ts` lines 69-71, `app/api/clients/[id]/route.ts` lines 66-74, `app/api/billing/payments/[id]/route.ts` lines 54-63, `app/api/admin/users/[id]/route.ts` lines 49-72, and `app/api/admin/tags/[id]/route.ts` lines 30-38. A `buildDiff(existing, patch)` helper in `lib/audit.ts` would remove ~40 lines and unify the "old: null" vs "old: actual" inconsistency (some routes use null for old, others use the actual old value).

### 4.4 Duplicate logic between `lib/permissions.ts` and `lib/jobs/lifecycle.ts`

`lib/permissions.ts` defines `resolveActorRelation` at lines 52-59:
```ts
export function resolveActorRelation(
  user: SessionUser,
  assignedEmployeeId: string | null
): ActorRelation {
  if (isAdmin(user)) return "admin";
  if (assignedEmployeeId === user.id) return "assignee";
  return "eligible_taker";
}
```

`lib/jobs/lifecycle.ts` defines `resolveActorRelation` at lines 83-91:
```ts
export function resolveActorRelation(
  roleKey: RoleKey,
  userId: string,
  assignedEmployeeId: string | null
): ActorRelation {
  if (roleKey === "ceo" || roleKey === "cto") return "admin";
  if (userId === assignedEmployeeId) return "assignee";
  return "eligible_taker";
}
```

Two functions with the same name, different signatures, identical intent. The lifecycle version is the one actually called from `app/api/jobs/[id]/transitions/route.ts` line 38 and `app/api/jobs/[id]/work-report/route.ts` line 28. The permissions.ts version appears unused. This is a small refactor (use one, delete the other) but it is a real foot-gun.

### 4.5 What is in `lib/` but referenced from `06-ux-flow-spec.md` as planned-but-not-built

Per `docs/internal-management-portal-final-plan/05-file-by-file-implementation-plan.md` lines 282-313 the plan called for:
- `lib/hebrew.ts` - missing. RTL handling is done in `app/layout.tsx`.
- `lib/money.ts` - missing. Currency formatting is inline in pages (e.g., `app/(portal)/billing/page.tsx` lines 30-33).
- `lib/vat.ts` - missing. Not needed yet (Receipts module is stub).
- `lib/search.ts` - missing. Search is built inline in `app/api/search/route.ts`.
- `lib/receipts/numbering.ts` - missing. Receipts not implemented.
- `lib/billing/aging.ts` - missing. Aging is implicit via `getAgingPayments` in `lib/billing/queries.ts` line 90, no bucket helper.
- `lib/billing/burn-rate.ts` - missing. Lives in `components/billing/BurnRateBar.tsx`.
- `lib/middleware/rate-limit.ts` - moved to `lib/rate-limit.ts`. Fine.
- `lib/middleware/security-headers.ts` - moved to `next.config.ts`. Fine.

None of these are blocking. They are the "we did not need it yet" tier. Worth tracking so they do not regrow as duplicated inline code.

---

## 5. Auth, permissions, middleware

### 5.1 NextAuth wiring (`lib/auth.ts`)

A single Credentials provider (`lib/auth.ts` lines 26-62). Username + password via `bcryptjs.compare` (line 42). The `authorize` callback returns a typed `AuthUser` containing `id, email, name, username, roleKey, departmentKey, isAdmin, languagePref`. Last-login update is fire-and-forget (`void prisma.user.update(...)` at line 46) which is correct - it should not block sign-in.

The JWT and session callbacks (lines 69-92) extend the token with the extra fields and copy them onto `session.user`. The cast through `unknown` (line 72) is a workaround for NextAuth's narrow `User` type and is acceptable.

`session.strategy: "jwt"` (line 67) is the right choice for this app's structure - no database session lookup per request.

### 5.2 Middleware (`middleware.ts`)

The middleware is intentionally minimal. Two notable details:

- The matcher (lines 38-41) skips `_next/static`, `_next/image`, `favicon.ico`, and image assets. The compiled regex `(?!_next/static|...)` is correct.
- API routes other than `/api/auth/*` and `/api/health` are **redirected to `/login`** if no session, which means an XHR call from a logged-out client gets a 302 to HTML, not a 401 JSON. This is unusual. The actual API handlers also call `requireAuth()` and return 401 JSON, so any client that follows a 302 to `/login` will get HTML; any client that does not follow redirects will see the 302. Most React Query consumers in this app pass through `fetch`, which follows redirects by default; the resulting HTML body in JSON parsing would throw and surface as a generic error. For a single-process internal pilot this is fine, but a clearer contract for `/api/*` would be: 401 from middleware as well, not 302.

### 5.3 Permission helpers (`lib/permissions.ts`)

Pure functions, no Prisma. Good for unit testing (and `tests/unit/permissions.test.ts` reports 24 tests per `docs/production-readiness.md` line 185).

The helpers cover read scope (`canAccessDepartment`, `canReadJob`), write scope (resolved via `ActorRelation`), hub access (`canTakeInHub`), communication (`canPostInChannel`), page access (`canAccessPage` with `ADMIN_ONLY_PAGES`), and money roles (`canManageBilling`, `canFinalizeReceipt`).

What is missing:
- A `Prisma.JobWhereInput` builder for scope filtering (see Section 4.3).
- A `Prisma.CommunicationPostWhereInput` builder for scope-filtered post lists. Today `app/api/search/route.ts` lines 95-101 reads **all channels**, filters in JS via `canPostInChannel`, and uses the resulting `visibleChannelIds`. For four channels this is fine; the pattern does not scale.
- An assertion-style wrapper (`assertCanReadJob`, `assertCanManageBilling`) that returns `NextResponse` so handlers can do `assertCanManageBilling(user) ?? continue`. The current `if (!isAdmin(user)) return forbidden()` is repeated everywhere - small but real boilerplate.

### 5.4 Auth gating across layers

There is real defense-in-depth, with one bit of redundancy:

- Middleware enforces "logged in."
- `app/(portal)/layout.tsx` line 15 re-checks the session and redirects to `/login` if missing. Good - the layout owns the typed `SessionUser` cast and passes it to `Sidebar`, `Header`, and `TimerBar`.
- Every page inside `(portal)/` then runs `const session = await auth(); if (!session?.user) redirect("/login");` again. `grep -rn "if (!session" app/(portal)/` shows this pattern in **19 page files**. Strictly speaking it is unnecessary because the layout guarantees a session, but it is harmless (`auth()` reads the JWT from cookies; it does not hit the database) and pages do need the typed `SessionUser` for `isAdmin(user)` checks.
- Admin-only pages then redirect to `/dashboard` if `!isAdmin(user)` (`grep -rn "redirect.*\"/dashboard\"" app/(portal)/` finds this in 9 page files: receipts, statistics, statistics/email-to-job, clients (list + detail), agent, financial-documents, admin, billing). This second-tier check is correct and necessary - the middleware does not know about admin status; only the page can enforce it.
- API routes always call `requireAuth()` and then `isAdmin(auth.user)` where required. Good. The UI never determines authorization.

The redundancy could be cleaned up by having the `(portal)/layout.tsx` pass `user` into a context that the pages read. Today every page does `const session = await auth(); ... const user = session.user as SessionUser;` (5 lines per page, ~95 lines total). Not a security problem, just noise.

### 5.5 Risks

- **No server-side session invalidation.** A JWT issued by NextAuth is valid until expiry (NextAuth default 30 days). If a user is deactivated via `PATCH /api/admin/users/[id]`, their existing session remains valid until they sign out or the token expires. There is no JWT revocation list. For a small internal portal this is acceptable. For sensitive operations (admin actions on finance data), consider re-fetching `isActive` on each admin write.
- **No CSRF protection for the REST API.** NextAuth's `[...nextauth]` handles CSRF for its own endpoints. The handcrafted REST endpoints rely on same-origin policy and the session cookie's `SameSite=Lax` default. For an internal portal served on a single domain this is acceptable. If the API is ever exposed to third parties or a separate UI domain, double-submit tokens or `Origin` header checks become necessary.
- **Password is the only authentication factor.** No 2FA, no SSO. Acceptable for the MVP; flag for compliance review if the portal handles real client billing data.

---

## 6. Scalability and performance concerns

### 6.1 N+1 query patterns in statistics and dashboard

`lib/statistics/queries.ts`:
- `getEmployeeStats` (lines 129-182): fetches active users, then issues **3 queries per user** (count active, count completed, sum hours). With 50 employees this is 151 queries on every page load of `/statistics`.
- `getDepartmentStats` (lines 186-236): fetches departments, then **3 queries per department** (count active, count completed, find delayed). Acceptable today (4 departments fixed by seed), but the pattern is wrong.
- `getClientStats` (lines 240-281): fetches active clients (capped at 100), then **2 queries per client**. With the cap the worst case is 200 queries.

These can all be replaced by `groupBy` aggregations: `prisma.job.groupBy({ by: ["assignedEmployeeId", "status"], _count: true, where: ... })`. The pattern as written turns a "show me the dashboard" page into hundreds of round trips. Today the user count is tiny, so it is invisible; at 50 employees and 100 clients it becomes the slowest page in the app.

`lib/dashboard/queries.ts`:
- `getAdminKpis` line 38-44 fetches every active job's `id, assignedTimestamp, slaTargetMinutes` and computes delayed-count in JS (lines 47-49). This loads the full active-jobs table into memory. With 1000 active jobs this is ~50KB per request. Could be a single `prisma.job.count` with a raw SQL fragment (`assigned_timestamp + interval '1 minute' * sla_target_minutes < now()`).
- `getAdminDashboardLists` line 94-109 fetches up to 50 active jobs to filter for delayed in JS (line 112). Same shape.
- Per-user `getEmployeeKpis` does the same thing scoped to the user.

`lib/statistics/queries.ts` `getOverviewKpis` line 106-113 also fetches all active jobs with SLA to compute delayed in JS. Same pattern, same fix.

### 6.2 Search performance

`app/api/search/route.ts` lines 95-99 reads **all** `CommunicationChannel` rows on every search to determine visibility. At four channels (the current seed) this is trivial. The pattern would break with a channel-per-department or channel-per-client model.

The query itself uses `contains: q, mode: "insensitive"` against `title`, `body`, and `publicNumber` columns. This is `ILIKE '%q%'`, which means no index can be used for a leading-wildcard match. For an MVP this is fine. Per `docs/current-implementation-audit.md` line 161 the team flagged "ilike search used instead of Postgres full-text index" as acceptable at MVP scale. Documented, accepted.

### 6.3 Job list query

`lib/jobs/queries.ts`:
- `listJobsForUser` is capped at `take: 200` (line 61). Good. With 200 jobs the included `_count: { select: { statusEvents: true } }` (line 42) adds a correlated subquery per row but it is the same query pattern Prisma generates everywhere, and Postgres handles it well.
- `getJobForUser` (lines 66-110) reads the job, then filters out by `canReadJob`. This is two round trips' worth of data when one would do (a `WHERE` clause on the initial query). For job detail it is fine - one row.

### 6.4 Caching

There is **no caching anywhere**. `grep -rn "unstable_cache\|revalidatePath\|revalidateTag\|noStore\|next/cache" app/ lib/ components/` returns no matches. Every RSC fetch hits Prisma; every API call hits Prisma. The React Query setup (`components/providers/QueryProvider.tsx` lines 9-13) has `staleTime: 10_000` which is the only client-side cache.

For an internal MVP that is acceptable. For pre-production:
- Page caching for `/api/health` (already `force-dynamic`, see line 3 of `app/api/health/route.ts`).
- Tag-based revalidation for tags list (`/api/tags` and `/api/admin/tags`). Tags rarely change but every page that lists jobs/posts wants them.
- `unstable_cache` for `getFeatureFlag` / `getFeatureFlags` - feature flags rarely change and every server-rendered page hits at least one (`/agent`, `/financial-documents`, etc.).

### 6.5 Rate limiting

`lib/rate-limit.ts` lines 17-46 implements an in-memory limiter with a `Map<string, Window>` and a 10-minute cleanup interval (lines 21-28). This is used in exactly two routes:
- `app/api/admin/users/[id]/password/route.ts` line 16.
- `app/api/users/me/password/route.ts` line 16.

The library author documented the limitation directly in the source (lines 3-10): single-process only, resets on restart. This is the right comment to leave.

The `/api/auth/[...nextauth]` route is **not** rate-limited by app code (acknowledged in `docs/production-readiness.md` line 158). For pilot launch, this is the single largest brute-force vector. A reverse proxy (nginx, Caddy) or a small wrapper around the NextAuth handler would close this.

### 6.6 Prisma client logging in production

`lib/prisma.ts` line 9: `log: process.env["NODE_ENV"] === "development" ? ["query", "warn", "error"] : ["error"]`. Sensible. The dev `["query"]` will write every SQL query to stdout, which is fine for development.

The fact that the singleton uses `globalThis` to persist across hot reloads (lines 4-12) is the standard Next.js pattern. Correct.

---

## 7. Operational readiness

### 7.1 Health check

`app/api/health/route.ts` (8 lines) returns `{ status: "ok", ts: <ISO> }` with `dynamic = "force-dynamic"`. The middleware passes it through unauthenticated (`middleware.ts` lines 14-17). Good.

What is missing:
- The health check does not exercise the database. A real liveness probe should call `prisma.$queryRaw\`SELECT 1\`` and return non-200 if it fails. Today the endpoint will return `{ status: "ok" }` even if Postgres is down.
- No version/build-sha is returned. Trivial to add when deployment exists.

### 7.2 Audit logging

`lib/audit.ts` lines 40-58: `writeAudit(tx, { actor, action, entityType, entityId, diff?, ipAddress?, userAgent? })`. Always inside a transaction (the `tx` argument is mandatory). Redacts a denylist of sensitive field names (lines 4-18: passwordHash, password, secret, token, apiKey, accessToken, refreshToken, plus camel and snake variants).

Used by `grep -rn "writeAudit" app/api/ | wc -l` -> **38 call sites** across all mutation routes. Coverage looks complete.

What is missing or weak:
- `ipAddress` and `userAgent` are part of the `AuditPayload` interface (`lib/audit.ts` lines 35-36) but **no call site populates them**. `grep -rn "ipAddress" app/api` returns no matches. Every audit row has `ipAddress = null, userAgent = null`. The plumbing exists; nobody wires it.
- The diff shape (`{ k: { old, new } }`) is inconsistent: some routes use the actual old value (`app/api/clients/[id]/route.ts` line 72), some use `null` (`app/api/jobs/[id]/route.ts` lines 69-71), some use a mix (`app/api/jobs/[id]/transitions/route.ts` lines 100-102). The auditor reviewing the log later cannot trust the "old" value.
- There is no central enum or registry of `action` strings. They are scattered across the codebase as string literals (e.g. `"job.created"`, `"client.updated"`, `"payment.marked_paid"`). A typo here silently breaks the admin audit filter UI in `app/(portal)/admin/page.tsx`. A `const AUDIT_ACTIONS = { ... } as const` would help.

### 7.3 Logging and observability

Zero structured logging. Zero error reporting. `grep -rn "console\." app/ lib/` returns no matches. The Prisma logger is the only thing writing anything.

For the pilot this is the riskiest operational gap. The production-readiness doc acknowledges it (`docs/production-readiness.md` lines 213-219, "Not yet implemented"). Recommended primitives for P0:
- A `lib/logger.ts` that wraps `console` with `JSON.stringify({ level, ts, ... })` and includes the `requestId` if available.
- A Sentry/Highlight SDK init in `instrumentation.ts` (Next.js 15 supports this via the official integration).
- A 500 handler that calls `logger.error` with the stack trace and request context.

### 7.4 Security headers

`next.config.ts` lines 6-20 sets the standard six: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. Correct.

CSP is intentionally not set (line 5 comment): "CSP with nonces is deferred." This matches the `production-readiness.md` deferred list.

### 7.5 Time and timezone handling

`lib/time.ts` line 4: `const TZ = process.env["TZ"] ?? "Asia/Jerusalem"`. All display formatting goes through `formatInTimeZone(date, TZ, fmt)` (lines 7-19). This is the right design.

But: server-side date math is **not** TZ-aware in places that need it.
- `lib/statistics/queries.ts` line 16-22 `sinceDate(days)` uses `new Date()` and `setDate`/`setHours(0,0,0,0)` in the **server's** local timezone, not in `Asia/Jerusalem`. If the server runs in UTC (typical for containers), "last 30 days" starts at 00:00 UTC, not 00:00 Asia/Jerusalem. The off-by-three-hours is invisible for a 30-day query but real for a 7-day or daily-rollup query.
- `lib/dashboard/queries.ts` line 24-32 `startOfISOWeek()` has the same problem: it uses local time on the server, not the company timezone.

Trivial fix: import `date-fns-tz` and use `startOfDayInTimeZone` patterns. Real and worth fixing once you have a stats-of-stats consumer.

### 7.6 Database migrations

`prisma/migrations/` contains only `migration_lock.toml`. There is no actual migration directory.

This is owned by the Data Engineer per scope, so I will not critique it. The architectural implication is:
- `pnpm db:migrate:prod` (the production script in `package.json` line 18) **will do nothing** because there are no migrations to apply.
- A fresh production deployment cannot use migration-based provisioning. It would have to use `prisma db push --accept-data-loss` or hand-applied DDL. That contradicts `docs/production-readiness.md` line 101.
- Schema drift between environments is not tracked.

Flagging as architecture/operational. The fix is to run `prisma migrate dev --name init` once to create the baseline migration.

### 7.7 Feature flags

`lib/feature-flags.ts` (24 lines) reads flags from Postgres on every call. Cached on the client only via React Query staleTime. Server-side, every render of `/agent` (line 36 of `app/(portal)/agent/page.tsx`) and `/financial-documents` (line 117) hits Postgres for one flag each. Acceptable; would benefit from `unstable_cache` keyed by flag key.

The flags drive feature-flag-gated pages (agent, financial-documents) and a planned `receipt_finalize_enabled`. The `receipt_finalize_enabled` flag is referenced in `docs/production-readiness.md` but not enforced anywhere in code today because Receipts is a stub. When Receipts ships, the finalize handler must call `getFeatureFlag("receipt_finalize_enabled")` and 403 if false. This is documented; just noting it has no enforcement yet.

---

## 8. Tech debt - ranked

### High

1. **Permission scope filter for jobs is implemented inline in three places.**
   - `lib/jobs/queries.ts` lines 117-124, `app/api/search/route.ts` lines 38-46, `app/api/channels/[key]/posts/route.ts` lines 63-72.
   - Fix: extract `jobScopeFilter(user: SessionUser): Prisma.JobWhereInput` into `lib/permissions.ts` and reuse. ~30 lines of duplicated code eliminated.

2. **Two `resolveActorRelation` functions with the same name, different signatures.**
   - `lib/permissions.ts` lines 52-59 vs `lib/jobs/lifecycle.ts` lines 83-91.
   - Fix: keep the lifecycle one (which is actually used). Delete the unused permissions.ts version.

3. **No structured logging or error reporting anywhere.**
   - `grep -rn "console\." app lib` returns no matches.
   - Fix: add `lib/logger.ts` and a Sentry/Highlight SDK init in `instrumentation.ts`. P0 for any non-pilot deployment.

4. **Statistics page issues N+1 queries.**
   - `lib/statistics/queries.ts` `getEmployeeStats` lines 142-179 (3 queries per user), `getDepartmentStats` lines 194-218 (3 per dept), `getClientStats` lines 254-267 (2 per client).
   - Fix: rewrite as `prisma.job.groupBy({ by: ["assignedEmployeeId", "status"] })`. Today's data scale hides this; it will not scale to 50 employees.

5. **No migrations have been generated.**
   - `prisma/migrations/` is empty save for `migration_lock.toml`.
   - Fix: `prisma migrate dev --name init` to seed the baseline. (Data Engineer's call; flagging here because production deployment depends on it.)

### Medium

6. **`/api/*` routes are 302-redirected to `/login` when unauthenticated by middleware.**
   - `middleware.ts` lines 25-32 applies the redirect to **every** route except `/api/auth/*` and `/api/health`.
   - Fix: short-circuit `/api/*` paths to return a `NextResponse.json({ error: "Unauthorized" }, { status: 401 })` instead.

7. **`ipAddress` and `userAgent` are accepted by `writeAudit` but never populated.**
   - `lib/audit.ts` lines 35-36 declare them; `grep -rn "ipAddress" app/api/` finds zero call sites.
   - Fix: thread them through every mutation (the request is already in scope). Or, drop them from the interface.

8. **Diff shape (`{ old, new }`) is inconsistent across audit calls.**
   - Some routes pass `old: null` for true updates (`app/api/jobs/[id]/route.ts` lines 69-71). Some pass the actual old value (`app/api/clients/[id]/route.ts` line 72). Some mix.
   - Fix: standardize on the "actual old value" pattern. A `buildDiff(existing, patch, fields)` helper in `lib/audit.ts` would centralize this.

9. **Every portal page repeats `const session = await auth(); if (!session?.user) redirect("/login")`.**
   - 19 pages, ~5 lines each. The layout already guarantees a session.
   - Fix: have `app/(portal)/layout.tsx` set `SessionUser` in a server context that pages can read. Or a `getRequiredSessionUser()` helper that pages call (still a redundant cookie read but it removes the boilerplate).

10. **Audit action strings are unrelated string literals.**
    - `"job.created"`, `"client.created"`, `"payment.marked_paid"`, etc., scattered across ~38 route files.
    - Fix: a `const AUDIT_ACTIONS = { JOB_CREATED: "job.created", ... }` registry. Catches typos.

11. **No central error handler.**
    - Uncaught Prisma errors become Next.js's default 500 HTML response from a JSON-only client.
    - Fix: wrap each handler with a `withErrorHandler(fn)` HOF in `lib/api-utils.ts` that catches, logs, and returns `{ error: "Internal server error" }` JSON.

12. **Health check does not exercise the database.**
    - `app/api/health/route.ts` line 6 returns `{ status: "ok" }` regardless.
    - Fix: call `await prisma.$queryRaw\`SELECT 1\`` and return 503 if it throws.

13. **No caching of feature flags, tags, channels, departments, roles.**
    - These rarely change and are read by every authenticated page. They are tiny enough that the cost is low today.
    - Fix: `unstable_cache` keyed by the entity name, manually invalidated when the admin write happens.

14. **TZ-aware date math missing in statistics.**
    - `lib/statistics/queries.ts` `sinceDate` line 17-22 and `lib/dashboard/queries.ts` `startOfISOWeek` line 24-32 use server-local time.
    - Fix: use `date-fns-tz` to anchor on `Asia/Jerusalem`.

15. **`PATCH /api/timer/[sessionId]` dispatches by `action` in the body.**
    - `app/api/timer/[sessionId]/route.ts` lines 8-10.
    - Fix: split into three sub-routes (`/pause`, `/resume`, `/stop`) for HTTP cleanliness, or leave as-is and accept the RPC shape. Low priority.

### Low

16. **A few API responses bypass the `badRequest`/`notFound` helpers.**
    - `app/api/hub/[scope]/take/route.ts` line 19, `app/api/users/me/password/route.ts` line 32.
    - Fix: trivially replace with the helpers.

17. **Inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on the diff builders.**
    - Five route files (jobs, clients, billing, admin users, admin tags) suppress `any` for the update-payload assembly.
    - Fix: the `buildDiff` helper from item 8 removes the need.

18. **`lib/utils.ts` is a 6-line `cn(...)` wrapper.**
    - Fine as-is. Just noting it exists.

19. **Unused planned files.**
    - `lib/hebrew.ts`, `lib/money.ts`, `lib/vat.ts`, `lib/search.ts`, `lib/receipts/numbering.ts`, `lib/billing/aging.ts`, `lib/billing/burn-rate.ts` are in the plan but missing. None are blocking. Track to avoid regrowing as duplicated inline code.

20. **`app/(portal)/admin/page.tsx` mixes data-fetching, rendering, and three sub-tabs (~480 lines).**
    - This single file does five things. It is readable but unusually large.
    - Fix: split each tab into its own component file, the page becomes a router-only shell.

---

## 9. Intended-vs-actual gap (against `docs/internal-management-portal-final-plan/`)

I compared against `01-accepted-scope.md`, `02-implementation-ready-spec.md`, and `05-file-by-file-implementation-plan.md`.

### What the as-built matches

- **Route shape**: the planned `app/(auth)/` + `app/(portal)/` + `app/api/` split is exactly the layout in the repo (`05-file-by-file-implementation-plan.md` lines 73-169).
- **Auth provider choice**: NextAuth with credentials, per the spec's auth options (the spec allowed NextAuth or Lucia).
- **Permissions are centralized in `lib/permissions.ts`**, per `02-implementation-ready-spec.md` Section 4 and `05-file-by-file-implementation-plan.md` line 286.
- **Job lifecycle table** is implemented faithfully in `lib/jobs/lifecycle.ts` lines 13-60 and matches `02-implementation-ready-spec.md` Section 7.2.
- **`writeAudit(tx, ...)` always inside a transaction**, per `05-file-by-file-implementation-plan.md` line 489. Held.
- **Hub take is concurrency-safe** via `updateMany` with `status: "available"` and returns 409 on loss (`app/api/hub/[scope]/take/route.ts` lines 25-35 and `02-implementation-ready-spec.md` Section 8.2). Held.
- **Asia/Jerusalem timezone** for display, per `02-implementation-ready-spec.md` general intent. Held in `lib/time.ts` line 4.
- **Feature-flag-gated modules** (agent, financial-documents, receipts) match `02-implementation-ready-spec.md` Section 6.10-6.15.
- **No server actions, all REST**, picking "one style" per `05-file-by-file-implementation-plan.md` line 173. Held.

### What is built differently

- **Routes for receipts and saved views are missing.** The plan calls for `app/(portal)/receipts/new/page.tsx`, `app/(portal)/receipts/[id]/page.tsx`, `app/api/receipts/route.ts`, `app/api/receipts/[id]/finalize/route.ts`, and `app/api/saved-views/route.ts` (`05-file-by-file-implementation-plan.md` lines 114-117, 154-156, 160-161). Receipts is intentionally deferred (compliance hold; `current-implementation-audit.md` line 22). Saved views are deferred (mentioned in every phase audit as "deferred").
- **Routes for `mark-paid` and `billing/monthly-items`, `hourly-banks`, `one-time-charges` are nested under `clients/[id]/` instead of flat under `billing/`.** Plan was `app/api/billing/payments/[id]/mark-paid/route.ts` (line 149). Actual: mark-paid is folded into `PATCH /api/billing/payments/[id]`. This is a sensible REST-ification (PATCH on the resource instead of a sub-action). Worth keeping.
- **`lib/middleware/` directory does not exist.** The plan put rate-limiting and security headers under `lib/middleware/` (lines 310-312). They were moved to `lib/rate-limit.ts` and `next.config.ts`. Fine.
- **`lib/validators/zod-schemas.ts` is missing.** Schemas are inline in each route. See Section 3.2.
- **No `loading.tsx`** at the root or per-route. The plan called for one at the root (`05-file-by-file-implementation-plan.md` line 80). Skeletons are done component-locally instead. Low impact.
- **Email-to-job uses `source: "email_manual"` and is a manual form.** Aligns with `current-implementation-audit.md` line 54. The plan was vague here.

### What is documented as deferred and is actually deferred

- Receipts Phase 7 - stub page only. Match.
- Financial Documents ingestion - placeholder. Match.
- Agent Control Center - placeholder. Match.
- Saved views - schema present, no UI. Match.
- Attachments - schema present, no upload infra. Match.
- CSV export on statistics - missing. Match.
- DB-backed SLA defaults - hardcoded in `lib/sla.ts`. Match.
- CompanySettings table - placeholder in admin UI. Match.

### What is built but not in the plan

- A consolidated `GET /api/search` is in the plan (line 162); the implementation correctly does permission-filtered search for jobs and posts. Good.
- A timer system (`/api/timer`, `/api/timer/[sessionId]`, `TimerBar` component) - this is implied by the spec's "Time tracking" mentions but not listed in the file-by-file. The implementation is reasonable.

---

## 10. Recommendations

### P0 (must fix before pilot)

1. **Generate the baseline Prisma migration.** Run `prisma migrate dev --name init` so `pnpm db:migrate:prod` is meaningful in production. Without this, the deploy story is `prisma db push` which is not safe. (Data Engineer leads; raise to PM.)
2. **Make `/api/health` actually check the database.** Today it lies about liveness if Postgres is down. One `prisma.$queryRaw\`SELECT 1\`` call.
3. **Wire structured logging and error reporting.** Add `lib/logger.ts` and either Sentry or a self-hosted equivalent. Without this, the first production incident will be invisible.
4. **Rate-limit the NextAuth login endpoint.** Either by adding a reverse proxy rule (documented in `production-readiness.md` line 158) or wrapping the NextAuth handler. Required before any external exposure.
5. **Decide on the `/api/*` 302-vs-401 behavior.** Today the middleware redirects unauthenticated API calls to HTML. Make it return JSON 401.

### P1 (short-term, within first hardening pass after pilot)

6. **Extract `jobScopeFilter(user) -> Prisma.JobWhereInput` into `lib/permissions.ts`.** Replace the three duplicated inline filters.
7. **Delete the unused `resolveActorRelation` in `lib/permissions.ts`.** Or rename and use it; pick one.
8. **Replace N+1 statistics queries with `groupBy` aggregations.** `lib/statistics/queries.ts` `getEmployeeStats`, `getDepartmentStats`, `getClientStats`.
9. **Wire `ipAddress` / `userAgent` into `writeAudit` call sites.** Otherwise drop them from the interface.
10. **Standardize the diff shape with a `buildDiff(existing, patch)` helper.** Removes the inconsistency between routes.
11. **Add `unstable_cache` for tags, feature flags, channels, departments, roles.** These rarely change and are read everywhere.
12. **Use `date-fns-tz` for server-side date math in stats and dashboard queries.** Anchor on `Asia/Jerusalem`.

### P2 (strategic, after first scale event)

13. **Extract `lib/jobs/create.ts` and `lib/jobs/transition.ts`** so the create-job and status-transition logic is callable from sources other than the HTTP handler (planned agent, possible server actions, possible CLI). This is the single biggest extensibility win.
14. **Introduce a thin service layer for billing**, since billing has the most write paths and they will eventually need to compose (e.g., "create payment + link to receipt + update billing item"). Today it works because each endpoint is independent.
15. **Add a central `AUDIT_ACTIONS` registry** to prevent action-string typos that silently break the admin audit filter UI.
16. **Replace the in-memory rate-limiter with Redis (Upstash)** when running multi-instance.
17. **Implement CSP with nonce injection** before public exposure.
18. **Move communication channel visibility check from "read all channels and filter in JS" to a `Prisma.CommunicationChannelWhereInput` builder.** Same idea as the job scope filter, lower priority because the channel count is small.
19. **Split `app/(portal)/admin/page.tsx`** (~480 lines, six tabs) into one component per tab.
20. **Decide whether server actions are coming.** If yes, central Zod schemas in `lib/validators/` start pulling weight; the inline schemas have to move. If no, document the "REST-only" decision in `docs/` and stick with it.

---

## Handoff to PM

The architecture is sound and the API layer is unusually consistent for an MVP - every mutation goes auth, role-check, Zod, transaction, audit, with the same status-code discipline across 38 routes. The three real architectural risks are: (1) no Prisma migrations have been generated, so the documented production deploy script `prisma migrate deploy` is currently a no-op and will not produce a reproducible schema; (2) there is zero structured logging or error reporting, so the first production incident will be invisible until someone notices the UI is broken; and (3) statistics and dashboard queries fan out into N+1 patterns (3 Prisma queries per employee, per department, per client) that hide today behind tiny seed data but will become the slowest pages in the app at 50 employees. All three are addressable with focused work in days, not weeks, and none reflect a bad design choice - just deferred operational plumbing.
