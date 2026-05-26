# Knowledge System UX Plan

Date: 2026-05-27
Author: Senior Product Designer + Senior Frontend Engineer
Scope: redesign of `/knowledge`, new `/knowledge/review`, task-to-knowledge
funnel from `/my-jobs/[id]`, external-reference funnel, and the supporting
component, i18n, and a11y work. Read-only; no code changed in this pass.

References used while drafting:

- Knowledge code: `app/(portal)/knowledge/page.tsx`,
  `app/(portal)/knowledge/new/page.tsx`,
  `app/(portal)/knowledge/[slug]/page.tsx`,
  `app/(portal)/knowledge/[slug]/edit/page.tsx`.
- Knowledge components: `components/knowledge/ArticleCard.tsx`,
  `components/knowledge/ArticleEditor.tsx`,
  `components/knowledge/ArticleTagPicker.tsx`.
- Shared primitives: `components/shared/PageHeader.tsx`,
  `components/shared/EmptyState.tsx`,
  `components/shared/SectionCard.tsx`,
  `components/shared/KpiCard.tsx`,
  `components/shared/StatusDot.tsx`.
- UI primitives: `components/ui/{badge,button,card,confirm-dialog,dialog,
  dropdown-menu,input,label,separator,skeleton,textarea,toast,tooltip}.tsx`.
- Jobs surface that gains the new affordance: `app/(portal)/my-jobs/[id]/page.tsx`,
  `components/jobs/MarkDoneSheet.tsx`,
  `components/jobs/JobTransitionButtons.tsx`.
- Layout: `components/layout/Sidebar.tsx`, `components/layout/Header.tsx`.
- Established UX conventions: `docs/audit-2026-05/frontend_ux_audit.md`,
  `docs/audit-2026-05-billing/ux_product_audit.md`.
- i18n shape: `lib/i18n/en.json` (lines 2-33, 735-773),
  `lib/i18n/he.json` (mirror).

---

## 1. Page inventory after the redesign

Routes are namespaced under `/knowledge`. Everything stays behind the
`knowledge_articles_enabled` feature flag, matching the current gate in
`app/(portal)/knowledge/page.tsx:39-40`. New routes follow the same gate.

| Route | Auth gate | One-line goal |
|---|---|---|
| `/knowledge` | logged-in | Unified list. Filterable. Default view: Published, last 90 days, all kinds. |
| `/knowledge/[slug]` | logged-in (admin can view all statuses) | Read an article. Hero + body + sidebar metadata + actions. |
| `/knowledge/[slug]/edit` | author or admin | Edit a draft, request review, or update a published article (creates a new revision pending review). |
| `/knowledge/new` | any user with `knowledge.write` permission | Direct-add funnel. Choose article kind, then a kind-specific form. Saves as `draft` and offers AI structuring. |
| `/knowledge/new/external` | any user with `knowledge.write` permission | External-reference fast path. URL + minimal metadata. Routed to draft. |
| `/knowledge/review` | reviewers + admins | Inbox-style queue of `pending_review` and `ai_structured` items. |
| `/knowledge/review/[slug]` | reviewers + admins | One article in the review queue with revision diff and decision controls. |
| `/knowledge/[slug]/ai` | author or admin | Side-by-side AI structuring preview for a draft. Accept or reject per section. |
| `/knowledge/[slug]/revisions` | author or admin | Linear list of past revisions. Click one to view a diff against current. |
| `/knowledge/tags/[key]` | logged-in | Filtered list scoped to a single tag. Same shell as `/knowledge`. |
| `/knowledge/me` | logged-in | "My contributions" - shortcut filter, no new layout. Renders the unified list with `author=me` preselected. |

Two routes are removed from the public surface but still exist as redirects:

- `POST` to `/knowledge/new` still works, but the route renders the kind-picker first instead of the current `ArticleEditor mode="create"` form.
- `GET /knowledge/[slug]/edit` redirects employees who are not the author to `/knowledge/[slug]` with a toast: "You can request changes from the article page."

---

## 2. Information architecture

### 2.1 Sidebar entries

Today's sidebar puts `/knowledge` inside the Communication group
(`components/layout/Sidebar.tsx:55-60`). That stays as the primary entry
point - Knowledge is closer to internal communication than to billing or
to operational job lists. We add one nested item visible only to users
with the reviewer permission (defined in the security audit deliverable).

```
nav.groupCommunication
+- nav.channels               -> /communication
+- nav.knowledge              -> /knowledge
   +- nav.knowledgeReview     -> /knowledge/review     (reviewer-only,
                                                       with red dot when
                                                       queue > 0)
```

`StatusDot` (tone=`info`, pulse=true) sits to the right of the
"Knowledge review" label whenever the reviewer has at least one item in
their queue. Same pattern as `NotificationBell` indicator in
`components/notifications/NotificationBell.tsx`.

### 2.2 Breadcrumbs

The portal does not have a global breadcrumb today. We do not introduce
one. Instead, each detail page renders an in-page back link, matching
`/my-jobs/[id]:71-77` ("Back to My Jobs"). Patterns:

- `/knowledge/[slug]` shows: `<- Back to Knowledge` or
  `<- Back to <tag>` if the user came from `/knowledge/tags/[key]`,
  determined by a `?from=` query param like jobs already use
  (see `FROM_LABELS` in `app/(portal)/my-jobs/[id]/page.tsx:24-35`).
- `/knowledge/review/[slug]` shows: `<- Back to review queue`.
- `/knowledge/new/external` shows: `<- Back to Knowledge`.

### 2.3 Where Knowledge sits next to other surfaces

```
Sidebar (post-sprint)
+-- Overview
|   +-- Dashboard
|
+-- Work
|   +-- My Jobs           <-- task-to-knowledge starts here
|   +-- Task Hub
|   +-- Department
|   +-- Global Jobs
|
+-- Communication
|   +-- Channels
|   +-- Knowledge         <-- destination of both funnels
|       +-- Review queue  (reviewer)
|
+-- Clients & Billing (admin)
+-- Admin
+-- System
```

Three surfaces interact with Knowledge content:

1. **GlobalSearch** (`components/layout/GlobalSearch.tsx`) - already
   knowledge-aware via the `knowledgeEnabled` prop in `Header.tsx:31`.
   Results from Knowledge are tagged with the article's kind chip in
   the dropdown. No new route.
2. **Jobs detail** - new "Create knowledge article from this job"
   affordance. See section 3.
3. **Communication channels** - out of scope this sprint, but a
   `kind=internal_task_lesson` article can link back to a post via
   the existing `relatedClient` field shape (we extend it; see the
   schema deliverable). The UX is: a small "Knowledge" pill in the
   meta row of a post, linking to the article.

