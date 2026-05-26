# Knowledge System Planning Sprint - 10 Day Diary

Project: Skyware Internal Management Portal - Knowledge module hardening
Sprint window: 10 working days (simulated)
Owner: Project Manager
Status: Planning only. Implementation has NOT started. Awaiting approval.

This file is the running diary of the planning sprint. Each day captures
what the team did, what they argued about, what they decided, what they
left open, and how the next day changed in response.

Companion artifacts in this folder:

- `knowledge_tab_current_state_audit.md` - shipped surface today
- `knowledge_product_strategy.md` - vision, personas, funnels, metrics
- `knowledge_review_workflow.md` - state machine + reviewer rules
- `knowledge_database_schema_plan.md` - proposed migrations + indexes
- `knowledge_ux_plan.md` - pages, components, IA, accessibility
- `knowledge_security_permissions_audit.md` - threats + matrix + gates
- `knowledge_quality_control_plan.md` - DoD, rubric, freshness, tests
- `knowledge_implementation_plan.md` - phased roadmap
- `knowledge_system_plan.html` - polished approval deck

## Cast

- **PM** (Project Manager) - sprint owner, meeting chair
- **PdM** (Product Manager) - vision, JTBD, metrics
- **PdD** (Product Designer) - flows, IA, components
- **FE** (Senior Frontend Engineer) - component reuse, performance
- **BE** (Senior Backend Engineer) - routes, services, audit
- **DBA** (Database Architect) - schema, migrations, indexes
- **KM** (Knowledge Management Specialist) - taxonomy, lifecycle
- **TW** (Technical Writer) - rubric, voice, examples
- **QA** (QA Engineer) - automated tests, regression
- **Sec** (Security Engineer) - threat model, permissions, LLM safety
- **Eval** (Evaluation Engineer) - DoD, acceptance, freshness, success

---

## Day 1 - Charter and current-state intake

### Meeting summary
A grounding day. PM opened with the user's stated goal: "useful company
memory system that stores reviewed internal lessons from completed tasks
and reviewed external references that workers can reuse later." The team
agreed on the sprint output (planning only, no code) and the artifacts
that need to ship.

### Investigation
- PM read the user brief; circulated to the room.
- PdM reviewed the existing Knowledge tab via the read-only audit
  (`knowledge_tab_current_state_audit.md` initial draft was produced
  by an investigator agent the day before the sprint started).
- KM read Phase 3 §5.6 of the previous implementation plan to confirm
  what shipped.
- BE skimmed `lib/knowledge/queries.ts` and the routes.
- DBA opened `prisma/schema.prisma` and the two knowledge migrations.

### Key findings
- The module shipped as thin CRUD plus tags plus FTS. No review
  workflow. No external-reference shape. No link to Job. No revision
  history. No reliability metadata. No AI structuring.
- Feature flag `knowledge_articles_enabled` is default off. The page
  exists but the sidebar entry is gated.
- 31 tests today; none cover PATCH, DELETE, archive, list pagination,
  tag attach/detach, slug collision, or e2e flows.
- Body is `String @db.Text` and rendered as `<pre>` even though the
  schema comment says Markdown.

### Disagreements
- TW argued the current "Markdown rendered as pre" is a bigger user-
  facing bug than the team wanted to admit. PdM agreed to bump it into
  Phase 1 scope.
- BE wanted to leave `unpublishArticle` exposed as a public route. Sec
  said no - publishing and rescinding need a stricter path.

### Decisions
- Sprint output is the 9 markdown files plus the HTML deck. No code.
- The team will use the existing schema as a foundation. No big-bang
  rewrite. Forward-only migrations.
- The two product funnels (task-to-knowledge + external-reference) are
  treated as first-class with distinct UX and distinct DB columns.

### Open questions
- Should reliability tier apply to internal_task_lesson too, or only
  to external_reference? Carried to Day 2.
