# Knowledge Module - Review Workflow

Sprint: knowledge-sprint-2026-05
Owner: KM Specialist (acting) with Product and Tech Writing
Status: Draft for sprint review
Scope: Operational mechanics of the Knowledge review pipeline. Pairs with `knowledge_product_strategy.md`. Where the strategy doc and this doc disagree, raise an open question; do not silently diverge.

This document is precise on the mechanics. It is opinionated about defaults and explicit about the open questions that remain. The schema and code are out of scope for this sprint per the constraint at the top of the brief; we describe behavior, not migrations.

## 1. State machine

Six states, listed in normal forward flow:

1. `draft`
2. `ai_structured`
3. `pending_review`
4. `approved`
5. `published`
6. `archived`

The transitions, who can fire each, and the guards that must pass.

### Forward transitions

#### draft -> ai_structured
Who can fire: the author of the draft.
Action: author toggles "Use AI to structure this writeup" in the draft editor.
Guards:
- Article type is one of `internal_task_lesson`, `troubleshooting_note`, `how_to_guide`. AI structuring is not available for `external_reference`, `architecture_decision`, or `process_policy_note`.
- Body length is above the minimum (200 characters) so the LLM has something to work with.
- Article has at least a title and a type set.
- The author has not exceeded the daily AI-call quota (proposed cap: 20 structurings per user per day to prevent runaway cost; open question for sprint review).