The "knowledge near search near jobs" triangle is the IA. Search is
the discovery surface, Knowledge is the home, Jobs is the most common
source.

---

## 3. Task-to-knowledge entry point

### 3.1 Placement decision

Two surfaces gain the affordance. Each has a different intent:

| Surface | Trigger | Intent |
|---|---|---|
| `MarkDoneSheet` | Optional checkbox at the bottom of the mark-done form: "Save this as a knowledge note" | Capture while the work is fresh, before the assignee context-switches. Pre-fills the article body from the work-report summary. |
| `/my-jobs/[id]` (reviewed jobs only) | Button "Create knowledge article from this job" in the Actions section | Curate after admin review. Lets the assignee or admin promote a useful lesson without depending on whether the checkbox was ticked at done time. |

The mark-done checkbox is the **opportunistic** path. The reviewed-job
button is the **deliberate** path. Both land on the same draft form,
just with different defaults.

### 3.2 MarkDoneSheet click path

`components/jobs/MarkDoneSheet.tsx` gains a single checkbox under the
"Billable" row:

```
[ ] knowledge.markDone.saveAsArticle
    knowledge.markDone.saveAsArticleHint
```

When ticked, the form does two things on submit:

1. POSTs `/api/jobs/[id]/work-report` as it does today
   (`MarkDoneSheet.tsx:40-50`).
2. POSTs `/api/knowledge` with the draft skeleton:
   - `kind = "internal_task_lesson"`
   - `title = job.title`
   - `body = workReport.summary`
   - `relatedJobId = jobId`
   - `status = "draft"`
   - `visibility = "internal"`

After success, the sheet closes and the toast reads
"knowledge.toast.draftSavedFromJob" with a link "View draft" that
goes to `/knowledge/[newSlug]?from=my-jobs&jobId=[id]`.

Failure mode: if work-report succeeds but knowledge POST fails, the
toast shows "knowledge.toast.draftFailed" with a "Retry" action that
re-POSTs to `/api/knowledge`. The work-report itself is not rolled
back.

```
+------------------------------------------+
| Mark done                                 |
| Job title here                            |
+------------------------------------------+
| Summary *           [textarea]            |
| Time spent *        [number] -> 1h 30m    |
| [x] Billable                              |
| [x] Save this as a knowledge note         |
|     A draft article is created. You can   |
|     edit and submit it for review later.  |
|                                           |
| ( Mark done )  ( Cancel )                 |
+------------------------------------------+
```

### 3.3 `/my-jobs/[id]` click path (reviewed only)

In the Actions sidebar (the column rendered around line 165-178 of
`app/(portal)/my-jobs/[id]/page.tsx`), we add a new transition button
that only appears when `currentStatus === "reviewed"`. Implementation
note: this is a new entry in `JobTransitionButtons.tsx`, not a new
component. The button is gated by `canAct` already evaluated in that
file (line 68).

Button copy: `knowledge.fromJob.cta` = "Create knowledge article"
Icon: `BookOpen` from lucide.

```
Actions sidebar (when status = "reviewed")

[ Reopen ]   [ Cancel ]   [ + Create knowledge article ]
```

Click path:

```
1. User clicks "Create knowledge article"
2. Browser navigates to:
     /knowledge/new?from=job&jobId=<id>&kind=internal_task_lesson
3. /knowledge/new sees the prefilled params and:
     - Skips the kind picker (kind is set).
     - Renders the kind-specific editor with the job context loaded
       server-side via getJobForUser(user, jobId).
     - Pre-fills: title, body (from work report), tags (from job tags),
       relatedClient (from job.client), relatedJobId.
4. User edits, saves. Article status = "draft" or "pending_review"
   depending on which button is clicked at the bottom of the form.
5. On save, redirect to /knowledge/[slug]?from=job&jobId=<id>.
6. The article detail page shows a "Back to job" link in its meta row
   when from=job is present.
```

The button is hidden if a knowledge article already exists for this
job (lookup by `relatedJobId`). In that case the Actions sidebar
shows a `Tooltip` over a disabled link: "An article already exists
for this job" -> click goes to it.

### 3.4 Permissions

- The checkbox in MarkDoneSheet is visible to the assignee only.
  Admins use the dedicated button.
- The reviewed-only button is visible to admins and to the assignee.
- For both paths, the user needs `knowledge.write`. If they lack it,
  the affordance is hidden, not greyed out. Hiding prevents teaching
  users about a feature they cannot use.

---

## 4. External reference entry point

### 4.1 Placement

`/knowledge` gains a second action next to "Add article" in the
`PageHeader` actions slot (`app/(portal)/knowledge/page.tsx:80-90`).

```
[ + Add article ]   [ + Add external reference ]
```

The new button opens `/knowledge/new/external`. A full page, not a
modal. Reasoning: the duplicate-detection step (4.4) needs space, the
URL-fetch preview is large, and the user is about to do reading and
typing - not a quick decision.

### 4.2 Form fields (external reference)

```
+------------------------------------------+
| New external reference                    |
| Capture an article, video, or doc from    |
| outside the team that is worth saving.    |
+------------------------------------------+
| URL *               [input  full width ]  |
|   ( Validate )                            |
|                                           |
| ----- after validate, this region fills:  |
| Title *             [input pre-filled  ]  |
| Summary             [input              ] |
| Why it matters *    [textarea, 1-3 lines] |
| Tags                [ArticleTagPicker  ]  |
| Related client      [client picker, opt]  |
| Reliability tier *  ( official ) ( vendor )
|                     ( community )         |
| Verified on         [date pulled from URL,
|                      defaults to today]   |
|                                           |
| ( Save draft )  ( Request review )  ( Cancel )
+------------------------------------------+
```

Fields explained:

- **URL**: required. Stripped of UTM params before hash. We store the
  raw URL and the canonical hash separately.
- **Title**: required. Auto-fetched from `<title>` or OpenGraph if
  Phase 2 fetcher succeeds. Phase 1 leaves the field blank and the
  user types it.
- **Summary**: optional, max 400 chars (matches existing summary
  constraint in `ArticleEditor.tsx:101`).
- **Why it matters**: required. This is what differentiates a
  knowledge entry from a bookmark.
- **Reliability tier**: required radio. Options:
  `official_docs`, `vendor_blog`, `community`, `internal_curation`.
  Renders as `ReliabilityTierBadge` chips - see section 11.
- **Verified on**: defaults to today. Author can change.

### 4.3 Auto-fetch title (Phase 2 deferred)

UI design ships with the "Validate" button visible. In Phase 1 the
button only runs the duplicate check (4.4) and does not call any
external network endpoint - feature flag
`knowledge_external_autofetch_enabled` defaults off. The button label
is `knowledge.external.validate`. When the flag is on, the same
button additionally hits `/api/knowledge/external/preview?url=...`
which returns `{ title, ogImage, faviconUrl, fetchedAt }`. The preview
renders below the URL field as a card so the author can confirm
before continuing.