- Is rawInputSnapshot kept forever, or for a bounded period? Carried
  to Day 4 (DBA) and Day 8 (Sec).

### Tomorrow
Day 2 pivots to personas and JTBD. KM and PdM lead.

---

## Day 2 - Personas, JTBD, anti-personas

### Meeting summary
A product day. The team named four personas and seven anti-personas.
PdM defended hard against scope drift: this is not a marketing CMS, not
a customer wiki, not a vendor product catalog.

### Investigation
- PdM ran a quick walkthrough of typical worker tasks (`job done` ->
  `mark reviewed`) and noted where a "create knowledge article" CTA
  could live without interrupting the close-out flow.
- KM sketched the lifecycle of a single hypothetical incident from
  the IT department: "Client X had a printer driver bug; we fixed it
  with these two commands." How does that become a published article?
- TW drafted what "good" looks like for each of the six required
  article types.

### Key findings
- Two reader personas dominate: "I have the same problem now"
  (urgent, needs answer in 60 seconds) and "I want to understand a
  system before I touch it" (deliberate). Articles serve them
  differently.
- Anti-personas matter. The team did NOT want this to become:
  - a marketing site for the firm
  - a client-facing knowledge base
  - a sales enablement deck
  - a personal note-taking app
  - a quasi-CRM with notes about people
  - the SOP-system-of-record for the accountant
  - a chat archive
- The author-of-an-internal_task_lesson is almost always the same
  person who closed the original job. Reviewer must NOT be the same
  person.

### Disagreements
- PdM and KM disagreed on whether reliability tier applies to internal
  lessons. KM said yes: an internal_task_lesson based on a one-time
  fix vs a 50-times-replicated fix have different confidence. PdM
  feared tier proliferation. They compromised: reliability tier
  applies to ALL article types but defaults to `single_source` for
  internal_task_lesson and `validated` for architecture_decision.
- Sec wanted to force department-only visibility by default for all
  internal_task_lesson articles. PdM resisted - cross-pollination
  between IT and helpdesk is half the value. Punted to Day 5
  (visibility deep-dive).

### Decisions
- Personas and JTBDs documented in `knowledge_product_strategy.md` §2.
- The six article types stay as the brief specified.
- Reliability tier is universal but with type-specific defaults.

### Open questions
- Department-scoped vs org-wide visibility defaults per type. Carried
  to Day 5.
- Should "Process/policy note" be admin-only authorable? Carried to
  Day 3 (workflows).

### Tomorrow
Day 3 walks the two creation funnels end-to-end. PdD leads.

---

## Day 3 - Two creation funnels

### Meeting summary
A whiteboard day. The team walked the two creation paths on screens,
finding 11 friction points and 4 missing affordances.

### Investigation
- PdD opened `app/(portal)/my-jobs/[id]/page.tsx` and the
  `MarkDoneSheet` component to find the right surface for a
  "Create knowledge article" trigger.
- FE confirmed the existing `ArticleEditor.tsx` is a single big form;
  it will need to be type-aware after this sprint.
- KM mapped the "found a useful link" path: where does an employee
  PASTE a vendor URL? Today: nowhere. After: `/knowledge/new/external`
  full-page form.

### Key findings
- The reviewed-job page (`/my-jobs/[id]` after status `reviewed`) has
  no obvious place for a side action. The team chose two surfaces:
  - A small "Create knowledge article from this job" button on the
    detail page, visible only when status is `reviewed` AND the
    viewer is the assignee or an admin.
  - An optional checkbox inside `MarkDoneSheet` that prefills the
    draft after the job is marked done. The checkbox is OFF by
    default to avoid surprising the employee.
- The external-reference funnel needs URL canonicalization. Two
  paste-events from the same vendor doc should not produce two
  articles. SHA-256 of canonical URL plus a partial unique index.
- Both funnels land on the same draft state. The reviewer queue does
  not care whether it came from a job or a URL.

