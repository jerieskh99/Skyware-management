# Knowledge Module - Product Strategy

Sprint: knowledge-sprint-2026-05
Owner: Product (acting PM) with input from KM and Tech Writing
Status: Draft for sprint review
Scope: Skyware-management internal portal, Knowledge module beyond Phase 3 §5.6

This document is the authoritative product strategy for the Knowledge module. The companion document `knowledge_review_workflow.md` defines the operational mechanics. Both files must agree. Where this file says "Phase 1", it means the deliverable scope of the next implementation sprint. Where it says "later", it means deferred to a future sprint.

## 1. Product vision

We are building an internal knowledge layer that captures the actual work the team does, not a polished documentation site that nobody updates. The vision is to make every completed job and every useful external reference a candidate for a small, reviewed, searchable article, so the next person who hits the same problem finds the answer in less than 60 seconds. Authorship is cheap, review is non-negotiable, and decay is observable. The system rewards "I just solved this, here is the writeup" more than "let us draft a perfect runbook for next quarter". It must coexist with the existing Jobs, Tickets, Clients, and Audit modules without becoming a second source of truth for any of those. The bet is that the team's daily work already produces enough raw signal to feed a useful internal corpus, and that the binding constraint is friction at three points: starting an article, getting it reviewed, and keeping it honest as it ages. This module attacks those three points directly and ignores the rest.

- Capture beats craft. A short, reviewed, true article published today beats a long, unreviewed article published in three months. We will not ship a template gallery in Phase 1; the friction it adds is larger than the consistency it buys.
- Every article has exactly one owner and one reviewer. No orphan articles. Ownership is enforced at creation and re-enforced on departure (see §9). An article without an owner is a defect, not a state we tolerate.
- Internal authoring funnels start from real work (a closed Job, a real link an engineer found) so the corpus stays grounded. We are explicitly closing the door on "write a runbook from scratch with no triggering event" in Phase 1; that path is too easy to use for low-value content.
- Reliability is a first-class field. Readers see "verified" vs "single-source" up front and can filter on it. The four-tier model in §6 is intentionally coarse; finer-grained scoring is research-grade and rarely actionable.
- AI is a structuring assistant, never a publishing authority. A draft touched by the LLM is marked and a human still approves it. We will not gate AI usage on "is the model good enough"; we gate it on "did a human read the output and accept it".

## 2. Personas and jobs-to-be-done

### 2.1 Employee author (Helpdesk, IT, R&D)

The person who just finished a job, ticket, or research dive. They have raw notes, the closed Job page in another tab, and 10 to 25 minutes before the next thing lands on their plate. They will write something useful only if the path from "I solved this" to "draft saved" is shorter than the path to closing the tab. They are not professional writers and they resent template heaviness.

JTBD:
- When I finish a non-trivial job, help me turn what I learned into something my teammates can reuse, without me re-typing the context.
- When I find a useful link or vendor doc in the wild, let me file it with a one-paragraph summary in under two minutes so I do not lose it.
- When a reviewer asks for changes, tell me exactly what is missing instead of sending the draft back with a vague "please clean up".

### 2.2 Employee reader (any employee, often new hire)

The person who hit a problem and is searching. They will not read more than two screens. They want to know if the article applies to them (which client, which environment, which version) within the first paragraph, and they want to know if it is trustworthy.

JTBD:
- When I search for a symptom, give me articles ranked by relevance and reliability, not by author seniority or recency alone.
- When I open an article, tell me in the first 200 pixels whether it is verified, when it was last checked, and who owns it.
- When the article is wrong or stale, give me a one-click way to flag it without writing an essay.

### 2.3 Admin reviewer (CEO/CTO and a small bench of senior reviewers)

The gatekeeper. Time is the binding constraint. They will approve articles that look right and reject the rest. They need a fast diff view, especially against the AI-structured version, and they need to push back on weak writeups without becoming a bottleneck.

JTBD:
- When an article hits my queue, show me the original raw writeup, the AI-structured version, and the author's choice between them, side by side.
- When I send something back, let me leave inline comments tied to article sections, not just one free-text box.
- When the queue is older than 5 working days, escalate to me before the author forgets the context.

### 2.4 Manager curator (heads of department, doubles as KM specialist)

Looks across the corpus, not at single articles. Cares about gaps, redundancy, decay, and ownership. They are the only role that thinks about taxonomy drift, dead tags, and which retired employee left unowned articles behind. In Phase 1 this is not a dedicated job title; it is a role assumed part-time by department heads. Phase 2 may formalize a single KM Specialist who covers the whole portal. The product must not assume a full-time curator; everything described under this persona must remain doable in 30 minutes a week per department.

JTBD:
- When an owner leaves the company or moves teams, surface their orphan articles and let me reassign in bulk.
- When two articles cover the same topic, let me merge them and preserve the audit trail of both.
- When a tag is used fewer than three times in 12 months, suggest a merge or archive.

### 2.5 Cross-persona note

The same human plays multiple roles across the day. A Helpdesk engineer authors in the morning, reads in the afternoon, and may reviews a teammate's draft if they happen to be the most senior person in the department on a Friday. The product must not assume the personas are different humans; it must assume they are different sessions on the same human's calendar. This drives some design choices:
- The "draft" experience and the "review" experience share the same article view, with role-specific controls. We do not build two separate UIs.
- Notifications are batched per person, not per role.
- Search defaults match the most common task (reading published articles) and other states require explicit opt-in.

## 3. Anti-personas and explicit non-goals

The audit explicitly demands "what this is not". Naming the non-goals up front prevents this module from being conscripted into adjacent uses.