### 4.4 Duplicate detection by URL hash

When the author clicks Validate (or when the URL field loses focus,
debounced 400ms), the client POSTs the URL to
`/api/knowledge/external/check`. The server canonicalizes (lowercase
scheme + host, drop trailing slash, strip query params from a
configured allowlist) and SHA-256 hashes the canonical URL. If a
match exists, the response is:

```
{ duplicate: true, article: { slug, title, status, addedBy, addedAt } }
```

The form renders a yellow `SectionCard` above the title field:

```
+------------------------------------------+
| This URL already exists                   |
| An article for the same URL was added by  |
| Jeries on 2026-05-12.                     |
| ( Open that article )    ( Add anyway )   |
+------------------------------------------+
```

"Open that article" navigates to the existing slug. "Add anyway"
proceeds, but stamps `duplicateOf` on the new record so reviewers
see the relationship. We deliberately do not block; a team member
may have a stronger summary or different reliability assessment.

---

## 5. The unified `/knowledge` list

### 5.1 Layout

```
+-------------------------------------------------------------+
| PageHeader                                                   |
|   icon=BookOpen                                              |
|   title=Knowledge                                            |
|   description=Internal articles, runbooks, references...     |
|   actions= [ + Add article ] [ + Add external reference ]    |
|   meta= [search box .....................]                   |
|         [Filter: All kinds v] [Status v] [Tag v] [More v]    |
|         [chip: Published] [chip: My contributions] ...       |
+-------------------------------------------------------------+
| Toolbar row (results count + sort)                           |
|   Showing 24 of 137 articles    Sort by [Recently updated v] |
+-------------------------------------------------------------+
| Grid of ArticleCard (2 cols sm+, 1 col mobile)               |
+-------------------------------------------------------------+
| Footer: Load more (button) or pagination                     |
+-------------------------------------------------------------+
```

### 5.2 Filters

Each filter is a `DropdownMenu` opening a checkbox list. Selecting
items writes a comma-joined value to the URL query string so the
filter state is shareable and SSR-rendered.

| Filter | URL param | Options |
|---|---|---|
| Kind | `kind` | All 6 article kinds. Multi-select. |
| Status | `status` | draft, ai_structured, pending_review, approved, published, archived. Multi-select. Employees see only published+archived. |
| Tag | `tag` | All tags with `scope=knowledge`. Multi-select. |
| Author | `author` | User picker (admin only). |
| Reviewer | `reviewer` | User picker (admin only). |
| My contributions | `mine=1` | Toggle chip. |
| Needs review | `needsReview=1` | Toggle chip. Reviewer only. |
| Date range | `from`, `to` | Inline date pickers (admin only). |
| Reliability tier | `tier` | official_docs, vendor_blog, community, internal_curation. |
| Verified within | `verifiedWithin` | 30d, 90d, 365d, any. |

### 5.3 Default view

When the page loads without query params, the server applies:

- `status = published`
- `from = today - 90 days` (computed at request time, not stored)
- All other filters: unset.

Admins additionally see "View needs-review (N)" as a `KpiCard`
strip above the grid, where N is the count of items in
`pending_review` + `ai_structured`. Click goes to `/knowledge/review`.

```
+--------------------+ +--------------------+ +--------------------+
| KPI: Published     | | KPI: Drafts (mine) | | KPI: Needs review  |
|   147              | |   3                | |   12  (warn tone)  |
| this is the corpus | | next action        | | Go to queue ->     |
+--------------------+ +--------------------+ +--------------------+
```

Employees do not see the "Needs review" KPI.

### 5.4 Pagination decision

**Page-based, not infinite scroll.** Two reasons:

1. The existing `/billing` list (the closest peer in the codebase) is
   page-based and the audit notes that pattern works
   (`docs/audit-2026-05-billing/ux_product_audit.md` table at line 67).
2. Knowledge content is referenced by URL. An anchor-friendly URL
   (`?page=3`) lets users link "the second page of architecture
   decisions". Infinite scroll breaks that.

Page size: 24 (12 rows x 2 cols). Pagination control sits below the
grid: `<- Previous   Page 2 of 6   Next ->`. Add a `per_page` select
with options 24/48/96 to the right.

The current list at `app/(portal)/knowledge/page.tsx:48-54` already
imposes a `limit: 50`. We change it to `limit: 24, offset: page*24`
and add a count query for the total.

---

## 6. Article detail view

### 6.1 Layout

```
+-------------------------------------------------------------+
| <- Back to Knowledge                                         |
|                                                              |
| HERO                                                         |
|   How to recover from <vendor> migration failure             |
|   [Troubleshooting] [Approved] [Reliability: Internal]       |
|   [tag] [tag] [tag]                                          |
|   Verified: 2026-05-04 (23 days ago)                         |
|                                                              |
|   Actions row (right side on desktop):                       |
|     ( Edit )  ( Request review )  ( Archive )  ( Copy link )|
+-------------------------------------------------------------+
| Body                              | Sidebar                  |
|   Markdown / structured sections   |  Author                  |
|   Headings, code blocks, lists     |    Jeries                |
|   Inline images (Phase 2)          |  Reviewer                |
|                                    |    Sarah - approved      |
|                                    |  Source                  |
|                                    |    Job INC-2025-0314 ->  |
|                                    |  Related articles        |
|                                    |    - Article 1           |
|                                    |    - Article 2           |
|                                    |  Last verified           |
|                                    |    2026-05-04            |
|                                    |    ( Mark verified )     |
+-------------------------------------------------------------+
```

### 6.2 Hero composition

| Slot | Component | Notes |
|---|---|---|
| Title | `PageHeader title` | Existing. |
| Type chip | new `ArticleKindChip` | Six variants matching the six kinds. |
| Status chip | reuse `Badge` (`components/ui/badge.tsx`) with status text. | Visible only when status is not `published`. Hides for noise reduction once an article is the "current" version. |
| Reliability tier badge | new `ReliabilityTierBadge` | Tone differs per tier. |
| Tags | extract chip rendering from `ArticleCard.tsx:65-79` into a shared `TagChipRow` | Already styled with the tag's `colorHex`. |
| Last verified | new `VerifiedFreshnessPill` | Shows relative date + a coloured dot. Green < 90d, yellow 90-180d, red > 180d. |

The status chip placement is intentional: it stays visible after
publish only when the reviewer flags a re-review (status returns to
`pending_review`). That mid-publish state is a known reality and the
chip signals "this is the published version but a newer revision is
under review."

### 6.3 Body