#### draft -> pending_review
Who can fire: the author.
Action: author clicks "Submit for review".
Guards:
- All required fields are set: title, type, body (minimum length per type), at least one tag, owner, reviewer.
- Reliability tier is set (author's initial estimate).
- last_verified_at is set (defaults to now if author did not change it).
- For task-to-knowledge funnel articles: linked Job ID is set and the Job is in state "reviewed and accepted".
- For external_reference: URL passes basic well-formed check.

#### ai_structured -> pending_review
Who can fire: the author.
Action: author clicks "Submit for review" after accepting or rejecting the AI version (the author's decision is captured separately; either path lands in pending_review).
Guards: same as `draft -> pending_review` plus:
- The AI structuring run completed successfully (no half-finished states allowed to submit).
- If the author accepted the AI version, the working draft is the structured one. If the author rejected, the working draft is the original raw draft and the state actually returns to `draft` first (see backward transitions).

#### ai_structured -> draft
Who can fire: the author.
Action: author clicks "Reject AI version" or edits the raw text after the AI run.
Guards: none beyond ownership.
Notes: the AI version is discarded from the working draft but the structuring attempt remains in the audit log. The author can re-run AI structuring; each run is logged.

#### pending_review -> approved
Who can fire: the assigned reviewer, or any admin (override).
Action: reviewer clicks "Approve".
Guards:
- Reliability tier is set (reviewer may have changed the author's initial estimate).
- For `external_reference`: reviewer confirmed the URL resolves (checkbox on the approval screen).
- No outstanding review comments are marked "must address" (if the comments feature lands in Phase 2; for Phase 1 the comments are single free-text, see §4).
- Reviewer is not the author. If the only available reviewer is the author (small department, sole expert), an admin must approve instead. See §9 edge case.

#### pending_review -> draft (request changes)
Who can fire: the assigned reviewer, or any admin.
Action: reviewer clicks "Request changes" and leaves a comment.
Guards:
- A non-empty comment is required.
- The round-trip count for this article has not exceeded the cap (see §4).

#### pending_review -> archived (reject)
Who can fire: the assigned reviewer, or any admin.
Action: reviewer clicks "Reject".
Guards:
- A non-empty comment is required.
- Reviewer must confirm in a modal that they are rejecting outright rather than requesting changes.
Notes: a rejection does not delete the article; it archives it with a `rejected` sub-status flag so the curator can find it later. The author can clone the rejected article into a new draft if they want to try again.

#### approved -> published
Who can fire: the reviewer who approved, the author, or any admin.
Action: clicks "Publish now".
Guards:
- Article is in state `approved`.
- If the article cites a Job and the Job has been reopened since approval, a confirmation modal warns the publisher.
- For `process_policy_note`: an effective date must be set, and it cannot be in the past unless an admin confirms.

#### approved -> archived
Who can fire: the author or any admin.
Action: clicks "Archive" on an approved-but-unpublished article.
Guards: none.
Notes: covers the case where an article was approved but the world changed before publishing (e.g. the policy was scrapped). The article moves directly to archived without ever being published.

#### published -> archived
Who can fire: the owner or any admin.
Action: clicks "Archive".
Guards: a reason must be selected from a dropdown (superseded, no longer relevant, source link broken, policy retired, other).

#### published -> pending_review (re-verification triggered edit)
Who can fire: any employee who clicks "Re-verify" and then makes substantive edits.
Action: re-verifier saves edits that change the body, fix, or steps.
Guards: any non-trivial diff (more than whitespace or punctuation) triggers a re-review. A trivial edit just updates last_verified_at and last_verified_by without state change.
Notes: this is the only path that takes a published article back into review without first archiving. The previously published version remains visible to readers until the re-reviewed version is approved and re-published.

### Backward and lateral transitions allowed

- `draft -> archived`: author or admin can archive a draft. Same as deletion; the row stays for audit but is hidden.
- `ai_structured -> archived`: same as above.
- `archived -> draft`: admin only, used to resurrect a wrongly archived article. Adds a forced audit entry.

### Transitions explicitly disallowed

- `archived -> published` directly. Must go through draft -> review -> approved -> published.
- `published -> draft` directly. Use the re-verification flow described above, which routes through pending_review.
- `pending_review -> published` directly. Approval is a separate step (see §6).
- Any transition that bypasses the reviewer gate (no "publish without review" flow exists in Phase 1, not even for admins).

### Idempotency and double-fire

- All transitions are guarded by an optimistic version check. If two reviewers click "Approve" at the same time, only the first call succeeds; the second sees a "stale state" error and is shown the current state.
- The AI structuring call is debounced per-article. A second click during a pending call is a no-op.
- A "Save draft" action while the AI structuring call is in flight is allowed; the AI response, when it arrives, is merged on top of the saved version, with conflicts marked for the author to resolve.
- Notifications fire after the transition commits, not before. A failed transition produces no notification.

### State diagram in words

The state diagram has one entry point (draft) and three exit points (published, archived from approved, archived from published). The branching points are:
- From `draft`, you can branch sideways to `ai_structured` or forward to `pending_review`.
- From `pending_review`, you can go back to `draft` (request changes), forward to `approved`, or sideways to `archived` (reject).
- From `approved`, you can publish (forward) or archive (sideways). You cannot go back to draft from `approved` without first archiving or publishing; substantive edits on an approved article move it directly to `pending_review` via the re-review path described above.
- From `published`, only re-verification can move you backward to `pending_review`, and only via substantive edits. Otherwise the only forward move is `archived`.
- From `archived`, only admin resurrection can move you to `draft`.

### Concurrency and the "edit while in review" case

What happens if the author opens the article for editing while it is in `pending_review`:
- The author sees a read-only banner: "This article is in review. Wait for the reviewer or recall the submission to edit."
- A "Recall submission" button is visible to the author. Clicking it moves the article back to `draft`. The reviewer is notified that the submission was withdrawn. No round-trip is counted against the cap.
- An admin can also recall on behalf of the author, with a comment explaining why.

## 2. Reviewer selection rules

The system suggests a reviewer at submission time. The author can change the suggestion before submitting. The reviewer can reassign after submission (it stays in pending_review with a different assignee).

Selection rules by type:

- `internal_task_lesson`: admin (CEO or CTO). Senior employee allowed if the admin pool is unavailable for more than 2 working days, with an explicit admin-approved exception flag.
- `external_reference`: senior employee in the relevant department. Department is inferred from the tags (e.g. tag "vendor:Microsoft" routes to IT senior; tag "rfc" routes to R&D senior). Admin as fallback if no senior available in that department.
- `how_to_guide`: senior employee in the author's department. Cross-department guides (tagged with multiple department tags) require an admin reviewer.
- `troubleshooting_note`: senior employee in the author's department. Security-tagged notes ("security", "incident", "vulnerability") require an admin reviewer regardless.
- `architecture_decision`: CTO as primary. CEO as primary if the decision has business or budget implications (flagged by author at submission). The other admin acts as backup reviewer.
- `process_policy_note`: an admin who is not the author. If both admins are unavailable for 5 working days, escalate to the board contact (out of band; not in the portal).

Department-scoped vs global:
- "Senior employee" status is a flag on the user record. It is per-department. Being a senior in Helpdesk does not grant senior status in R&D.
- Cross-department articles (tagged with two or more department tags) escalate to admin automatically.
- Admins are global by definition.

Conflict-of-interest rule:
- Reviewer must not be the author.
- Reviewer must not be the line manager of the author for `process_policy_note` (separation of duties).
- Reviewer must not be the worker who was the second engineer on a "verified" reliability claim (no self-elevating to verified through review).

### 2.1 What happens when no suitable reviewer exists

This will happen in practice. A small department with one senior employee where that senior is on vacation, or a tag combination that does not match any current senior. The fallback ladder:

1. Look for the type-default reviewer (per the rules above).
2. If unavailable, look for any senior in the article's primary department.
3. If unavailable, look for any senior in any department (cross-department review is acceptable as a fallback for everything except architecture_decision and process_policy_note).
4. If still unavailable, default to admin.
5. If both admins are unavailable for 5 working days, the article waits. The author is informed it is "waiting for reviewer availability" rather than "in review". This wait does not count toward the 5-day SLA.

The system does not auto-publish or auto-approve under any circumstance. There is no quorum mechanism, no time-based auto-approval, and no "publish if no review in 30 days" rule. Articles wait until a reviewer acts.

### 2.2 Why we did not build a review-pool model

A pool model ("any senior in IT can pick this up") was considered. Rejected for Phase 1 because:
- It diffuses responsibility. Nobody owns the queue.
- It complicates the SLA calculation.
- The portal user base is small enough (single-digit seniors per department) that named assignment works fine.

Phase 2 may revisit if the queue depth grows beyond one reviewer's daily capacity.

## 3. AI structuring step

Precise contract for the LLM call. This step is optional and advisory. It exists to lower the cost of authorship for engineers who are good at solving problems and bad at writing them up. It must not become a publishing authority.

### When it is called

- Only on user action (the author opt-in toggle in the draft editor).
- Only for articles in state `draft`.
- Only for types where AI structuring is enabled: `internal_task_lesson`, `troubleshooting_note`, `how_to_guide`. The other three types have either too little content (external_reference) or too much organizational weight (architecture_decision, process_policy_note) to benefit from LLM restructuring.

### By whom

- The author of the draft. Reviewers cannot trigger AI structuring on an article they did not author. This avoids reviewers silently rewriting submissions.

### Input contract

The LLM receives:
- The raw draft body (text only, no images).
- The article type.
- The job context if the article was started from the task-to-knowledge funnel: job title, job description, job resolution field, relevant worklog entries. Capped at 4000 tokens total for the job context to bound cost.
- The tags currently on the draft.
- A system prompt instructing the model to produce structured fields per the type's expected structure (see strategy doc §5).

The LLM does not receive: the author's identity, any client PII beyond what is in the job, any other articles, or any access to the FTS index. The structuring step is stateless and per-call.

### Output contract

The LLM returns a JSON object with structured fields appropriate to the type. For `internal_task_lesson`:
- title (string, suggested)
- context_paragraph (string)
- symptom (string)
- root_cause (string)
- fix (string)
- what_i_would_do_differently (string)
- suggested_tags (array of strings, may overlap with existing tags)
- suggested_reliability_tier (one of the four tiers)

For `troubleshooting_note`:
- title, symptom, diagnostic_steps (ordered list), root_causes (ordered list, one entry per cause), fix_per_root_cause (parallel ordered list), prevention, suggested_tags, suggested_reliability_tier.

For `how_to_guide`:
- title, prerequisites, steps (ordered list), expected_output_per_step (parallel ordered list), common_failure_modes (list), rollback, suggested_tags, suggested_reliability_tier.

The system maps these fields into the draft editor's section layout. Unknown or extra fields from the LLM are dropped silently and logged for offline review.

### What the reviewer sees

When the reviewer opens a pending_review article, they see:
- The current working draft (which is either the raw author version or the AI-accepted version).
- A toggle "Show original raw writeup" if the author accepted the AI version. Opening the toggle shows a side-by-side diff: raw on the left, structured on the right, with the structured side highlighted in a different background.
- A small badge "AI-structured (author accepted)" or "AI-structured (author rejected)" or no badge.
- The audit trail panel shows the AI structuring call timestamp and the LLM model identifier, so the reviewer can identify which version of the structuring assistant produced the output.

### What if the LLM fails

See §9 edge cases.

### 3.1 What we tell the model in the system prompt

The system prompt makes four things explicit:
- The output is advisory. The author may reject it. Do not invent facts not present in the input.
- Preserve any client names exactly as they appear; do not anonymize. The author and reviewer handle redaction.
- Do not change technical terms (product names, error codes, command syntax) even if they look misspelled. Lift them verbatim.
- The output must validate against the JSON schema for the article type. Missing required fields fail the call.

These are constraints on the LLM, not on the author. The author can rewrite anything after the call.

### 3.2 Versioning the prompt and the model

Both the system prompt template and the model identifier are versioned. The audit row for an AI structuring call records both. If we change the prompt, articles structured under the old prompt remain unchanged; they are not retroactively re-structured.

When we change the model:
- The change is announced in advance to the author pool (one email, one in-app banner).
- The previous structuring output for any article in flight is preserved; the new model is used only for new structuring calls.

### 3.3 Latency and timeout budget

The structuring call must return within 30 seconds. After 30 seconds, the call is treated as failed (per §9.1). We chose 30 seconds because:
- Most calls will complete in 3 to 10 seconds.
- A 30-second ceiling is the longest authors are willing to wait without abandoning.
- A 30-second ceiling is short enough that a queue cannot pile up too deep.

If we observe routine calls taking more than 15 seconds, that is a signal to revisit either the prompt or the model.

### 3.4 Cost ceiling

A single structuring call has a hard token budget: 4000 tokens of input context plus up to 2000 tokens of output. Calls exceeding either budget fail rather than truncate. This is to prevent a runaway author who pasted an extraordinarily long draft from running up cost unexpectedly.

## 4. Comments and feedback loop

Phase 1 implements the simpler version of comments: each "Request changes" transition carries a single free-text comment from the reviewer. Multiple comments accumulate as a thread on the article, ordered chronologically. Inline comments tied to specific article sections are Phase 2.

### Round trips

Cap: 2 full cycles of "request changes -> resubmit". On the third resubmission, the system automatically escalates to admin review even if the original reviewer was a senior employee. This prevents articles from ping-ponging.

Counter rules:
- A cycle is one `pending_review -> draft -> pending_review` round trip.
- The counter resets when the article reaches `approved` or `archived`.
- Admin can manually reset the counter with a comment explaining why (e.g. the article was significantly rescoped).

### Escalation path

- After the cap is hit, the next submission auto-routes to admin.
- If the admin also requests changes, the next round goes to the other admin (if there is one) as the backup reviewer.
- If both admins request changes on the same submission, the article is rejected by default and the author is notified that the topic may not be suitable for a knowledge article in its current form. The author can clone into a new draft and start over.

### Comment requirements

- Non-empty.
- Minimum 20 characters. Discourages "fix this" with no context.
- Reviewer can mark a comment as "must address" (Phase 2 only; Phase 1 treats all comments as advisory).

### 4.1 Why a hard cap and not a soft cap

A soft cap (warning at cycle 3, no enforcement) would not change behavior; reviewers and authors who are already deep in a ping-pong are unlikely to read the warning. A hard cap forces escalation, which surfaces the underlying disagreement to a human who can make a final call.

The cap is 2 because we observe that the most useful review feedback usually fits in one round, occasionally two. By round three, the article has either become someone else's article or the disagreement is editorial rather than factual. Either way, an admin needs to step in.

### 4.2 What "must address" will mean in Phase 2

When inline comments ship, the reviewer can mark any comment as "must address". An article cannot transition out of `pending_review` to `approved` with unresolved must-address comments. This forces the author to either fix the issue or push back explicitly ("I disagree, here is why") via a reply.

For Phase 1, the same effect is achieved more crudely: the reviewer simply refuses to approve until the author addresses the comment. Less visible, but functionally equivalent at this scale.

## 5. SLAs and gentle prods

Reviewer SLA: 5 working days from submission to first action (approve, request changes, or reject). Working days exclude weekends and Israeli public holidays (use the existing holiday calendar already in the portal).

Notification cadence:
- Day 0 (submission): reviewer gets an in-app notification and an email.
- Day 2 (no action): in-app reminder only.
- Day 4 (no action): in-app and email reminder.
- Day 5 (no action, end of SLA): escalation notification to admins, in-app and email. The original reviewer also gets one final ping.
- Day 7 (still no action): the article is automatically reassigned to admin. The original reviewer is notified of the reassignment.

Author-side prods:
- When the reviewer requests changes, the author gets in-app and email immediately.
- If the author has not resubmitted after 10 working days, an in-app reminder fires. After 20 working days with no action, the draft is auto-archived. The author is told 5 days before auto-archive so they can save it.

Mute and snooze:
- Reviewers can snooze a single article for up to 3 working days (e.g. "I am on vacation Monday, will review Thursday"). Snooze counts toward the SLA clock; it does not pause it. This is intentional to keep the SLA honest.

### 5.1 Why working days and not calendar days

Calendar days would penalize reviewers who happen to have an article submitted on a Friday afternoon. Working days give a fair budget regardless of submission timing. The Israeli holiday calendar is the existing one used by the portal's Job scheduling; no new calendar is introduced.

### 5.2 Why 5 working days specifically

Three to four working days is too aggressive for a senior with a normal workload. Seven working days is too long; authors will forget the context. Five days is the smallest budget that does not require reviewers to drop other work. We will revisit if data shows the budget is consistently missed.

### 5.3 Why we deliberately do not pause the SLA clock

Pausing the clock when the author goes silent feels fair but produces a quiet pathology: articles sit in `pending_review` for weeks because nobody is technically over-SLA. The current rule keeps the clock running so that no article hides for too long. If the author is genuinely unavailable, the right move is to recall the submission, not to pause time.

## 6. Approval vs publish

These are deliberately separate steps. Reasons:
- Some articles are slow-burn: an admin approves the content but wants to delay publishing until a related Job is also closed, or until a coordinated change rolls out.
- Some `process_policy_note` articles have a future effective date.
- Approval is the gate where the reviewer's editorial judgment is recorded. Publishing is the gate where the article becomes visible to all employees. Conflating them weakens both signals.

Mechanics:
- After approval, the reviewer sees two buttons: "Publish now" and "Save approved (publish later)".
- The approved-but-not-published article is visible to its owner, the reviewer who approved it, and any admin. It is not visible in search results to general readers.
- An approved article can be edited only by the owner. Substantive edits move it back to draft and reset the review counter. Trivial edits (typos, formatting) are allowed without re-review.
- An approved article that sits unpublished for 30 working days fires a reminder to the owner.

### 6.1 Why this separation matters operationally

The reviewer's job is editorial: is the content true, well-structured, and appropriate for publication. The publisher's job is timing: is now the right moment. These are different judgments. A reviewer might approve content that is months away from being relevant. Forcing approval and publication together would either pressure reviewers into delaying approval (queue contamination) or pressure publishers into immediate publication (premature exposure).

### 6.2 Who can typically publish

- The reviewer who approved (most common path).
- The author (if they want to coordinate with a related change).
- Any admin (override path).

The Phase 1 UI surfaces all three as a single "Publish now" button visible to anyone with publish permission. We do not show a "scheduled publish at future date" feature in Phase 1; that is a small request in Phase 2.

## 7. Archive and rescind

### Archive

- Triggered by owner, admin, or one of the auto-archive rules in strategy doc §9.
- The article moves to state `archived` and is hidden from default search results.
- Owner and admins can still view archived articles via a "Show archived" filter.
- Readers who held a bookmark to the article URL see a "This article is archived" page (see URL behavior below).

### Rescind

A stronger version of archive used when an article was wrong in a way that needs visible correction. Rescind is admin-only.

- The article moves to state `archived` with a `rescinded` sub-flag.
- A short rescission note is required. This note becomes the body of the archived view.
- A link to the replacement article (if any) is recorded in the `superseded_by` field.

### URL behavior

When a reader navigates to an archived or rescinded article URL:

- If archived (normal): the system returns a soft-hide page (HTTP 200) showing "This article was archived on {date}. Last published version is available to admins." with a search link to find related current articles. Soft-hide rather than 410 Gone because employees often have bookmarks and we want them to land somewhere useful, not on an error.
- If archived because superseded: redirect (HTTP 302) to the superseding article. Show a small banner on the new article: "You were redirected from a superseded article."
- If rescinded: HTTP 410 Gone with the rescission note in the body. Search engines (we do not have any external indexers; this is portal-internal, but the principle stands) and link-checkers treat 410 as permanent.

Open question: do we 410 on rescinded articles even though there is no external indexing. Argument for: the semantic is correct and any future external indexer will behave right. Argument against: extra UX rule with no immediate payoff. Defaulting to 410 in the spec; flag for sprint review.

### 7.1 What the soft-hide page actually contains

For non-rescinded archives, the soft-hide page renders inside the portal layout (same nav, same auth gate) with:
- The article title and type.
- A "This article was archived on {date} by {actor}" sentence.
- The archive reason (chosen from the dropdown).
- A search link pre-filled with the article's tags.
- A link to the superseding article, if any.

For admins only, a "View archived content" button reveals the last published body. This is for forensic use, not for sharing.

### 7.2 Why we keep archived articles instead of deleting

Three reasons:
- The audit trail of state transitions requires the article row to exist.
- Linked Jobs and Clients reference articles by ID; deleting would orphan those links.
- The history is small in storage terms; deletion buys little.

The only deletion path is admin-initiated hard delete for legal or compliance reasons (e.g. GDPR right to erasure of personal data inside an article). Hard delete is logged separately from archive; the row's metadata is retained but the body is replaced with "Deleted on {date}".

## 8. Audit trail requirements

Every state transition writes an audit row. The existing audit log viewer (built in earlier phases) must show these rows without modification.

Each row must contain:
- Timestamp (UTC).
- Actor (user ID and display name at time of action).
- Article ID and version number.
- From-state and to-state.
- Transition reason (free text where required, dropdown where applicable, e.g. archive reasons).
- Diff: a structured diff of the article fields that changed in this transition. For state-only transitions, the diff is empty.
- AI-call metadata (if the transition is AI structuring): model ID, prompt template version, token counts (input and output), latency.

Diff storage:
- Field-level diffs for title, type, tags, owner, reviewer, reliability, last_verified_at.
- Body diffs stored as unified diff with a 3-line context window. Storage cost is acceptable given expected volume; revisit if monthly storage growth exceeds 100MB.
- AI-structured drafts store both the raw and structured versions as full snapshots, not just diffs, because the diff is the whole point and we want it to be readable months later without reconstruction.

Retention of audit rows: 7 years. This matches the existing portal-wide audit retention for Israeli compliance and is well in excess of what we would need for KM purposes alone.

What appears in the audit log viewer:
- A filter chip "Module: Knowledge" surfaces only KM-related audit rows.
- Each row links to the article (or to the soft-hide page if archived).
- Diffs render with the same diff component already used for Jobs and Tickets, so the viewer experience is consistent.

### 8.1 Why we capture AI metadata in the audit row

Reviewers will sometimes look at an article weeks or months after publication and ask "was this AI-touched, which model, which prompt". Having that recorded means we can answer the question without re-deriving it from logs. It also lets us, in the future, identify articles structured under an old prompt version and selectively flag them for re-review if the prompt was found to produce systemic bias.

### 8.2 What we do not put in the audit row

- The reviewer's draft comments that were never sent.
- Search queries the reader ran.
- Read events ("user X opened article Y at time T"). Read events are recorded in a separate analytics table with a shorter retention because the audit log retention (7 years) is overkill for analytics.

### 8.3 Audit row visibility

KM audit rows are visible to:
- Admins (always).
- The article's owner.
- The article's current reviewer.

Other readers do not see the audit trail. This is to avoid social pressure during reviews ("everyone can see how many times you rejected this").

## 9. Edge cases

The audit asks for 10 or more edge cases with resolutions. Here are 14, with proposed handling. Anywhere the resolution is contested, it is also called out in §10.

### 9.1 AI structuring call fails

Scenario: author opts in to AI structuring; the LLM call errors out (timeout, rate limit, malformed response).

Resolution: the system shows a friendly error in the draft editor ("Structuring assistant is unavailable. Your draft is unchanged. Try again later or submit without structuring."). State remains `draft`. Audit row records the failed attempt with the error class. Quota counter does not increment. The author can retry; the system applies exponential backoff on repeat retries within a single session.

### 9.2 AI structuring returns malformed or partial output

Scenario: LLM returns JSON that is missing required fields, or includes fields that the schema does not expect.

Resolution: the orchestration layer validates against the expected output schema for the type. Missing required fields cause the run to be treated as a failure (see 9.1). Extra fields are dropped silently and logged. Truncated output (length-cap reached mid-response) is treated as a failure.

### 9.3 The original Job is cancelled or reopened after the article is published

Scenario: an article in the task-to-knowledge funnel was published citing Job X. Later, Job X is cancelled or reopened (e.g. the resolution turned out to be wrong).

Resolution:
- If the cited Job is cancelled: a banner appears on the article ("The job this article is based on was later cancelled. Owner please review."). Owner is notified. The article does not auto-archive; the lesson may still be valid even if the specific job was cancelled.
- If the cited Job is reopened: a banner appears ("The job this article is based on has been reopened. The fix described here may not be complete."). Owner is notified. Reliability tier is automatically dropped one notch (verified -> validated, validated -> single-source). Owner can restore the tier after re-verification.

### 9.4 Two authors collaborate on one article

Scenario: two engineers worked the Job together and both want to be on the article.

Resolution: Phase 1 supports one owner plus one or more contributors. The owner is the primary author; contributors are listed in a "Contributors" field on the article. Contributors do not have edit rights by default; the owner can grant edit rights individually. Both names appear on the published article. The "started from job" button is visible to all assignees of the Job; whoever clicks first becomes the owner, and the others can be added as contributors.

### 9.5 The reviewer is the same person as the author

Scenario: the system suggested an author as their own reviewer (small department, sole expert). The author cannot submit without changing the reviewer.

Resolution: the submission gate blocks reviewer == author. The system suggests the next most appropriate reviewer (next senior in the department, then admin). If only the author has subject-matter expertise, admin review is forced.

### 9.6 External link returns 404 after publication

Scenario: an external_reference's URL starts returning 404. We do not have a URL health-check job in Phase 1 (it is Phase 2), but a reader notices and uses the "flag for review" action (also Phase 2). Phase 1 path:

Resolution (Phase 1, manual): a reader notifies the owner out of band (Slack, in person). The owner opens the article, confirms, and either updates the URL (substantive edit, re-enters review) or archives the article with reason "source link broken". Phase 2 will automate detection.

### 9.7 Two articles cover the same topic

Scenario: a reader (or curator) realizes there are two near-duplicate articles.

Resolution (Phase 1): no in-app merge tool exists in Phase 1. The curator opens both, picks the better one, and manually archives the worse one with reason "superseded" and a `superseded_by` link to the kept one. Readers on the archived URL get redirected (see §7). Phase 2 will provide a real merge UI that preserves both contributor histories.

### 9.8 Reviewer goes on vacation mid-review

Scenario: reviewer has an article in pending_review when they go on leave. SLA clock keeps ticking.

Resolution: reviewer can use the snooze (see §5) for up to 3 working days. For longer absences, the reviewer (or an admin) reassigns the article to the backup reviewer. If neither happens, the SLA escalation kicks in at day 5 and admin gets notified at day 7 with auto-reassignment.

### 9.9 Article is approved but never published

Scenario: an article sits in `approved` state indefinitely because the publisher forgot.

Resolution: at 30 working days unpublished, the owner gets a reminder. At 60 working days, an admin gets a reminder. At 90 working days, the article is auto-archived with reason "approved but not published in 90 days" and an audit note. The owner can resurrect via admin if needed.

### 9.10 Author leaves the company while a draft is in flight

Scenario: author's account is deactivated while one of their articles is in `draft`, `ai_structured`, or `pending_review`.

Resolution:
- `draft` or `ai_structured` from this author: lands in an admin queue. Admin can promote a teammate to owner (preserving the draft) or archive it.
- `pending_review` from this author: the reviewer is notified and proceeds. If approved, the article still publishes; the owner field shows the original author with a "deactivated" annotation, and an admin assigns a new owner.
- For `published` articles owned by the departing author, see strategy doc §9: bulk reassignment by admin.

### 9.11 Reviewer rejects an article that the author considers important

Scenario: author disagrees with a rejection.

Resolution: there is no in-app appeal flow in Phase 1. The author can clone the rejected article into a new draft and resubmit; the new submission has its own reviewer assignment, which the author can change at submission time. If the author wants the same article reviewed by a different reviewer, they pick a different reviewer on the clone. Admin override is always available if a second opinion is needed.

### 9.12 Sensitive client data ends up in a published article

Scenario: an `internal_task_lesson` cites Client X explicitly when it should have been anonymized.

Resolution: any admin can immediately move the article to `archived` with the `rescinded` sub-flag. Owner is notified. The rescission note explains the redaction need. A cleaned version can be drafted from scratch (cloning is allowed but the clone is also reviewed before publication). Phase 2 adds a "redact" workflow that retains the article ID and history but replaces the body.

### 9.13 AI structuring quota exhausted

Scenario: author hits the daily AI-call cap.

Resolution: the toggle is greyed out with a tooltip ("Daily structuring limit reached. Try again tomorrow or submit without structuring."). State remains `draft`. Admin can grant a one-time quota bump if necessary; this is rare and goes through admin tooling, not the article editor.

### 9.14 Article's linked Job has restricted visibility

Scenario: the Job is visible only to a specific client's account team, but the lesson would be useful firm-wide.

Resolution: the article inherits the Job's tags but not its visibility. Article visibility is set explicitly at draft time and defaults to all employees. The reviewer is responsible for catching cases where article content reveals client-confidential information that should not be firm-wide; the reviewer can either send back for redaction or restrict the article's visibility to a department. Phase 1 supports two visibility levels: "all employees" and "department only". Finer-grained visibility is Phase 2.

### 9.15 Author tries to submit without setting reliability

Scenario: the author leaves the reliability field empty and clicks Submit for review.

Resolution: the submission gate fails. The author sees an inline error pointing to the empty field. The system does not infer a default; we want the author to make a conscious choice. The default suggestion shown in the field is "validated" (per the strategy doc), but the author must explicitly select it.

### 9.16 Reviewer tries to approve without confirming the URL on an external_reference

Scenario: reviewer clicks Approve without ticking the "URL resolves" checkbox.

Resolution: the approval gate fails. The reviewer sees a tooltip on the disabled Approve button: "Confirm the URL resolves before approving." This is the simplest enforcement; we considered server-side fetch but rejected it for Phase 1.

### 9.17 Reader opens a published article whose owner is deactivated

Scenario: the author left the company two months ago. The article was reassigned to admin queue but not yet to a new owner.

Resolution: the article still displays, with the owner field showing "Unassigned (former owner: Dana Levy)". The reader sees a yellow banner: "This article is awaiting a new owner. Information may be out of date." The article still ranks in search but the banner is the warning.

### 9.18 Re-verification finds a substantive change is needed

Scenario: a teammate opens an article, runs through the steps, finds that step 4 has changed because the vendor updated their UI. The teammate edits step 4 and updates the last_verified date.

Resolution: any non-trivial diff moves the article from `published` back to `pending_review`. The published version remains visible to readers until the re-reviewed version is approved. The original owner is notified that a teammate proposed edits. The new edit is reviewed under the normal rules.

### 9.19 Article tagged with a tag that no longer exists in any other article

Scenario: an article uses a tag that has no other articles. Phase 1 has no tag merge UI; the tag persists.

Resolution: the tag remains valid. Phase 2 will add a curator's tag-management view that surfaces orphan tags and offers merge or rename actions. For Phase 1, orphan tags are an observable curiosity, not a defect.

### 9.20 Reviewer is also the owner's line manager

Scenario: the suggested reviewer happens to be the author's line manager. This is fine for most types but creates a problem for `process_policy_note`.

Resolution: the conflict-of-interest rule fires at submission for `process_policy_note`; the reviewer slot is blocked and the system suggests a different admin. For other types, line management is not a conflict and the review proceeds.

## 10. Open questions for the sprint

These are the calls the sprint must make before implementation. They are deliberately framed as decisions, not exploration.

1. **AI quota cap.** Proposed 20 structurings per user per day. Is the right number 10, 20, or 50? The cost model and the historical pace of internal_task_lesson creation will tell us; we do not have that data yet. Need a number that prevents accidental loops without throttling normal use.

2. **Should re-verification by the original author count as re-verification?** The strategy doc (§7) proposes "yes, but cannot raise confidence above validated". The KM specialist prefers "no, must be a different person". Decide before publishing the lifecycle rules.

3. **Soft-hide vs 410 Gone for archived articles.** Strategy and workflow docs propose soft-hide as default with 410 only for rescinded. Some reviewers may want 410 across the board to "make it final". Decide once.

4. **Senior employee definition.** Workflow §2 assumes a per-department "senior" flag on the user record. We do not have that flag today. Either add it (requires schema change, which is out of scope this sprint and would defer Phase 1) or use the existing role hierarchy as a proxy. Proposal: in Phase 1, "senior" means anyone with the existing "team lead" role plus a hand-picked allowlist managed by admin. Confirm.

5. **Round-trip cap.** Proposed 2 cycles before mandatory admin escalation. Some reviewers will want 1, some will want 3. Decide once and document.

6. **External-reference URL fetching at submission.** Should the system attempt server-side fetch to confirm the URL resolves at submission time, or stay client-side only. Strategy doc §4.2 leans client-side for Phase 1. Confirm.

7. **Are AI structuring runs counted against an organizational budget separately from individual quotas?** If yes, who owns the budget alert and what happens when it is exceeded mid-day. Proposal: monthly soft budget tracked by admin, no hard cutoff in Phase 1, hard cutoff added in Phase 2 if usage warrants.

8. **Visibility default for task-to-knowledge articles.** Strategy doc defaults to "all employees". Workflow §9.14 raises the case where the underlying Job is client-confidential. Proposal: in the task-to-knowledge funnel, if the linked Job has restricted Client visibility, the article visibility defaults to "department only" rather than "all employees" and the author must explicitly elevate. Confirm or reject.