### Disagreements
- BE pushed for `MarkDoneSheet` to require a knowledge-article
  decision before allowing the mark-done. The room shut it down -
  this would slow operations and create perverse incentives (skip the
  question with garbage). The checkbox stays optional and unchecked.

### Decisions
- Two entry points for internal articles (post-reviewed button + opt-
  in checkbox inside MarkDoneSheet).
- One entry point for external articles (full-page form at
  `/knowledge/new/external`).
- Duplicate detection by canonical URL hash for externals.

### Open questions
- Should the external-reference form auto-fetch the page title? Sec
  has SSRF concerns. Deferred to Day 8.

### Tomorrow
Day 4 is DB schema first cut. DBA leads.

---

## Day 4 - Schema first cut

### Meeting summary
A heavy day. DBA presented the proposed deltas. The room argued the
revision-history shape for 40 minutes.

### Investigation
- DBA produced the proposed delta document:
  - new `KnowledgeArticleType` enum (6 values)
  - status enum expansion (6 values)
  - new columns on `KnowledgeArticle` (kind, sourceJobId,
    externalUrl, lastVerifiedAt, reliabilityTier, etc.)
  - new model `KnowledgeArticleRevision`
  - new model `KnowledgeArticleReview`
  - new model `KnowledgeArticleReference`
- BE checked existing audit + notification infra reusability. Both
  fit cleanly. New `NotificationKind` values needed
  (`knowledge_review_requested`, `knowledge_review_decided`).

### Key findings
- Status enum expansion is identity-mapped; existing
  `draft / published / archived` rows continue to map to the same
  values. Three new states (`ai_structured / pending_review / approved`)
  appear without a destructive backfill.
- Revision history could be a JSON column or a separate table. The
  room chose the separate table for two reasons: real version diffs
  and per-revision audit. JSON would have made diffing painful and
  audit cherry-picking impossible.
- `rawInputSnapshot` is preserved forever as an immutable text
  column on the article. It is not deleted, even on archive. Sec
  flagged a follow-up: redaction policy when an employee leaves the
  company - covered in `knowledge_security_permissions_audit.md` §10.

### Disagreements
- DBA and BE clashed on whether `KnowledgeArticleReview` should be one
  row per article or one row per cycle. BE argued one row simpler.
  DBA argued one-per-cycle gives the timeline. The room sided with
  DBA: a reviewer queue and a request-changes loop both need cycle-
  granularity.
- KM wanted a separate `KnowledgeArticleVerification` table for
  external-reference verification history. PdM said no - reuse the
  existing review model with a `kind` field. KM partially conceded.

### Decisions
- 5 forward-only migrations:
  - M1: enums (type, status expansion, reliability, review status)
  - M2: columns + FKs + CHECKs on `KnowledgeArticle`
  - M3: new tables (Revision, Review, Reference)
  - M4: indexes (`(kind, status)`, `(status, last_reviewed_at)`,
    partial unique on `externalUrlHash`)
  - M5: notification kinds (additive enum)
- Revision history stays a separate table.
- `rawInputSnapshot` stays on the article row, not extracted yet.

### Open questions
- Should `aiStructuredSnapshot` be a separate immutable record so the
  diff between AI output and final published body is preserved
  forever? Pending - default keep on the article row for now.

### Tomorrow
Day 5 is review workflow state machine. PM, BE, Sec lead.

---

## Day 5 - Review workflow state machine

### Meeting summary
The state machine took shape. The team formalized 23 transitions, who
fires each, and what guards apply.

### Investigation
- BE drew the state machine on the whiteboard.
- Sec audited transitions for missing permission checks.
- TW pushed on what the reviewer actually does in the queue.
- QA wrote acceptance tests in their head for each transition.