Phase 1 renders a `<pre className="whitespace-pre-wrap font-sans">`
wrapper around `article.body` exactly like
`app/(portal)/knowledge/[slug]/page.tsx:82-86` does today. Phase 2
adds a Markdown renderer. Important: the renderer is server-side and
sanitises with rehype-sanitize. We do not allow inline HTML.

### 6.4 Sidebar metadata

A right-rail column on desktop (`lg:col-span-1` next to a
`lg:col-span-2` body). Items:

- **Author** with display name and role tag.
- **Reviewer** with display name and decision verb ("approved", "asked for changes", "rejected").
- **Source**:
  - For `internal_task_lesson`: link to the source Job.
  - For `external_reference`: external URL + favicon (Phase 2).
  - For others: empty.
- **Related articles**: new `RelatedArticleList`. Phase 1 reads from
  manual links the author selects in the editor. Phase 2 adds
  tag-similarity suggestions.
- **Last verified**: date + `Mark verified` button. Updates
  `lastVerifiedAt` to today. Logged in revisions.
- **Revisions**: link "X revisions" -> `/knowledge/[slug]/revisions`.

### 6.5 Actions row

Renders inside the `PageHeader actions` slot
(`PageHeader.tsx:9, 32`).

| Action | Visible to | Behaviour |
|---|---|---|
| Edit | author + admin | Goes to `/knowledge/[slug]/edit`. |
| Request review | author + admin, status in {draft, ai_structured} | POST `/api/knowledge/[slug]/transitions` with `toStatus: pending_review`. Toast confirms. |
| Archive | author + admin, status in {published, approved} | `ConfirmDialog` ("This will hide the article from non-admin users.") then POST. |
| Restore | admin, status = archived | POST -> published. |
| Copy link | everyone | Writes the URL to clipboard, toast "Copied". |
| Open AI structuring | author + admin, status in {draft} | Opens `AiStructureDialog`. See section 8. |
| Delete | admin only | Hidden behind a "more" dropdown. `ConfirmDialog` with the article title typed for confirmation. |

The actions row collapses into a `DropdownMenu` ("More") on mobile
when more than two actions are available.

---

## 7. Reviewer view

### 7.1 `/knowledge/review` - the inbox

```
+-------------------------------------------------------------+
| PageHeader                                                   |
|   icon=Inbox                                                 |
|   title=Knowledge review                                     |
|   description=Articles pending your sign-off.                |
|   meta=[ All v ] [ Mine v ] [ AI-structured v ] [search ...] |
+-------------------------------------------------------------+
| Tabs: [ Pending (12) ] [ AI-structured (4) ] [ Recent ]      |
+-------------------------------------------------------------+
| Inbox rows (one per article)                                  |
|                                                               |
|  o  [Troubleshooting] How to recover from migration failure   |
|     by Jeries -> assigned to Sarah   2h ago    diff 23 + 17 - |
|     ( Open )                                                  |
|                                                               |
|  o  [External]        Vendor SLA policy clarifications        |
|     by Maya  -> unassigned             yesterday              |
|     ( Open )                                                  |
+-------------------------------------------------------------+
```

The list uses a new `ReviewQueueRow` component. Each row shows:

- Status dot (info=pending, warn=ai_structured, danger=changes
  requested, success=approved-pending-publish).
- Type chip + title.
- Author -> assignee chain.
- Relative time since submission.
- For AI-structured items, the diff size (+lines, -lines).
- A primary "Open" button.

Tab counts come from the same query that drives the navbar dot.
Sort: oldest first by default (FIFO) to avoid queue starvation.

### 7.2 `/knowledge/review/[slug]` - decision page

Layout extends the article detail layout with:

```
+-------------------------------------------------------------+
| <- Back to review queue                                      |
| Hero                                                         |
+-------------------------------------------------------------+
| Tabs: [ Current ]  [ Diff vs published ]  [ AI vs original ] |
+-------------------------------------------------------------+
| Body region (per tab):                                       |
|   Current: full markdown                                     |
|   Diff vs published: side-by-side. Old left, new right.      |
|   AI vs original: side-by-side. Original left, AI right.     |
+-------------------------------------------------------------+
| Decision footer (sticky)                                     |
|   Comment (required for request-changes/reject) [textarea]   |
|   ( Approve )  ( Request changes )  ( Reject )  ( Skip )     |
+-------------------------------------------------------------+
```

### 7.3 Decision actions

Each button is a different POST to
`/api/knowledge/[slug]/transitions`:

- **Approve**: `toStatus: approved`. The article auto-publishes if
  the author had selected "publish on approval" - that flag is on
  the article record. Otherwise stays `approved` and the author
  must click Publish from the article detail.
- **Request changes**: `toStatus: draft`, comment required. The
  author gets a notification (existing `NotificationBell` system).
  The article reappears in `Drafts (mine)` for the author.
- **Reject**: `toStatus: archived`, comment required. Notification
  to the author. Reviewer can later restore.
- **Skip**: closes the page and returns to the queue without
  recording a decision. Used when the reviewer cannot make a call -
  e.g. waiting for a domain expert.

The decision footer is sticky on desktop. On mobile it collapses
into a single "Decide" button that opens a `Dialog`
(`components/ui/dialog.tsx`) with the same controls.

### 7.4 Diff format

We do not write a custom diff engine. Use the existing
`diff` npm package (already in `package.json` per most Next.js
projects - if not, declared in the implementation deliverable). The
diff is line-based with word-level highlights for changed lines.

Phase 1: server renders the diff as HTML and ships it. Phase 2: a
client-side `<ReviewDiffViewer>` allows collapsing unchanged blocks
and copying snippets.

---

## 8. AI structuring opt-in

### 8.1 Entry

On `/knowledge/[slug]` when `status = draft`, an extra action button
appears: "Let the assistant structure this". Icon: `Sparkles` from
lucide. Tooltip: "Reformats your draft into the standard sections
for this article kind. You decide what to keep."

Click opens `AiStructureDialog`. Phase 1 implementation: a modal
preview. Phase 2: a full-page side-by-side as in section 8.3.

### 8.2 Flow

```
1. User clicks "Let the assistant structure this".
2. Confirm dialog: "This sends the draft text to the assistant.
   You can cancel any time. Continue?"  [ Cancel ] [ Continue ]
3. Loading state with skeleton sections.
4. The response arrives. Modal grows to side-by-side view.
5. Each AI-suggested section is rendered with three controls:
       Original (read-only)  |  Suggested  | (Accept) (Reject)
6. User accepts/rejects per section.
7. ( Apply )  saves the accepted sections to the article body.
   Status flips to `ai_structured`.
8. After save the user can either submit for review or keep iterating.
```

### 8.3 Side-by-side layout (Phase 2)

