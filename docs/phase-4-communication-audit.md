# Phase 4 Communication — Audit Report

Date: 2026-05-15  
Auditor: codebase review + validation commands (this session)

---

## 1. Phase 4 completion verdict

**Verdict: Complete for committed MVP scope. Safe to start Phase 5.**

Core communication flows are implemented end-to-end: channels, posts, replies, permissions at the API layer, channel/post pages, tags on posts, resolved/pinned toggles, and channel-level search. Deferred items (attachments, related-client UI, header post search UI, notifications) are documented and do not block Clients (Phase 5).

Against `docs/internal-management-portal-final-plan/04-mvp-build-plan.md` section 2.4, the build is **partial relative to the full MVP spec** but **aligned with what implementation notes claim was in scope** for this pass.

---

## 2. Implemented communication features

| Requirement | Status | Evidence |
|---|---|---|
| Landing `/communication` (not stub) | Done | `app/(portal)/communication/page.tsx` — channel cards, post counts |
| Visible channels (Global + dept rules) | Done | `listVisibleChannels` + `canPostInChannel` in `lib/communication/queries.ts` |
| Channel page `/communication/[channel]` | Done | Name, description, post list, compose, search, resolved filter, empty state |
| Post creation | Done | `POST /api/channels/[key]/posts` — title, body, optional tags, optional `relatedJobId`; audit `communication_post.created` |
| Post detail | Done | `/communication/[channel]/[postId]` — title, body, author, time, tags, replies, reply form |
| Replies | Done | `POST .../replies` — body, author, timestamp; audit `communication_reply.created` |
| Resolved / pinned | Done | `PATCH .../posts/[id]` + `PostActions` UI |
| Tags on posts | Done | Compose tag chips; `PostTag`; display via `JobTagChips` |
| API routes | Done | `GET /api/channels`, channel posts GET/POST, post GET/PATCH, replies POST |
| Server-side permissions | Done | All routes use `getChannelOrNull` / `canPostInChannel` |
| Channel search | Done | GET `search` query param on posts list; channel page form |
| RTL on user content | Done | `dir="auto"` on post/reply body |
| Unit tests for `canPostInChannel` | Done | `tests/unit/permissions.test.ts` |

---

## 3. Missing or partial communication features

| Item | Severity | Notes |
|---|---|---|
| Recent posts on landing | Low | Landing shows **post counts only**, not recent post previews ("if practical" — not done). |
| Attachments | Deferred | Schema has `PostAttachment` / `ReplyAttachment`; no upload UI or API. |
| Related client on posts | Deferred | Schema field exists; no UI (clients module is Phase 5). |
| Related job on create form | Partial | API accepts `relatedJobId`; compose form does not expose picker. Display on detail if set. |
| Header global search — posts | **Done (cleanup pass)** | `GlobalSearch` now uses `scope=all`, shows jobs and posts in labeled sections; stale footer removed. |
| Postgres full-text | Deferred | ilike on title/body; documented as acceptable for MVP. |
| Notifications | Out of MVP | Per build plan section 3. |
| Communication API/route tests | Gap | No dedicated unit or e2e tests for channel/post/reply routes. |
| `relatedJobId` permission check | **Done (cleanup pass)** | POST now validates job exists and poster can read it before creating the post. |
| Post detail `onClick` on server `Link` | **Done (cleanup pass)** | `onClick` removed from related-job Link in post detail page. |
| Loading states on compose | Partial | `useTransition` pending on buttons; no skeleton on channel list (SSR, acceptable). |
| Channel descriptions in UI | Partial | Shown when `channel.description` is set; seed may leave null. |

---

## 4. Permission / security review

**Model (`lib/permissions.ts` — `canPostInChannel`):**
- Admin: all channels.
- Global channel (`departmentKey === null`): all authenticated users.
- Department channel: only matching `user.departmentKey`.