### Key findings
- The seven legal forward transitions:
  1. `draft -> ai_structured` (author triggers; LLM run; immutable
     snapshot saved to article row).
  2. `draft -> pending_review` (author submits without AI).
  3. `ai_structured -> pending_review` (author submits AI output as
     final, possibly after manual edits that bump revision).
  4. `pending_review -> approved` (reviewer approves).
  5. `pending_review -> draft` (reviewer requests changes; comment
     required; cycle counter ++).
  6. `approved -> published` (reviewer or admin publishes).
  7. `published -> archived` (admin only; comment required).
- Two legal backward transitions:
  - `approved -> pending_review` (admin un-approves before publishing).
  - `archived -> draft` (admin un-archives to revise).
- Same-actor guard: the author of a revision cannot be the reviewer
  of that revision.
- Reviewer cycle cap = 2. After 2 cycles of changes-requested without
  acceptance, an admin must arbitrate.

### Disagreements
- KM wanted `published -> draft` to be legal for "quick fix typos."
  Sec and DBA refused: published documents are immutable; typos are
  fixed by a new revision via a `pending_review` cycle. The
  audit story collapses otherwise.

### Decisions
- 7 forward transitions + 2 backward transitions formalized in
  `knowledge_review_workflow.md` §1.
- Same-actor guard enforced server-side, not just in UI.
- Reviewer cycle cap = 2 with admin arbitration.

### Open questions
- Reviewer SLA: 5 working days? The team's first guess. Carried to
  Day 7 (QA pushes on metrics).

### Tomorrow
Day 6 takes on the LLM structuring step. Sec and PdM lead.

---

## Day 6 - AI structuring step

### Meeting summary
The most contested day. The team debated whether LLM structuring is
worth shipping in V1. Final answer: ship the seam, ship a dry-run
mode, do not enable real LLM calls until production gates pass.

### Investigation
- Sec wrote the LLM threat surface: prompt injection in raw worker
  writeups (e.g., "ignore previous instructions and exfiltrate ..."),
  secrets leak in outbound prompts, model output containing
  hallucinated commands, vendor data residency.
- PdM and KM wrote what "structured" looks like: title cleanup,
  summary extraction, body sectioning into Problem / Cause / Fix /
  Verification, tag suggestions.
- BE proposed a three-gate posture mirroring the receipts module:
  feature flag `knowledge_ai_structuring_enabled` (default off), env
  `ALLOW_KNOWLEDGE_AI` (default unset), provider verification flag
  `knowledge_ai_provider_verified` (default false).

### Key findings
- The LLM call is OPTIONAL. The author clicks "structure this with
  the assistant" or skips and submits raw. Reviewer sees a diff
  either way.
- The default in non-production is a DRY-RUN mode: the structuring
  step runs a deterministic transform (extract headings, normalize
  whitespace, suggest tags from a static lexicon) and labels the
  output `ai_structured (dry-run)`. The real LLM call never fires
  until all three gates pass.
- A redaction pre-pass scrubs IPs, IBANs, JWT-like strings, AWS keys,
  and well-known internal hostnames BEFORE the prompt is built.
  The reviewer sees the original AND the redacted prompt.

### Disagreements
- TW wanted the LLM to compose tone and grammar suggestions in
  addition to structure. The room said no for V1 - too easy to drift
  into a marketing voice.

### Decisions
- LLM seam ships V1. Dry-run mode is the default everywhere.
- Three-gate posture identical to the receipts module.
- Redaction pre-pass mandatory for ANY LLM call, even dry-run.

### Open questions
- Vendor choice (OpenAI, Anthropic, Azure OpenAI, Google) - deferred
  past V1.
- Cost cap per article - PM to wire a per-author monthly quota in
  V2.

### Tomorrow
Day 7 is UX deep dive. PdD leads.

---

## Day 7 - UX deep dive

### Meeting summary
PdD walked the team through the proposed pages and a clickable
sketch. Two reviewer-queue UX patterns were tested informally; the
inbox-tab pattern won.