```
+--------------------------------+--------------------------------+
| Original                        | Assistant suggestion           |
+--------------------------------+--------------------------------+
| ## Problem                      | ## Symptom                     |
| The DB was down.                | The database became            |
|                                 | unreachable to all clients,    |
|                                 | starting at 14:02 IST.         |
|                                 |   ( Accept ) ( Reject )        |
+--------------------------------+--------------------------------+
| ## What I did                   | ## Investigation               |
| ...                             | ...                            |
|                                 |   ( Accept ) ( Reject )        |
+--------------------------------+--------------------------------+
```

The "Accept" toggle highlights the suggested section in green and
queues it for save. "Reject" hides the suggestion. A footer counter
shows "3 of 5 sections accepted - Apply will replace those sections."

### 8.4 Audit trail

Every AI structuring run produces a `KnowledgeRevision` with:

- `kind = ai_structured`
- `model = "claude-opus-4-7"` (or whichever model used)
- `acceptedSections = [...]`
- `rejectedSections = [...]`
- `costCents = ...` (from the LLM provider response)

Reviewers see the revision when they open the article. The UI
distinguishes AI-introduced content from author-edited content via
a small `Sparkles` icon next to the section heading.

---

## 9. Mobile considerations

The reader is the priority. Editor is desktop-only at MVP.

### 9.1 Reader (mobile)

- Hero stacks: title, then chip row (wraps), then tags (wraps),
  then meta line.
- Body sits in a single column with `prose-sm` Tailwind sizing.
- Sidebar metadata becomes a collapsible disclosure under the body.
  Default closed. Tap to expand.
- Actions row becomes one primary action + a `...` dropdown.
- "Mark verified" button stays visible because freshness is a
  high-value signal even on phones.

### 9.2 Editor (mobile)

`ArticleEditor` is not usable on phones today
(`components/knowledge/ArticleEditor.tsx`). We keep that limitation
and show a banner on mobile:

```
+------------------------------------------+
| Editing on mobile is limited.             |
| Save the draft and continue on desktop.   |
+------------------------------------------+
```

Only the title and summary fields are editable on mobile. The body
field shows the existing content read-only with a `disabled`
textarea. Save and Request-review are available.

### 9.3 Review queue (mobile)

The inbox renders as a single column. Decision page collapses tabs
into a `DropdownMenu`. The sticky decision footer becomes a single
"Decide" button as noted in 7.3.

### 9.4 New article flows

- `/knowledge/new` kind-picker renders as a vertical list on mobile
  with each kind as a tappable card.
- `/knowledge/new/external` works because the form is short.

### 9.5 RTL on mobile

All inline images, code blocks, and external preview cards must
honour `dir`. Verified during component implementation - any
hardcoded `text-right` / `text-left` is a bug.

---

## 10. Empty, error, and loading states

Pattern source: `components/shared/EmptyState.tsx` and the existing
patterns documented in `frontend_ux_audit.md` section 5.

### 10.1 Loading skeletons

Each page gets an `app/(portal)/knowledge/[...]/loading.tsx`.

| Route | Skeleton |
|---|---|
| `/knowledge` | KPI strip (3 rectangles), filter bar (skeleton chips), 6 `ArticleCard`-shaped boxes in a 2-col grid. |
| `/knowledge/[slug]` | Hero block (title bar + chip row), 8 lines of body skeleton, sidebar skeleton with 4 rows. |
| `/knowledge/new` | Form skeleton: 6 field rows of varying widths. |
| `/knowledge/new/external` | URL input + validate button + 5 form rows. |
| `/knowledge/review` | List skeleton: 8 inbox rows. |
| `/knowledge/review/[slug]` | Same as detail + tab bar skeleton + decision footer skeleton. |

Skeleton uses `components/ui/skeleton.tsx` (already imported in
`HubView.tsx`).

### 10.2 Empty states

| Surface | Title | Description |
|---|---|---|
| `/knowledge` (no articles in tenant) | `knowledge.empty.title` "No articles yet." | "Create the first article or import an external reference." action: two buttons. |
| `/knowledge` (filtered to zero) | `knowledge.emptyFiltered.title` "No articles match your filters." | "Clear filters or change the search term." action: "Clear filters". |
| `/knowledge/me` (zero) | `knowledge.emptyMine.title` "You have not contributed yet." | "Start a draft, or capture a note when you mark a job done." |
| `/knowledge/review` (empty queue) | `knowledge.emptyQueue.title` "Inbox zero." | "Nothing waits for your review right now." |
| Article detail when archived for non-admin | `knowledge.archived.title` "This article was archived." | Shown as a banner above the (still readable) body. Admin sees a "Restore" button. |
| Related articles list empty | inline text: `knowledge.relatedEmpty` "No related articles linked yet." | Author can click "Link related". |

### 10.3 Error states

- Per-route `app/(portal)/knowledge/[...]/error.tsx` so errors do
  not bubble to portal-level. Each one offers a Reset and a "Go to
  Knowledge" link.
- Form failures (network, validation) render inline below the
  affected field via the existing pattern at
  `ArticleEditor.tsx:143`. Toasts are not used for inline form
  errors.
- Toast (`components/ui/toast.tsx`) used for **cross-page** outcomes
  only: "Draft saved", "Review requested", "Article published",
  "Article archived", "Article restored", "Verified updated",
  "Article approved", "Changes requested", "AI structuring applied",
  "Copied link".
- Duplicate detection on external reference renders the yellow
  `SectionCard` block from section 4.4 - no toast, because the user
  has to decide.

---

## 11. Component reuse

### 11.1 Existing primitives we reuse