- This is not a customer-facing wiki. No anonymous read access. No public URL. Visibility is gated by the existing portal auth.
- This is not a vendor knowledge base for resellers. We do not host vendor documentation. We summarize and link.
- This is not a marketing CMS. No landing pages, no campaign content, no brand assets, no editorial calendar.
- This is not a replacement for Jobs notes. A Job's worklog and resolution field remains the source of truth for that specific job. Articles cite jobs; they do not replace them.
- This is not a replacement for the Audit log. State changes are written there; readers do not browse audit rows as articles.
- This is not a real-time chat or Q&A board. No threaded discussions on published articles. Comments exist only inside the review loop.
- This is not a personal note app. Articles are organizational property. No "my private drafts that only I see forever". Drafts older than 20 working days with no activity are auto-archived. If a user wants a notepad, the company already provides one.
- This is not a documentation generator. We do not auto-generate articles from code, schemas, or commits. Authorship requires a human starting point.
- This is not a translation platform. Articles are written in the author's working language (Hebrew or English). No automatic translation in Phase 1; no parallel-language storage. If we need bilingual articles later, that is a Phase 3 conversation.
- This is not a media library. Articles can embed images via the existing portal attachment mechanism (already shipped) but the Knowledge module does not become the canonical place to store screenshots, recordings, or large binaries.

### 3.1 Adjacent things we are deliberately keeping in their existing modules

- Client contact information stays in the Clients module. An article may link to a client; it does not become a duplicate contact card.
- Job worklogs stay in the Jobs module. An article cites a Job; it does not become a worklog viewer.
- Ticket trails stay in the Tickets module. An article may cite a ticket; it does not become a ticketing UI.
- Billing artifacts (invoices, receipts) stay in the Billing module and are never discussed in articles by document number; if a process_policy_note needs to reference billing behavior, it links to the relevant Billing setting, not to a specific document.

## 4. The two creation funnels

There are exactly two ways an article enters the corpus in Phase 1. Anything else is out of scope for the sprint.

### 4.1 Task-to-knowledge funnel

Trigger: a Job moves from "in review" to "reviewed and accepted" by an admin. This is the moment a writeup is most likely to be honest, fresh, and complete.

Step-by-step:

1. Admin marks the Job as reviewed and accepted in the existing Jobs UI. Nothing in that flow changes.
2. On the Job detail page, a button appears for the worker who handled the job: "Turn this into a Knowledge Article". This button is visible only to the assigned worker and to any admin. The button is hidden if an article already exists that cites this job.
3. The worker clicks the button. The system opens a draft article in state `draft` and pre-fills:
   - Title (editable, taken from the Job title with a "(lesson)" suffix)
   - Type defaults to `internal_task_lesson`. Author may switch to `troubleshooting_note` or `how_to_guide` if more appropriate.
   - Body is seeded with the Job description, the resolution field, and the relevant worklog entries, concatenated with section dividers but otherwise untouched.
   - Tags inherit the Job's client tag (if any) and category tag. Author can edit.
   - Linked Job ID is set automatically and is read-only.
4. The author edits the draft. A side panel shows the original Job for reference. There is an explicit toggle: "Use AI to structure this writeup". Off by default. If the author opts in:
   a. The AI structuring step runs (see workflow §3). The draft moves from `draft` to `ai_structured`.
   b. The author sees a diff between the raw draft and the AI-structured version, with an "accept all", "reject all", or per-section "accept" buttons.
   c. If the author accepts the AI version, the structured fields become the working draft. The state stays `ai_structured` until submission.
   d. If the author rejects, the state returns to `draft` and the AI version is discarded but the attempt is logged in audit.
5. The author clicks "Submit for review". State moves to `pending_review`. The reviewer field is auto-suggested using §2 of the workflow doc (admin for `internal_task_lesson`; senior employee for `how_to_guide`; admin for `architecture_decision`).
6. The reviewer either approves, requests changes, or rejects. Approval moves state to `approved`. The reviewer chooses on the same screen whether to also publish now (state `published`) or defer publishing. See workflow §6 on why these are separate.
7. Publishing makes the article visible to all employees per the existing visibility rules from Phase 3 §5.6.

Visible buttons in this funnel (in order of appearance):
- "Turn this into a Knowledge Article" (Job page, post-review)
- "Use AI to structure this writeup" (draft editor, off by default)
- "Accept AI version" / "Reject AI version" / per-section "Accept this section" (only after AI run)
- "Save draft" (always)
- "Submit for review" (draft and ai_structured states)
- "Approve" / "Request changes" / "Reject" (reviewer only, pending_review state)
- "Publish now" (approved state, reviewer or admin)
- "Archive" (published or approved state, owner or admin)

Reviewer gates fire at:
- Submit for review (validates required fields: title, type, body length minimum, at least one tag, owner set, reviewer assigned)
- Approve (validates reliability tier set, last_verified date set, no broken internal links)
- Publish (no extra validation; approval already covered it, but a confirmation modal warns if the article cites a Job that has since been reopened)

### 4.1.1 What does not happen in this funnel

These are explicitly excluded so reviewers do not expect them in Phase 1:
- The system does not auto-pull worklog screenshots into the draft. Authors paste what they want.
- The system does not auto-detect duplicate articles citing the same Job. Phase 2 may add a banner ("a similar article was already published from this Job"). Phase 1 relies on the author and reviewer noticing.
- The system does not link the article back into the Job page automatically; that link appears in the Job-side panel because the article has a `linked_job_id`, but no field on the Job changes.

### 4.1.2 Why this trigger and not earlier

We considered triggering the funnel at "Job marked done by the worker" rather than "Job reviewed by an admin". Decided against it because:
- A done-but-not-yet-reviewed Job may turn out to have the wrong resolution. Capturing a lesson on a still-uncertain fix wastes review time.
- The "reviewed and accepted" signal is what we already have, and it is high-quality. Adding a second signal is unnecessary.
- The worker still has fresh context at the point of admin review (typically same week), so we are not losing recall.

We also considered triggering at "Job closed and 7 days passed with no reopen". Decided against it because the 7-day delay makes the writeup colder and reduces capture rate; the rare case of a late reopen is handled by §9 edge cases instead.

### 4.2 External-reference funnel