**Enforcement:**
- Pages: `getChannelOrNull` → `notFound()` for invalid key or unauthorized user (404, not 403).
- APIs: same pattern; POST also returns `403` with message if `canPostInChannel` fails after channel load (redundant but safe).
- Replies: gated via channel access on parent post.
- PATCH resolved: author or admin. PATCH pinned: admin only.

**Gaps:**
- Unauthorized channel access returns **404** (information hiding is OK; not 403).
- No automated tests proving cross-department POST is rejected (only unit tests on `canPostInChannel`).

**Verdict:** Acceptable for internal MVP pilot. `relatedJobId` permission check was added in the Phase 3–5 cleanup pass.

---

## 5. UX / UI review

**Usable (not placeholder):** Landing grid, channel post cards, collapsible compose, reply form, empty states via `EmptyState`, mobile-friendly grid (`sm:grid-cols-2`), max-width on post detail.

**Consistent with portal:** Border cards, muted metadata, shared chips/buttons/inputs.

**Gaps:** Compose errors shown inline (good); channel search is full page reload (native GET form — fine). GlobalSearch and post results in header were wired in the Phase 3–5 cleanup pass.

**RTL:** `dir="auto"` on post/reply body; layout uses logical `start`/`end` in several components (portal-wide pattern).

---

## 6. Search integration review

| Surface | Jobs | Posts |
|---|---|---|
| `GET /api/search?scope=jobs` | Yes | N/A |
| `GET /api/search?scope=posts` | N/A | Yes, channel-scoped via `canPostInChannel` |
| `GET /api/search?scope=all` | Yes | Yes |
| Header `GlobalSearch` | Yes | Yes — `scope=all`, labeled sections (cleanup pass) |
| Channel page search | N/A | Yes (server-side filter on list) |

**Jobs search regression:** Unchanged path when `scope=jobs` (default). Typecheck/lint/test pass.

**Documentation:** GlobalSearch now uses `scope=all`; both jobs and posts appear. Implementation notes updated in Phase 3–5 cleanup pass.

---

## 7. Validation results (audit run)

| Command | Result |
|---|---|
| `pnpm typecheck` | Pass — 0 errors |
| `pnpm lint` | Pass — 0 warnings, 0 errors |
| `pnpm test` | Pass — 56/56 |
| `prisma migrate status` | Up to date — 1 migration, no Phase 4 schema changes |

---

## 8. Is Phase 5 safe to start?

**Yes.**

Phase 4 does not block Client CRUD: communication uses its own tables; client stub page is independent. Known gaps are documented deferrals or small follow-ups, not structural blockers.

---

## 9. Recommended next prompt for Phase 5

```
Follow the token-efficiency rules in .claude/CLAUDE.md and .claude/rules.md.

Implement Phase 5: Clients only.

Read before starting:
- docs/phase-4-communication-audit.md
- docs/internal-management-portal-implementation-notes.md
- docs/internal-management-portal-final-plan/04-mvp-build-plan.md (section 2.5)
- prisma/schema.prisma (Client, BillingAccount, ClientEnvironmentNote)
- existing lib/permissions.ts and lib/audit.ts patterns

Do not implement Billing, Receipts, Statistics, or full Admin Panel in this pass.
Do not modify prisma/schema.prisma unless absolutely necessary.
Preserve Phases 0–4 functionality.

Build:
1. GET/POST /api/clients and GET/PATCH /api/clients/[id] (admin-only mutations, permission-filtered list).
2. Auto-create BillingAccount on client create.
3. Replace /clients stub with client list (search, status filter).
4. Client detail page with tabs: Overview, Jobs (link existing jobs), Billing/Receipts/Environment stubs or read-only placeholders.
5. ClientEnvironmentNote CRUD per section on Environment tab.
6. Audit log on client mutations.

After: pnpm typecheck, pnpm lint, pnpm test; update implementation notes and current-implementation-audit.md.
```

Phase 4 follow-ups completed in Phase 3–5 cleanup pass: GlobalSearch wired to `scope=all`, stale footer removed, `relatedJobId` validated on post create, `onClick` removed from server post detail Link.