| Component | File | Role in Knowledge |
|---|---|---|
| `PageHeader` | `components/shared/PageHeader.tsx` | Every page header. |
| `KpiCard` | `components/shared/KpiCard.tsx` | Three KPIs above the unified list. |
| `SectionCard` | `components/shared/SectionCard.tsx` | Sidebar groupings on the detail page. |
| `EmptyState` | `components/shared/EmptyState.tsx` | Every empty state in section 10. |
| `StatusDot` | `components/shared/StatusDot.tsx` | Inbox row status dot. |
| `Badge` | `components/ui/badge.tsx` | Status chip on detail. |
| `Button` | `components/ui/button.tsx` | All actions. |
| `Dialog` | `components/ui/dialog.tsx` | `AiStructureDialog`, mobile review decision, "Are you sure" prompts. |
| `ConfirmDialog` | `components/ui/confirm-dialog.tsx` | Archive, delete, restore. |
| `DropdownMenu` | `components/ui/dropdown-menu.tsx` | Filter dropdowns, "More" overflow. |
| `Tooltip` | `components/ui/tooltip.tsx` | Hover hints on chips, disabled action explanations. |
| `Toaster` | derived from `components/ui/toast.tsx` | Cross-page outcomes (see 10.3). |
| `Skeleton` | `components/ui/skeleton.tsx` | All loading states. |
| `Textarea`, `Input`, `Label` | `components/ui/*` | Form fields. |
| `Separator` | `components/ui/separator.tsx` | Sidebar dividers. |
| `ArticleCard` | `components/knowledge/ArticleCard.tsx` | Grid items on `/knowledge`. Extended to render the new `ArticleKindChip` + `ReliabilityTierBadge`. |
| `ArticleTagPicker` | `components/knowledge/ArticleTagPicker.tsx` | Tag picker inside the new and edit forms. |
| `ArticleEditor` | `components/knowledge/ArticleEditor.tsx` | Refactored: split into `ArticleEditor` (shell) + `ArticleEditorBody` (text fields) + per-kind extra-field components. |
| `JobTransitionButtons` | `components/jobs/JobTransitionButtons.tsx` | Extended with the new "Create knowledge article" action on reviewed jobs. |
| `MarkDoneSheet` | `components/jobs/MarkDoneSheet.tsx` | Extended with the "Save as knowledge note" checkbox. |
| `GlobalSearch` | `components/layout/GlobalSearch.tsx` | Already knowledge-aware. We pass the kind chip into result rendering. |
| `Sidebar` | `components/layout/Sidebar.tsx` | New nested "Knowledge review" entry. |

### 11.2 Net-new components

| Component | Purpose | Where it lives |
|---|---|---|
| `ArticleKindChip` | Six-variant chip for the article kind. Maps to colour per kind. | `components/knowledge/ArticleKindChip.tsx` |
| `ReliabilityTierBadge` | Three-tier badge: `official_docs`, `vendor_blog`, `community`, `internal_curation`. Tone-coded. | `components/knowledge/ReliabilityTierBadge.tsx` |
| `VerifiedFreshnessPill` | "Verified 23 days ago" with a colour dot. | `components/knowledge/VerifiedFreshnessPill.tsx` |
| `ArticleKindPicker` | The kind-selection step on `/knowledge/new`. Cards in a 2x3 grid. | `components/knowledge/ArticleKindPicker.tsx` |
| `ExternalReferenceForm` | The full-page form for external refs. | `components/knowledge/ExternalReferenceForm.tsx` |
| `UrlDuplicateWarning` | Yellow `SectionCard` from section 4.4. | `components/knowledge/UrlDuplicateWarning.tsx` |
| `ReviewQueueRow` | One row in the inbox at `/knowledge/review`. | `components/knowledge/ReviewQueueRow.tsx` |
| `ReviewDecisionFooter` | Sticky footer with Approve/Request/Reject/Skip. | `components/knowledge/ReviewDecisionFooter.tsx` |
| `ReviewDiffViewer` | Side-by-side diff. | `components/knowledge/ReviewDiffViewer.tsx` |
| `AiStructureDialog` | Modal that runs and previews AI structuring. | `components/knowledge/AiStructureDialog.tsx` |
| `AiSectionDiff` | One row in the AI structuring side-by-side. | `components/knowledge/AiSectionDiff.tsx` |
| `RelatedArticleList` | Sidebar list of related articles with link / unlink controls. | `components/knowledge/RelatedArticleList.tsx` |
| `RelatedArticlePicker` | Modal for searching and adding related articles in the editor. | `components/knowledge/RelatedArticlePicker.tsx` |
| `RevisionTimeline` | Linear list of revisions on `/knowledge/[slug]/revisions`. | `components/knowledge/RevisionTimeline.tsx` |
| `MarkVerifiedButton` | The "Mark verified" sidebar action. | `components/knowledge/MarkVerifiedButton.tsx` |
| `CreateFromJobButton` | The new transition button for reviewed jobs. | `components/jobs/CreateFromJobButton.tsx` (kept in jobs to match where other jobs-domain affordances live). |
| `KnowledgeNoteCheckbox` | The checkbox in MarkDoneSheet. | `components/jobs/KnowledgeNoteCheckbox.tsx` (keeps the jobs surface small). |

### 11.3 Refactor: split `ArticleEditor`

Today `ArticleEditor` is one 160-line file. It needs to handle six
kinds, each with extra fields. We split it as:

```
ArticleEditor.tsx              <- top-level shell, handles save + state
ArticleEditorBody.tsx          <- title + summary + body (current code)
ArticleKindFields/
  InternalTaskLessonFields.tsx
  ExternalReferenceFields.tsx
  HowToGuideFields.tsx
  TroubleshootingNoteFields.tsx
  ArchitectureDecisionFields.tsx
  ProcessPolicyNoteFields.tsx
```

The shell decides which `ArticleKindFields/*` component to render
based on `kind`. Net change is additive: existing forms keep their
current behaviour.

---

## 12. i18n and RTL

### 12.1 Keys to add (under `knowledge.*`)

The existing keys in `lib/i18n/en.json:735-773` are the seed. We
keep them and add:

```
knowledge:
  title                      (exists)
  description                (exists)
  searchPlaceholder          (exists)
  empty:
    title                    "No articles yet."
    description              "Create the first article or capture an external reference."
  emptyFiltered:
    title                    "No articles match your filters."
    description              "Clear filters or change the search term."
  emptyMine:
    title                    "You have not contributed yet."
    description              "Start a draft, or save a knowledge note when you mark a job done."
  emptyQueue:
    title                    "Inbox zero."
    description              "Nothing waits for your review right now."
  archived:
    banner                   "This article was archived. Only admins can see it."
    restore                  "Restore"
  addArticle                 (exists)
  addExternal                "Add external reference"
  filters:
    allActive                (exists, under filter.allActive)
    kind                     "Kind"
    status                   "Status"
    tag                      "Tag"
    author                   "Author"
    reviewer                 "Reviewer"
    mine                     "My contributions"
    needsReview              "Needs review"
    tier                     "Reliability"
    verifiedWithin           "Verified within"
    clear                    "Clear filters"
  kinds:
    internal_task_lesson     "Task lesson"
    external_reference       "External reference"
    how_to_guide             "How-to"
    troubleshooting_note     "Troubleshooting"
    architecture_decision    "Architecture decision"
    process_policy_note      "Policy and process"
  status:
    draft                    (exists)
    ai_structured            "AI-structured"
    pending_review           "Pending review"
    approved                 "Approved"
    published                (exists)
    archived                 (exists)
  reliability:
    label                    "Reliability"
    official_docs            "Official"
    vendor_blog              "Vendor"
    community                "Community"
    internal_curation        "Internal"
  verified:
    label                    "Last verified"
    freshLabel               "Fresh"
    staleLabel               "Stale"
    outdatedLabel            "Outdated"
    relative                 "Verified {duration} ago"
    markVerified             "Mark verified"
    confirmTitle             "Confirm article is still accurate"
    confirmBody              "Marking as verified updates the last-verified date to today."
  fromJob:
    cta                      "Create knowledge article"
    alreadyExists            "An article already exists for this job."
    backToJob                "Back to job"
  markDone:
    saveAsArticle            "Save this as a knowledge note"
    saveAsArticleHint        "A draft article is created. You can edit and submit it for review later."
  external:
    pageTitle                "New external reference"
    pageDescription          "Capture an article, video, or doc from outside the team that is worth saving."
    url                      "URL"
    validate                 "Validate"
    title                    "Title"
    summary                  "Summary"
    whyItMatters             "Why it matters"
    verifiedOn               "Verified on"
    duplicate:
      title                  "This URL already exists"
      body                   "An article for the same URL was added by {name} on {date}."
      openExisting           "Open that article"
      addAnyway              "Add anyway"
  review:
    title                    "Knowledge review"
    description              "Articles pending your sign-off."
    tabs:
      pending                "Pending"
      ai_structured          "AI-structured"
      recent                 "Recent decisions"
    actions:
      approve                "Approve"
      requestChanges         "Request changes"
      reject                 "Reject"
      skip                   "Skip"
    comment:
      label                  "Comment"
      placeholder            "Optional for approval. Required when requesting changes or rejecting."
      required               "A comment is required for this decision."
    diff:
      vsPublished            "Diff vs published"
      vsOriginal             "Diff vs original"
      noChanges              "No changes detected."
  ai:
    cta                      "Let the assistant structure this"
    confirmTitle             "Send this draft to the assistant?"
    confirmBody              "The draft text is sent to the assistant. You can cancel any time."
    confirmCta               "Continue"
    runningTitle             "Structuring your draft..."
    runningBody              "This usually takes 10 to 30 seconds."
    sectionAccept            "Accept"
    sectionReject            "Reject"
    apply                    "Apply accepted sections"
    summary                  "{accepted} of {total} sections accepted."
  editor:
    createTitle              (exists)
    editTitle                (exists)
    title                    (exists)
    summary                  (exists)
    body                     (exists)
    titleRequired            (exists)
    bodyRequired             (exists)
    saveFailed               (exists)
    saveDraft                "Save draft"
    requestReview            "Request review"
    publishOnApproval        "Publish when approved"
    relatedJobLabel          "Related job"
    relatedClientLabel       "Related client"
    relatedArticles          "Related articles"
  toast:
    draftSavedFromJob        "Draft saved. View draft."
    draftSaved               "Draft saved."
    draftFailed              "Could not save the draft."
    reviewRequested          "Review requested."
    approved                 "Article approved."
    changesRequested         "Changes requested."
    rejected                 "Article rejected."
    archived                 "Article archived."
    restored                 "Article restored."
    published                "Article published."
    verifiedUpdated          "Last verified updated."
    linkCopied               "Link copied."
    aiApplied                "AI structuring applied."
```

### 12.2 Hebrew translations sample for most-visible labels

Article kinds:

```
internal_task_lesson    -> "תובנה מהמשימה"
external_reference      -> "מקור חיצוני"
how_to_guide            -> "מדריך"
troubleshooting_note    -> "פתרון תקלה"
architecture_decision   -> "החלטה ארכיטקטונית"
process_policy_note     -> "תהליך / מדיניות"
```

Statuses:

```
draft                   -> "טיוטה"
ai_structured           -> "מובנה על-ידי הסוכן"
pending_review          -> "ממתין לבדיקה"
approved                -> "אושר"
published               -> "פורסם"
archived                -> "בארכיון"
```

Reliability tiers:

```
official_docs           -> "תיעוד רשמי"
vendor_blog             -> "בלוג ספק"
community               -> "מקור קהילתי"
internal_curation       -> "פנימי"
```

Most-visible CTAs:

```
addArticle              -> "מאמר חדש"     (already exists)
addExternal             -> "מקור חיצוני חדש"
fromJob.cta             -> "צור מאמר ידע"
fromJob.backToJob       -> "חזרה למשימה"
review.title            -> "בדיקת מאמרים"
review.actions.approve  -> "אישור"
review.actions.requestChanges -> "בקשת תיקונים"
review.actions.reject   -> "דחייה"
ai.cta                  -> "תן לסוכן לבנות את המאמר"
verified.markVerified   -> "סמן כמאומת"
```

Empty-state titles:

```
empty.title             -> "אין עדיין מאמרים."
emptyFiltered.title     -> "אין מאמרים התואמים את הסינון."
emptyMine.title         -> "טרם תרמת מאמר."
emptyQueue.title        -> "תיבת הבדיקה ריקה."
```

### 12.3 RTL gotchas

Documented from `frontend_ux_audit.md` section 6.2:

- **Use logical Tailwind utilities only**: `ms-`, `me-`, `ps-`,
  `pe-`, `start-`, `end-`. The codebase already enforces this (237
  uses, zero `mr-`/`ml-`).
- **Avoid `text-right` and `text-left`**: use `text-start` and
  `text-end`. The audit found two violations in
  `app/(portal)/statistics/page.tsx`. New Knowledge code must not
  reintroduce them.
- **`dir="auto"`** on user-content fields: article body, summary,
  comment fields in the reviewer. Title can stay default `dir`
  because mixed-direction titles render poorly with `auto`.
- **Diff layout** in `ReviewDiffViewer` must mirror correctly. The
  "old/new" column order does not flip - "old" stays semantically
  first - but the headers swap sides under RTL because of natural
  reading order. Acceptable.
- **AI side-by-side** likewise: original and suggested do not
  swap roles, only visual order.
- **Date formatting**: use the existing `formatTz` and `formatDate`
  helpers from `lib/time.ts`. They already use `Asia/Jerusalem`.
  Do not use `toLocaleDateString("en-GB")` (multiple violations in
  the codebase per the audit).
- **External URL rendering**: external references show URLs. URLs
  are LTR even under `dir="rtl"`. Wrap them in
  `<span dir="ltr">` to prevent mirror display.
- **Number-prefixed labels**: "23 days ago" reads naturally in
  English, but Hebrew prefers "לפני 23 ימים". The translation file
  uses placeholder substitution (`{duration}` etc.), so localisation
  can re-order.

---

## 13. Accessibility

Reference: WCAG 2.1 AA target. The portal does not currently meet
this fully (audit section 7 notes missing focus traps in dialogs).
The Knowledge sprint cannot fix the rest of the portal, but it
ships clean for its own surfaces.

### 13.1 Keyboard navigation