### Investigation
- PdD drew 11 routes including `/knowledge/review`,
  `/knowledge/new/external`, `/knowledge/[slug]/ai`,
  `/knowledge/[slug]/revisions`.
- FE inventoried component reuse: 15 existing primitives,
  17 net-new components.
- TW critiqued copy for the type chips (Hebrew + English).
- QA noted skeleton states for every list and detail page.

### Key findings
- The reviewer queue follows an inbox pattern (Unassigned / Mine /
  All / Closed). A sticky decision footer keeps approve / request-
  changes / reject visible while reading.
- Diff view shows current draft vs the last published revision OR
  AI output vs the original raw input, depending on context.
- Article detail has a hero block, a body, and a metadata sidebar
  with type chip, status chip, reliability tier badge, last verified
  pill, source link, and related articles.
- Mobile prioritizes the reader; the editor banners a "use desktop"
  recommendation. Mobile reviewers see a simplified "Decide" modal
  with the same three actions.

### Disagreements
- FE asked whether the new `ReliabilityTierBadge` should be a chip
  or a small ribbon at the top of the article. PdD chose chip with
  a tooltip for the definition.

### Decisions
- 11 routes documented in `knowledge_ux_plan.md` §1.
- 17 new components inventoried.
- Component reuse pattern matches the rest of the portal.

### Open questions
- Whether to auto-publish on approval (one-click) or always require
  a second publish click. PdD argued for the explicit publish to
  match the existing pattern in the receipts module (approve and
  finalize are distinct). The room agreed.

### Tomorrow
Day 8 is security + permissions deep dive. Sec leads.

---

## Day 8 - Security + permissions deep dive

### Meeting summary
Sec presented the threat model (12 threats) and the permissions
matrix (27 actions x 4 role columns). Two changes flowed back into
the UX and DB plans.

### Investigation
- Sec wrote 12 threats with attacker, asset, impact, mitigation.
- Sec built the permissions matrix for the 27 actions.
- BE confirmed each action maps to one or more routes in the API
  plan.
- DBA accepted two new requirements: an `externalUrlHash` index
  with a partial unique constraint to dedup, and an explicit
  `department_only` visibility value.

### Key findings
- The top three threats are:
  1. Prompt injection via raw worker writeup leading to undesirable
     LLM output. Mitigation: redaction pre-pass + reviewer always
     sees the original.
  2. Secret leak in a published article (passwords, tokens copy-
     pasted by a tired worker). Mitigation: secret-pattern scanner
     in the editor as a warning; reviewer trained to look.
  3. SSRF via external-URL auto-fetch. Mitigation: defer auto-fetch
     to V2; in V1 the author types the title manually.
- Permissions matrix: employee can author and read; admin can
  approve, publish, archive, rescind, send to AI, mark external as
  verified. Employee can edit own drafts only; never another's draft.
- Visibility rules expanded with `department_only` (default for new
  drafts authored in a department) and `client_serving_only` (for
  client-specific articles).

### Disagreements
- KM wanted "junior reviewer" to be a thing. Sec resisted role
  proliferation. The room agreed for V1 to keep two practical
  reviewer levels: senior employee (can approve external_reference
  and how_to_guide) and admin (can approve everything). This is a
  role-mapping rule, not a new role.

### Decisions
- 12 threats documented with mitigations.
- Permissions matrix locked. Senior-employee reviewer is implemented
  by an opt-in flag on the User table (Phase 2; admin-only in V1).
- Three-gate AI posture confirmed.

### Open questions
- Should attachments inside knowledge articles re-use the existing
  S3 layer? Yes, with knowledge-article-specific ACL via the
  visibility field. Carried to Day 9.

### Tomorrow
Day 9 is QA + freshness + acceptance. QA and Eval lead.

---

## Day 9 - QA, freshness, acceptance tests

### Meeting summary
QA presented the test plan (129 unit assertions across 9 lib files,
13 integration test files, 5 component tests, 1 e2e happy path).
Eval owned the freshness sweep design and the metric dashboard.