Trigger: an employee finds a useful link in the wild (vendor doc, RFC, GitHub issue, blog post, conference talk, security advisory) and wants it in the system.

Step-by-step:

1. Employee navigates to the Knowledge module and clicks "Add external reference". A short form opens. This is intentionally not the same UI as the article editor; the form is one screen.
2. Required fields on the form:
   - URL (validated as a well-formed URL, not crawled at this stage)
   - Source name (free text, e.g. "Microsoft Learn", "Cloudflare blog", "IETF RFC 7519")
   - Title of the resource (free text, pre-filled from URL if the system can resolve a title client-side; otherwise blank)
   - One-paragraph summary (200 to 800 characters, enforced)
   - "Why it matters to us" (50 to 400 characters, separate field, also required)
   - Tags (at least one)
   - Reliability tier (author's initial estimate; reviewer can change)
   - Last verified date (defaults to today)
3. Type is fixed to `external_reference`. Cannot be changed.
4. Submitting the form creates the article in state `draft` and immediately transitions to `pending_review` if the author checks "Submit immediately" (default on). If unchecked, it stays in `draft` for the author to refine later.
5. The AI structuring step is not offered for external references. The content of an external reference is small enough that structuring adds no value, and we do not want the LLM rewriting the "why it matters" paragraph.
6. Reviewer (admin or senior employee per workflow §2) sees the form fields, opens the URL once to confirm it resolves, and either approves, requests changes, or rejects.
7. Approval and publishing follow the same separated steps as the task-to-knowledge funnel.

Open question: should the system fetch the page title and a snippet server-side at submission, given that some external sources need auth or block our IP. Leaning towards client-side only for Phase 1 to avoid an outbound-fetch service.

### 4.2.1 Why two separate forms instead of one

We considered making the external-reference flow a special case of the main article editor. Decided against it because:
- The forms have very different shapes. An external reference is six small fields; an article is a long body editor. Putting them in the same form means hiding two thirds of the editor for external references, which complicates the UX for the most common path.
- The mental model for the user is different. "I want to write about something" vs "I want to file a link". Forcing both into the same starting screen makes both worse.
- The validation is different. External references have URL validation and length caps on the summary; articles have body-length minimums.

Phase 1 ships two entry points. Phase 2 may unify if the data tells us authors are routinely starting with the wrong one.

### 4.2.2 External references created from inside another article

If an author writing a `how_to_guide` wants to cite an external link, they do not have to create a separate external_reference article. They can paste the link inline. The system does not auto-create an external_reference for every linked URL; that would explode the corpus. External_reference articles are created only when an employee decides the link is worth filing on its own merits.

## 5. The six article types

Each type has its own typical author, typical reviewer, structure expectation, and retention period. Retention here means how long after the last verification or last edit before the article is auto-suggested for archival review.

### 5.1 internal_task_lesson

Typical author: the worker (Helpdesk or IT) who closed a specific Job. Typical reviewer: admin (CEO or CTO). Structure: short context paragraph naming the client (or "internal"), the symptom, the root cause, the fix, and one paragraph of "what I would do differently". Linked Job ID is mandatory. Retention: review every 18 months. After that, the system flags the article as "older than 18 months, please re-verify" but does not auto-archive.

Why 18 months and not 12: internal lessons describe fixes that were applied once and tend to remain true longer than vendor-doc references. They go stale primarily when the underlying client environment changes, which happens on a slower clock than vendor releases.

Why admin review: internal lessons name clients and describe how we operate. Letting a peer review their teammate's lesson risks groupthink and missed redactions. The admin review is the gate where we ask "would I be comfortable if a competitor read this".

### 5.2 external_reference

Typical author: any employee. Typical reviewer: a senior employee in the relevant department (R&D for technical RFCs, IT for vendor docs, Helpdesk for end-user articles), with admin as fallback. Structure: URL, source, title, one-paragraph summary, "why it matters", reliability, last verified. No long body. Retention: re-verify every 12 months because external links rot. After 12 months without re-verification, confidence drops one tier automatically.

Why 12 months: vendor documentation moves on a roughly annual cycle. Twelve months is short enough to catch rot, long enough that re-verification is not constant work.

Why automatic confidence decay: an external_reference's value is in being trustworthy. A reference last verified two years ago is not trustworthy by default. We could hide such articles, but readers may still want them; dropping confidence preserves access while warning the reader.

### 5.3 how_to_guide

Typical author: any employee who has done the procedure at least twice. Typical reviewer: a senior employee in the same department; admin if the procedure spans departments. Structure: prerequisites, numbered steps, expected output of each step, common failure modes, rollback. Linked Jobs encouraged but not required. Retention: re-verify every 12 months or after any major version change of the underlying tool. Same auto-decay as external_reference.

Why "done it at least twice" rule for authors: someone who has performed the procedure once knows the happy path. Someone who has done it twice knows where the procedure broke and what they did about it. The second-time knowledge is what readers actually need. We do not enforce the rule technically; it is a written norm reviewers can call on.

Why department-scoped review by default: how-to guides tend to be procedural details specific to one team's tooling. A reviewer outside the department cannot meaningfully validate the steps.

### 5.4 troubleshooting_note

Typical author: any employee who diagnosed a tricky issue. Typical reviewer: senior employee in the same department; admin if security-sensitive. Structure: symptom, diagnostic steps in order, root causes (plural allowed), fix per root cause, prevention. Linked Jobs encouraged. Retention: 24 months. Symptoms tend to age slower than tooling, but the underlying stack changes, so we still re-verify every two years.

Why "root causes plural": a single symptom often has multiple root causes (network, permissions, configuration). Forcing one-to-many in the structure means future readers see all the possibilities, not just the one that hit the original author.

Why security-sensitive notes go to admin: anything involving secrets, credentials, vulnerabilities, or access patterns needs admin review for disclosure scope. The article may be perfectly true but reveal too much by being too specific.

### 5.5 architecture_decision

Typical author: CTO or an R&D lead. Typical reviewer: CEO if business-impacting, CTO if purely technical. Structure: context, decision, alternatives considered, consequences, status (proposed, accepted, deprecated, superseded). Mirror the standard ADR shape but inside the portal. Retention: never auto-archive. ADRs are part of the institutional record. They can be marked deprecated or superseded but they stay readable.

Why ADRs do not decay: an ADR records a decision that was made at a specific time with specific information. The decision does not become less true with age, even if it becomes less applicable. Future readers benefit from seeing the original reasoning, marked deprecated if needed. Hiding old ADRs makes future engineers repeat old debates.

Why status as a structured field: "deprecated by X" and "superseded by Y" are queries readers actually run. Putting status in a structured field rather than free text means the search can filter on it.

### 5.6 process_policy_note

Typical author: a manager or admin. Typical reviewer: another admin (separation of duties: the author cannot self-approve). Structure: scope (who this applies to), the policy, exceptions, owner, effective date, review date. Retention: 12 months. Policies must be re-confirmed annually or they auto-flag as stale; if not re-confirmed within 30 days of the flag, they archive.

Why annual re-confirmation: policies are statements about how we operate. They quietly stop being true when practice drifts. Forcing annual re-confirmation is a small ritual that catches drift early. It also gives the policy owner a reason to look at the article and notice if it needs an update.

Why auto-archive (not just decay) for policies: if a policy has not been re-confirmed within 30 days of its annual flag, the most likely explanation is that nobody cares enough to maintain it. Keeping an unconfirmed policy visible is misleading. Archiving forces a fresh draft if the policy is still meant to be in force.

### 5.7 Why these six and not more

The temptation in a Phase 1 design is to pre-name every shape an article might take. We resisted it. Six types is the smallest set that covers the actual content the team produces today, with the property that each type has a meaningfully different structure or review path. Adding a seventh type (e.g. "incident_postmortem") was discussed and rejected for Phase 1 on the grounds that incidents are rare in this firm's day-to-day work and any postmortem can be filed as a `troubleshooting_note` with an `incident` tag in the interim. If the tag accumulates more than ten articles within a year, Phase 2 will promote it to its own type.

### 5.8 Why type is immutable after submission

The author can change type freely during `draft`. Once submitted, type can be changed only by a reviewer, and only by sending the article back to draft. This is intentional. Type drives reviewer selection (§2 of the workflow doc), retention (this section), and the AI structuring contract (workflow §3). Allowing post-submission type changes silently invalidates all three. Routing a change through draft -> resubmit costs a few minutes and keeps the invariants intact.

## 6. Reliability and confidence model

Four tiers, applied to every article at submission, settable by the reviewer at approval, and adjustable later by the owner or any admin. The reader sees the tier as a small label near the title. Filters allow "verified only" or "exclude anecdotal".

- **verified**: independently confirmed by at least two people (author plus reviewer have both reproduced the steps or vetted the external source). For external_reference, also requires the source itself to be an authoritative publisher (vendor docs, standards bodies, peer-reviewed work).
- **validated**: confirmed by one person beyond the author (the reviewer signed off after spot-checking). Default tier for approved articles in Phase 1.
- **single-source**: information comes from one author or one external source with no second corroboration. Reader should treat as a lead, not a fact.
- **anecdotal**: reported once, not yet verified, kept because it has signal. Used sparingly. Cannot be assigned at publication time without an admin override; usually arrives only when an article decays from validated to anecdotal over time.

### 6.1 Why four tiers and not three or five

Three tiers (e.g. verified / validated / unverified) collapses the difference between "one external source" and "I heard it from a colleague", which we actually care about for external_reference. Five tiers introduces a "moderately verified" middle that nobody can describe in one sentence and reviewers will assign by gut. Four tiers maps cleanly to the kinds of evidence we encounter in this firm: independent corroboration, single-reviewer signoff, single source, and unverified-but-kept. Anything finer is research-grade and not actionable in day-to-day reviews.

### 6.2 Visual treatment in the reader UI

The reliability label sits next to the title in the article header. Colors are tied to the existing portal palette (no new tokens). The exact pixel spec is in the UX plan, but the principle is: the label is visible without scrolling, and it has the same prominence as the "Last verified" date. Filter chips on the search results page use the same labels and the same colors. Readers should learn the four tiers within a week of using the module; if they cannot, the labels are wrong and we revise them in Phase 2.

Default tiers per type:
- internal_task_lesson: starts at validated, can be raised to verified if a second engineer signs off.
- external_reference: starts at single-source. Upgraded to validated when reviewer opens the URL and confirms. Upgraded to verified only if the source is authoritative.
- how_to_guide: starts at validated. Verified requires a second engineer running through the guide end-to-end.
- troubleshooting_note: starts at validated.
- architecture_decision: starts at verified once approved. ADRs are usually multi-person decisions by construction.
- process_policy_note: starts at verified once approved by an admin who is not the author.

## 7. "Last verified" semantics

Every article has a `last_verified_at` timestamp and a `last_verified_by` user reference. These are not the same as `updated_at` or `published_at`.

- Set at publication: on first publish, `last_verified_at` is the publish time and `last_verified_by` is the reviewer.
- Set on re-verification: any employee can open a "Re-verify" action on a published article. They confirm the article is still accurate, optionally edit, and the system updates both fields. If they edit substantively, the article re-enters review (see workflow §1).
- Automatic decay: once a type-specific staleness window elapses (12, 18, or 24 months per §5), the system applies the staleness rule:
  - external_reference and how_to_guide: confidence drops one tier (verified -> validated -> single-source -> anecdotal). At anecdotal, the article is flagged for archival review.
  - internal_task_lesson, troubleshooting_note: confidence stays, but a banner appears on the article: "Last verified more than N months ago. Please re-verify."
  - architecture_decision: no decay. Banner shows last verified date but does not nag.
  - process_policy_note: auto-flag for re-confirmation; if not re-confirmed within 30 days, archive.
- The owner is notified by email and in-app at the moment of decay. The manager curator sees a roll-up on a "stale articles" dashboard (Phase 2).

Open question: should re-verification by the original author count for less than re-verification by a second party. Suggested rule: re-verification by the author cannot raise confidence above validated; only a different employee can re-verify into verified. Leaving as proposal pending sprint review.

### 7.1 What counts as "verifying" in practice

For internal_task_lesson: opening the article, reading the fix, mentally checking that the underlying systems still work that way, and clicking "Re-verify". For how_to_guide and troubleshooting_note: ideally running through the steps end-to-end, but at minimum reading them critically and confirming. For external_reference: opening the URL, confirming the page still exists and still says what we said it said. For architecture_decision: opening the article, confirming the decision is still in force (or marking it deprecated). For process_policy_note: confirming the policy is still in effect.

The re-verify action is one click followed by an optional one-line note. We are not asking the verifier to write an essay. The point is to update the timestamp with a name attached, not to produce a re-verification report.

### 7.2 Why a per-type staleness window instead of one global window

A staleness window of "1 year" applied uniformly would either flag too many internal lessons (their fixes age slowly) or flag too few external references (whose URLs rot fast). Per-type windows match the rate at which each type actually goes stale in practice. The three windows (12, 18, 24 months) are coarse on purpose; finer granularity would not change reviewer behavior.

## 8. Search and discoverability principles

Phase 3 §5.6 already shipped FTS in global search. The Knowledge module extends search with knowledge-specific filters but does not introduce a new search engine.

- Keyword: full-text over title, body, tags, and (for external_reference) source and summary. Existing FTS index.
- Tag filter: multi-select across the tag set already used by Jobs and Clients, plus a knowledge-only tag namespace for things like "post-mortem", "security-advisory", "vendor-specific".
- Type filter: the six article types listed in §5. Multi-select.
- Status filter: defaults to "published" only. Reviewers and owners can switch to include `pending_review`, `approved`, or `archived`. Drafts are only visible to their author and assigned reviewer.
- Author filter: free-text user picker.
- Reliability filter: minimum tier (e.g. "validated or higher").
- Sort order: relevance by default, with secondary tiebreaker on reliability then on last_verified_at descending. Recency is a tiebreaker, not the primary axis.

Saved searches: Phase 2. The mechanism is straightforward (store the query string under a name) but it is not blocking Phase 1, and there is a non-trivial UX cost on the "manage my saved searches" screen.

Discoverability beyond search:
- On every Job detail page, a small panel shows articles that cite that job, plus articles whose tags overlap with the job's tags. Phase 1.
- On every Client detail page, a panel of articles tagged with that client. Phase 1.
- A weekly digest email of "new and updated articles in your department" goes to all employees. Phase 2.
- A homepage widget showing the 5 most recently approved articles. Phase 2.

### 8.1 Search ranking explained

Default ranking is FTS relevance score multiplied by a reliability bonus, with last_verified_at recency as a third-order tiebreaker. Approximate weights for Phase 1:
- FTS relevance: 70 percent of the ranking signal.
- Reliability tier bonus: 20 percent. Verified articles get a 1.0 multiplier, validated 0.85, single-source 0.65, anecdotal 0.4.
- Recency of last verification: 10 percent. Articles re-verified within the last 6 months get a small bump.

We are not exposing these weights to users in Phase 1. They are tunable server-side. If the ranking visibly produces wrong results in the first month, the curator can request a retune; the weights live in a single config file.

### 8.2 Why we deferred saved searches

A saved search is easy to build (store the query as a JSON blob under a name) but has three UX problems that justify deferring it:
- A "manage my saved searches" screen is a non-trivial design (rename, delete, default).
- Notifications on saved searches ("new article matches your saved query") is a separate feature that owners will request the day saved searches ship.
- We do not yet know which queries people actually run. Shipping saved searches before we have query analytics is a guess.

Phase 2 will ship saved searches after we have one month of search-log data to inform the design.

### 8.3 Discoverability for new hires

A new hire on day one cannot meaningfully use search because they do not know the vocabulary yet. Two affordances help:
- The Client detail page already exists in the portal; the new article panel on it gives a new hire a tag-free way to browse what we know about a client.
- The Job detail page panel does the same for tickets and jobs they shadow.
- A "Recently approved" view (Phase 2 widget) gives a sense of what the team is currently learning.

We are not building an onboarding curriculum tool in Phase 1. The Knowledge module supports the existing onboarding process; it does not replace it.

### 8.4 Search corpus boundary

Search includes all `published` articles that the searcher has visibility on. It excludes:
- Drafts and pending_review articles (those are visible only to author and reviewer).
- Approved-but-not-published articles (visible only to owner, reviewer, admins).
- Archived articles (visible via "Show archived" filter, off by default).
- Articles restricted to a department the searcher does not belong to.

Search latency target: under 300ms for the 99th percentile, leveraging the existing FTS index.

## 9. Lifecycle and stewardship

Single owner per article. The owner is the person responsible for keeping the article true. By default, the owner is the original author. Ownership can be transferred by the current owner, by an admin, or automatically when the current owner leaves the company.

Backup reviewer: every article also has a designated backup reviewer who can step in if the primary reviewer is unavailable. The backup is suggested by the system based on department and seniority but the author can change it at submission.

Decay rules: covered in §7. The short version is that the article ages, its confidence drops, and at some point it lands in the manager curator's "stale" queue.

Archival triggers (article moves from `published` to `archived`):
- Owner or admin explicitly archives.
- Auto-archive: process_policy_note that was not re-confirmed within 30 days of its annual flag.
- Auto-archive suggestion (not auto-execution): external_reference whose URL returned a 4xx or 5xx three times over a 30-day window. The system surfaces the suggestion to the owner; the owner archives or fixes.
- Auto-archive suggestion: an article that has not been opened (read view) in 18 months. The owner gets a "still relevant?" nudge.

Ownership transfer:
- Voluntary: owner opens the article and clicks "Transfer ownership". Picks a new owner. Notification goes to the new owner; they have 14 days to accept or decline. If they decline, ownership reverts to the original owner. If they ignore, ownership transfers automatically and the system records an "accepted by default".
- Departure: when an employee account is deactivated, all articles they owned land in an admin queue. Admin reassigns in bulk. Until reassigned, the articles stay readable; only the owner field shows "unassigned".
- Mergers: when two articles are merged (Phase 2 feature), the merged article keeps one owner (chosen at merge time) and the other becomes a contributor.

### 9.1 Why single owner instead of co-ownership

Joint ownership sounds collaborative but in practice means neither person is responsible. We have seen this fail in other knowledge bases: the article goes stale because each owner assumes the other will re-verify. Single ownership with explicit contributors is unambiguous. The contributor list still attributes work and shows up on the article header; only the responsibility for keeping the article true belongs to one person.

### 9.2 Decay metrics the curator actually uses

The curator's working view is a small dashboard (Phase 2, but the data model supports it from day one). It shows:
- Articles in their department whose last_verified_at is past the type-specific window.
- Articles whose owner has been deactivated and not reassigned.
- Tags used fewer than three times in the last 12 months.
- External_reference articles whose URL returned a non-2xx on the last health check (Phase 2 once URL checking ships).

Each row is one click to act on. The curator never has to compose a query.

### 9.3 Why we resisted the urge to add roles

We considered adding new roles: "Editor", "Contributor", "Auditor", and so on. Rejected. The portal already has admin and employee. Layering knowledge-specific roles on top creates a permissions matrix that nobody can keep in their head. Phase 1 uses only the existing roles plus the "senior employee" flag (proxied via team-lead role for the sprint).

If Phase 2 needs finer-grained roles, the right path is to look at what reviewers and curators are actually doing manually and bake that into permissions. Not to invent roles speculatively.

### 9.4 Stewardship over time

A successful Phase 1 produces roughly 30 to 50 published articles per month across the team. Over a year that is 360 to 600 articles. At that scale:
- The curator's weekly time grows from 30 minutes to about 90 minutes.
- The reviewer load on admins is roughly 8 to 15 articles per week (only internal_task_lesson, architecture_decision, process_policy_note hit them); the rest go to seniors.
- Storage is trivial. Audit trail is the biggest contributor and still under 1 GB per year at expected scale.

These numbers inform Phase 2 priorities. If the corpus grows faster, we promote saved searches, the stale-articles dashboard, and the URL health check to Phase 2 priorities. If slower, we focus on improving capture rate.

## 10. Success metrics

We measure both supply and demand. Supply metrics tell us whether authors are writing. Demand metrics tell us whether readers are finding and trusting the result. Targets are for three months after Phase 1 goes to general availability.

| Metric | Definition | Source | Target at 3 months |
|---|---|---|---|
| Publish rate | Articles in state `published` created per week | Knowledge state transitions | 8 to 12 new per week |
| Time-to-publish | Median hours from `draft` to `published` for articles that reach published | Audit log timestamps | Under 72 hours |
| Funnel completion (task-to-knowledge) | Drafts started from a reviewed Job that reach `published`, divided by total drafts started from a reviewed Job | Job-article links + states | 60 percent or higher |
| Funnel completion (external) | Same calculation for external_reference drafts | State transitions | 75 percent or higher (lighter touch) |
| Reuse rate | Article reads per published article per week, averaged | Read events (new instrumentation) | At least 1 read per article per week, median |
| Internal vs external ratio | Count of published internal_task_lesson plus how_to_guide plus troubleshooting_note, divided by count of published external_reference | State queries | Between 1:1 and 3:1 internal-heavy |
| Freshness | Fraction of published articles whose last_verified_at is within their type-specific staleness window | Computed | 80 percent or higher |
| Review SLA hit rate | Fraction of pending_review articles approved or returned within 5 working days | Audit log | 90 percent or higher |
| Rejection rate | Fraction of submitted articles that get rejected (not returned for revision, but flat rejected) | State transitions | Below 10 percent |
| AI structuring opt-in rate | Fraction of task-to-knowledge drafts where the author runs the AI structuring step | Feature usage log | Reported, not targeted in Phase 1 |
| AI structuring acceptance | Fraction of AI-structured drafts where the author accepts the AI version (all or per-section) before submission | Feature usage log | Reported, not targeted in Phase 1 |

Metrics we intentionally do not track in Phase 1:
- Time spent reading. We do not run page-level analytics that count engaged time. Privacy cost too high for the signal value.
- Per-user contribution leaderboards. We do not want to incentivize quantity over usefulness.
- Article ratings or thumbs-up. Defer to Phase 3 once we know whether the corpus has enough volume to be worth rating.

### 10.1 What we will look at weekly

The PM and KM specialist will hold a 30-minute weekly review during the first 8 weeks after launch. The fixed agenda:
- Publish rate this week vs target.
- Median time-to-publish this week.
- Any article that has been in pending_review for more than 5 working days (with reasons).
- Any rejected article (with the rejection reason).
- AI structuring opt-in rate (observational, not actioned).
- Two random articles read end-to-end by the reviewer to sense-check quality.

After 8 weeks the meeting drops to fortnightly.

### 10.2 What we will look at monthly

- Internal vs external ratio.
- Freshness percentage.
- Stale articles auto-flagged but not yet re-verified, by owner.
- Tag drift: tags appearing for the first time this month, tags unused for 12+ months.
- Any feature gap identified by reviewers ("I wish I could do X during review").

The monthly review feeds Phase 2 prioritization.

### 10.3 Anti-metric: what we will deliberately not chase

A few patterns we have seen fail elsewhere and will avoid:
- "Coverage" metrics ("we have an article for 80 percent of our client product lines"). These reward filling gaps with low-value content. We measure reuse instead.
- "Article quality scores" from an LLM. The LLM is a structuring assistant, not a quality oracle. A reviewer's approval is the quality signal.
- "Time on page" or scroll depth. Privacy cost, signal poor for short articles.
- Author rankings. Demotivates collaboration and incentivizes quantity.

If a stakeholder requests one of these, the answer is "we have a metric that already gives us the underlying signal; here is what it tells us".

## 11. MVP versus later

Phase 1 is the deliverable scope of the upcoming sprint. Phase 2 is the next sprint after that. Phase 3 is "later, only if data justifies it".

| Capability | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Six article types | Yes | - | - |
| Six statuses including ai_structured | Yes | - | - |
| Task-to-knowledge funnel from reviewed Jobs | Yes | - | - |
| External-reference funnel | Yes | - | - |
| AI structuring step (optional, opt-in) | Yes | - | - |
| Diff view of AI-structured vs raw draft | Yes | - | - |
| Review workflow with approve, request changes, reject | Yes | - | - |
| Approve and publish as distinct steps | Yes | - | - |
| Reliability tier on every article | Yes | - | - |
| Last verified date and decay rules | Yes | - | - |
| Audit log integration for all state changes | Yes | - | - |
| Reviewer SLA notifications at 5 working days | Yes | - | - |
| Single owner plus backup reviewer | Yes | - | - |
| Bulk ownership reassignment on employee departure | Yes | - | - |
| Article panels on Job and Client pages | Yes | - | - |
| Existing FTS search extended with type, status, reliability filters | Yes | - | - |
| Saved searches | - | Yes | - |
| Weekly digest email | - | Yes | - |
| Homepage widget of recent articles | - | Yes | - |
| Stale articles dashboard for curators | - | Yes | - |
| Article merge (two articles into one) | - | Yes | - |
| URL health-check job for external_reference (404 detection) | - | Yes | - |
| Inline comments on review (tied to article sections) | - | Yes | - |
| Reader flagging "this article is wrong" | - | Yes | - |
| Article ratings or thumbs | - | - | Yes |
| Per-department dashboards | - | - | Yes |
| Public read-only view for selected articles | - | - | Yes (subject to security review) |
| Cross-linking suggestions ("readers also viewed") | - | - | Yes |
| LLM-assisted reviewer pre-check (style and completeness lint) | - | - | Yes |

Phase 1 deliberately omits comment threads, ratings, and any reader-facing feedback channel beyond a basic "flag for review" link. The point of Phase 1 is to prove the funnels work, the review queue does not stall, and the AI step adds value without becoming a publishing authority. We will instrument the metrics in §10 from day one so that Phase 2 prioritization is data-driven.

### 11.1 What ships behind the feature flag

The existing flag `knowledge_articles_enabled` (default off) gates the Phase 3 §5.6 baseline. Phase 1 introduces a second flag `knowledge_funnels_enabled` (default off) that gates the two creation funnels, the AI structuring step, the four-tier reliability model, and the new state machine. Both flags must be on for Phase 1 to be visible. This gives the team a way to ship code to production without exposing the module until the rollout plan is ready.

The flag is binary, per environment. There is no per-user rollout in Phase 1. We considered a 20 percent rollout but rejected it: the corpus needs everyone's contribution from day one or it never reaches critical mass.

### 11.2 Rollback plan

If something is badly wrong:
- Flip `knowledge_funnels_enabled` off. Existing published articles remain visible (gated by `knowledge_articles_enabled`, which can stay on). The new state machine, the AI step, and the funnels disappear from the UI.
- Articles already in `ai_structured` or `pending_review` remain in those states. When the flag is flipped back on, they pick up where they left off.
- No data is destroyed by the flag flip. The flag is purely a UI gate.

### 11.3 Out-of-scope for Phase 1, clarified

- No bulk import of existing documentation. We are not migrating anyone's Confluence or Notion. Articles enter through the two funnels only.
- No API for external systems to read or write articles. The portal is the only interface.
- No webhook on article state changes. Phase 2 may add one if integrations are requested.
- No per-article custom fields. The schema is fixed in Phase 1; Phase 2 may add type-specific optional fields.

### 11.4 Worked example: a typical Phase 1 article from creation to publication

To make the abstract pipeline concrete, here is a walk-through of one realistic article. An IT engineer named Dana closes a Job that involved a customer's Microsoft 365 tenant where mailbox forwarding rules were silently failing because a Conditional Access policy excluded an admin app from MFA in the wrong way. The Job is reviewed and accepted by the CTO on a Tuesday afternoon.

- Tuesday 16:00. CTO marks the Job reviewed-accepted. The "Turn this into a Knowledge Article" button appears for Dana.
- Tuesday 16:20. Dana opens the button. The system creates a draft. Title is pre-filled with the Job title plus "(lesson)". Body is seeded with the Job description, resolution field, and three relevant worklog entries. Type is `internal_task_lesson`. Tags inherit "m365", "ca-policy", and the client tag.
- Tuesday 16:30. Dana decides to use AI structuring. She toggles it on. The system calls the LLM with the raw draft, the type, and the Job context (capped at 4000 tokens). After about 4 seconds, the AI-structured version appears in a diff view. The structured version has cleaner sections (Context, Symptom, Root Cause, Fix, What I Would Do Differently). Dana reads the diff, accepts the structured version, and edits the "Root Cause" paragraph because the AI got the policy condition slightly wrong.
- Tuesday 16:45. Dana sets reliability to validated (her initial guess) and last_verified_at to today. She picks CTO as reviewer. She clicks Submit for review. State moves from `ai_structured` to `pending_review`.
- Tuesday 16:46. CTO gets an in-app notification and an email.
- Wednesday 09:00. CTO opens the article. Sees the structured version, opens the "Show original raw writeup" toggle, scans the diff. The "AI-structured (author accepted)" badge is visible. CTO leaves no comments and clicks Approve. State moves to `approved`. CTO chooses "Publish now". State moves to `published`. Article visibility is "all employees" (default for non-client-restricted Jobs).
- Wednesday 09:01. Article URL is live. A small panel on the Job detail page links to the article.
- Friday 11:00. A different Helpdesk engineer hits the same symptom on another client and finds Dana's article via FTS search.

Time from Job-reviewed to published: about 17 hours of wall-clock, of which about 25 minutes was Dana's authoring and about 10 minutes was the CTO's review. This is the target experience.

### 11.5 What we expect to learn in the first 90 days

These are explicit predictions, written down so the team can check them against reality.

- The AI structuring opt-in rate will be between 30 percent and 60 percent of task-to-knowledge drafts. Higher than 60 percent means authors are using it as a crutch; lower than 30 percent means the diff UX is too painful.
- The AI structuring acceptance rate (author accepts the AI version) will be between 40 percent and 70 percent. Lower than 40 percent means the structuring is producing bad output; higher than 70 percent means authors are not reading the diff carefully.
- The funnel completion rate for task-to-knowledge will hit 50 percent in month 1, 60 percent in month 3. Lower means the funnel friction is too high; higher (>80 percent) means we are not being selective enough about which Jobs deserve articles.
- The external-reference funnel will produce roughly half the volume of the task-to-knowledge funnel. Higher would suggest the team is filing links instead of writing lessons; lower would suggest we made the external form too heavy.
- Median time-to-publish in month 1 will be over 5 working days as people learn the workflow. Month 2 should drop to under 3 days. Month 3 should hit the target of 72 hours.
- At least one article in the first 30 days will hit the "request changes" cycle three times and trigger admin escalation. This is expected; the round-trip cap exists because we know it will be tested.

### 11.6 Rollout choreography

Day 0: feature flag flip in production. Send a single email to all employees with a 2-minute video and a link to the strategy doc.
Day 1-7: PM and KM specialist watch the queue daily. Any review that sits past 3 working days gets a personal nudge.
Day 7: short retrospective with admins. Pain points captured. Any blocking bugs hotfixed.
Day 14: first weekly review meeting (per §10.1). All-hands update on metrics.
Day 30: end-of-month review. Decide which Phase 2 items to prioritize based on real friction observed.

The choreography is intentionally low-ceremony. The point of the early weeks is to keep the queue moving, not to run a launch campaign.

### 11.7 Decisions deferred to the sprint

The following are not in this document because they require either schema work (which is out of scope) or input from other working streams. The PM tracks them as sprint-level decisions:

- The senior employee flag (workflow §2.1 open question 4) requires a small user-record change. Either Phase 1 ships with the proxy mechanism (existing team-lead role plus an allowlist), or Phase 1 slips by a few days to ship the flag properly. Recommend the proxy.
- The AI quota cap number (workflow §10 open question 1). The implementation supports the cap; the value is a config knob. Pick 20 for launch, plan to revisit after 30 days.
- The "are AI runs counted against an organizational monthly budget" question (workflow §10 open question 7). Soft tracking yes, hard cutoff no for Phase 1.
- Whether re-verification by the original author can raise confidence (strategy §7 open question). Recommend no; require a different employee for elevation.

These four decisions are independent. They can be made in a single 30-minute meeting and recorded as appendix notes on this document.

### 11.8 What this document is not

It is not the database schema. The DB plan is owned by a separate working stream and will derive its tables from this document. Where this document says "field" it means a logical concept; the schema may store it as a column, a JSON blob, or a separate table.

It is not the UX wireframes. The UX plan is owned separately. Where this document mentions visible buttons or screens, it is naming the behavior; the visual design is in the UX plan.

It is not the test plan. QA owns that. Where this document says "validates X", QA writes the tests that prove X is validated.

It is not the security plan. Security owns that. Where this document says "visibility is restricted to department", security writes the access control checks that enforce it.

The four working streams must agree on this document or raise open questions. They must not silently re-interpret it.

### 11.9 Glossary of terms used in this document

- Author: the user who created the draft. May change via ownership transfer.
- Owner: the user currently responsible for the article. Same as author by default; can be transferred.
- Reviewer: the user assigned to review a submission. May be reassigned during pending_review.
- Backup reviewer: the secondary reviewer who can step in if the primary is unavailable.
- Contributor: a non-owner user listed on the article as having contributed.
- Reader: any employee with general read access.
- Curator: the manager-curator persona; a part-time role in Phase 1.
- Admin: a user with the existing portal admin role (CEO, CTO).
- Senior employee: a user flagged as senior within their department.
- AI structuring: the optional LLM-driven restructuring step on a draft.
- Reliability tier: the four-tier confidence label (verified, validated, single-source, anecdotal).
- Last verified: the timestamp and actor of the most recent re-verification.
- Staleness window: the per-type duration after which an article is flagged for re-verification.

These terms are used in this exact sense throughout both documents and any working-stream document that derives from them.

### 11.10 Reading order for new contributors to the sprint

For someone joining the sprint mid-way and reading these docs for the first time:
1. Read §1 and §3 of this document. That gives you the bet and the boundaries.
2. Read §4 of this document. That gives you the two creation paths in concrete terms.
3. Read §1 of `knowledge_review_workflow.md`. That gives you the state machine.
4. Skim §5 of this document for type-specific rules.
5. Read §9 of `knowledge_review_workflow.md` for the edge cases. Most operational questions are answered there.

Total reading time: roughly 45 minutes. After this, the working-stream documents (DB, UX, security, QA) should make sense in context.

### 11.11 What success looks like at the end of Phase 1

Three months after launch, with the metrics in §10 hitting their targets, success is: an employee who hits a new symptom searches the corpus first, finds a relevant article in under a minute, sees it is verified by a name they recognize, applies the fix, and adds a re-verification note. The cycle from "I have a problem" to "I have the answer" to "the answer is now slightly fresher" happens without anyone writing a long-form document. That is the whole point.