- Every interactive element reachable via `Tab`. Tab order matches
  visual order. No `tabindex="-1"` on interactive elements except
  the close-X in dialogs (which uses Radix's built-in handling).
- Article cards on `/knowledge`: the entire card is a single `Link`
  (current behaviour in `ArticleCard.tsx:29`), which means Enter
  navigates. Good.
- Filter dropdowns: native keyboard support comes from
  `DropdownMenu` (Radix).
- Review decision footer: `Approve` is the default focus when the
  page loads. `Esc` exits the page back to the queue.
- AI structuring dialog: focus moves to the first "Accept" button.
  Tab cycles through accept/reject pairs. `Esc` closes without
  applying.

### 13.2 Screen reader hints

- `PageHeader` already renders the title in an `<h1>` and the
  description in a `<p>`. Good.
- Article kind chip needs an `aria-label` because the chip text is
  short. Example: `aria-label="Article kind: Troubleshooting"`.
- Status chip same: `aria-label="Status: Pending review"`.
- Reliability tier badge same.
- `VerifiedFreshnessPill` is decorative on its own; the textual
  date below provides the semantic. We mark the coloured dot as
  `aria-hidden="true"` and let the date carry meaning.
- `ReviewQueueRow` is a list item inside a `<ul role="list">`. The
  diff size indicator gets `aria-label="23 lines added, 17 lines
  removed"`.
- `RelatedArticleList` is also a `<ul>`.
- AI structuring side-by-side: each section row is a `<section>`
  with a heading. Accept/Reject buttons get
  `aria-label="Accept section 3: Investigation"`.
- The duplicate URL warning is a `role="alert"` so it is
  announced when it appears.
- Toast `role="status"` (success) or `role="alert"` (error). The
  existing `components/ui/toast.tsx` handles this.

### 13.3 Color contrast

The hardest cases are the type and reliability chips. Recommended
mapping. Background uses `bg-{token}-soft` (paired tints already
in `app/globals.css`), text uses `text-{token}`. WCAG AA passes
where the soft background has > 4.5:1 contrast against the chip
text.

| Token | Light bg | Dark bg | Pass on light | Pass on dark |
|---|---|---|---|---|
| brand-soft + brand | yes | yes | AA | AA |
| warn-soft + warn | yes | yes | AA | AA |
| danger-soft + danger | yes | yes | AA | AA |
| success-soft + success | yes | yes | AA | AA |
| muted + foreground | yes | yes | AA | AA |

Article kind palette (proposed):

```
internal_task_lesson    -> brand
external_reference      -> info (slate-500)
how_to_guide            -> success
troubleshooting_note    -> warn
architecture_decision   -> indigo (custom, must validate contrast)
process_policy_note     -> muted
```

Reliability tier palette:

```
official_docs           -> success
vendor_blog             -> brand
community               -> muted
internal_curation       -> warn-soft (low-saturation)
```

Anything that does not pass goes back to designers before
implementation. We do not ship a chip without measured contrast.

### 13.4 Focus management in modal reviews

Three modal-like surfaces:

1. `AiStructureDialog` - Radix `Dialog` handles focus trap and
   restore.
2. `ConfirmDialog` (archive, delete) - existing
   `components/ui/confirm-dialog.tsx`, Radix-backed.
3. Mobile decision dialog on `/knowledge/review/[slug]` - same
   Radix `Dialog`.

For all three: on close, focus restores to the trigger. Verified
in QA per the security/permissions audit deliverable.

### 13.5 Misc

- Every form input has an explicit `<label>` element. Do not rely
  on placeholder-as-label (the existing `ArticleEditor.tsx:97-104`
  uses explicit labels - we follow that pattern).
- The "URL" field on external reference uses `inputmode="url"` and
  `type="url"`.
- The verified date field uses `type="date"`.
- Search input on `/knowledge` uses `type="search"`
  (current code, `page.tsx:96`).
- Loading skeletons should have `aria-busy="true"` on the page
  container so screen readers announce a loading state.

---

## 14. Open questions

1. **Reviewer assignment**: do we assign a specific reviewer when
   the author requests review, or is the queue shared with
   first-come-first-served pickup? The flow above assumes shared.
   Either choice changes the "Reviewer" filter and the inbox tabs.
2. **Publish-on-approval default**: should "Publish when approved"
   default to on or off in the editor? An "on" default makes the
   flow one click shorter but loses the safety margin where the
   author looks at the approved version before going live.
3. **Article kind change**: can an author change the kind on an
   existing draft? If yes, do the kind-specific fields reset?
4. **External reference body**: do we require a body at all, or is
   the "Why it matters" field the entire body? The form above
   makes "Why it matters" required and treats it as the body.
5. **Verified expiry**: do we auto-archive an article once
   "verified within > 365d" passes some threshold, or only mark it
   stale visually? The freshness pill suggests visual-only.
6. **AI structuring cost ceiling**: do we surface the per-tenant
   cost cap in the UI, or only enforce server-side? The dialog
   above hides cost from the author.
7. **Mobile editor lift**: the editor banner says "limited on
   mobile" but Phase 2 may need a real mobile editor. Should we
   plan for a mobile-first markdown editor or accept the
   desktop-only constraint long term?
8. **Cross-tenant knowledge**: is there ever a case where a
   reference is shared across tenants (e.g. vendor docs everyone
   benefits from)? The current model is single-tenant.
9. **Tag scope**: today tags have a `scope` field. Are knowledge
   tags shared with job tags or are they a separate scope? The
   `ArticleTagPicker` currently fetches all tags
   (`ArticleTagPicker.tsx:35`). Should it filter to
   `scope=knowledge`?
10. **Permissions on "Mark verified"**: is verification a
    reviewer-only action, or can any author of the article do it?
    The flow above says any logged-in user with `knowledge.write`,
    but it could be tightened.

---

## Appendix A: route x role matrix

```
| Route                          | Public | Author | Reviewer | Admin |
|--------------------------------|--------|--------|----------|-------|
| /knowledge                      | r-pub  | r+w    | r+w      | r+w   |
| /knowledge/[slug] (published)   | r      | r+w    | r+w      | r+w   |
| /knowledge/[slug] (draft)       | -      | r+w    | r        | r+w   |
| /knowledge/[slug] (archived)    | -      | r      | r        | r+w   |
| /knowledge/new(/external)       | -      | w      | w        | w     |
| /knowledge/[slug]/edit          | -      | w-own  | -        | w     |
| /knowledge/review               | -      | -      | r+w      | r+w   |
| /knowledge/[slug]/ai            | -      | w-own  | -        | w     |
| /knowledge/[slug]/revisions     | -      | r-own  | r        | r     |
```

`r-pub` = read published only. `w-own` = write only when author. The
precise role-permission mapping is owned by the security audit
deliverable; this matrix is the UX expectation.

End of plan.