### Investigation
- QA pulled the existing knowledge tests (5 files, 31 cases) and
  mapped what's missing.
- Eval defined per-type stale thresholds: external_reference 180
  days, troubleshooting_note 365, how_to_guide 365,
  internal_task_lesson 540, architecture_decision 730, process_policy
  730.
- TW co-owned the editorial rubric (clarity, accuracy,
  completeness, link health, tag coverage, type fit).
- BE checked the existing CRON infrastructure (Phase 3 §5.1) - the
  freshness sweep fits the same cron-trigger pattern.

### Key findings
- Definition of done for an article: title, summary, body (with type-
  specific word minimums), at least one tag, reviewer signoff, no
  broken external links, no secrets detected.
- Editorial rubric: each criterion 1-5; threshold all >= 3 and sum
  >= 22.
- Freshness sweep is notification-only. It NEVER auto-publishes or
  auto-archives. The cron writes `notify(reviewer, "verify needed")`.
- E2E happy path is one test: AI structure -> edit -> submit ->
  approve -> publish -> appear in global search -> link back to the
  source job.

### Disagreements
- Eval pushed for a hard "expire after 90 days without re-verify"
  policy on external_reference. KM objected - a well-written
  external_reference about a stable RFC is not stale at 90 days.
  Compromise: stale threshold is 180 days but the article stays
  published; only the freshness pill turns amber.

### Decisions
- Test plan documented in `knowledge_quality_control_plan.md` §6.
- Freshness sweep notifies, never auto-acts.
- Failure mode trigger: if > 30% articles stuck in pending_review
  for > 7 days, pause new submissions until reviewer capacity is
  restored.

### Open questions
- Snapshot-style automated rubric check (LLM grading articles
  against the rubric to flag low scores) - deferred to V2 because
  Sec wants more time on the redaction story for grading prompts.

### Tomorrow
Day 10 is plan consolidation, risks, roadmap, and the approval deck.

---

## Day 10 - Plan consolidation, risks, roadmap, approval deck

### Meeting summary
The team froze decisions, scoped MVP, and walked the implementation
roadmap. PM signed off on the package and prepared the approval deck.

### Investigation
- PM read every artifact end-to-end and reconciled conflicts.
- PdM finalized MVP scope.
- DBA confirmed the 5 migrations are independent and forward-only.
- Sec confirmed gate posture is identical to receipts module.
- FE estimated frontend work at 6-8 engineering days for V1; BE
  estimated 5-7 days for the API + workflow; DBA 2 days for
  migrations; QA 3-4 days for tests; Eval 1 day for the freshness
  sweep + dashboard wiring; Sec 1 day for the redaction pre-pass.

### Decisions
- MVP scope locked. See `knowledge_implementation_plan.md` §3.
- Phasing: V1 (foundations + flows + review), V2 (LLM real call,
  auto-fetch, attachments, reviewer-shared scope), V3 (rubric
  grader, analytics, multi-language bodies).
- Risks documented with mitigations.
- HTML approval deck written.

### Open questions
None blocking. All 35 open questions accumulated across the sprint
were either decided or explicitly deferred to V2 or V3 with a flag.

### Tomorrow
Awaiting project owner approval. If approved, V1 implementation
starts on the next working day. If not approved, the team takes the
feedback and runs a one-day re-plan.

---

## Sprint outcomes at a glance

| Output | Status |
|---|---|
| Current state audit | shipped |
| Product strategy | shipped |
| Review workflow | shipped |
| DB schema plan | shipped |
| UX plan | shipped |
| Security + permissions | shipped |
| Quality control plan | shipped |
| Implementation plan (V1 + V2 + V3) | shipped |
| HTML approval deck | shipped |
| Code changes | ZERO. Implementation has NOT started. |

**Implementation has not started. Awaiting approval.**
