# Experimentation and Phasing Playbook

Audit scope: how each planned improvement to the Skyware internal management portal should be rolled out, validated, and rolled back. The portal is an internal tool with a small user base (likely under 20 employees). Classical A/B testing is rarely appropriate at this size. This document defines what to use instead.

## 1. Executive Summary

Most of this portal does not need experimentation infrastructure. With fewer than 20 users, almost no change can be A/B tested with statistical significance. A two-week test on a 50/50 split gives roughly 10 users per variant. Even a large delta in task completion time would not clear a confidence threshold. Building randomized assignment, exposure logging, and statistical analysis on top of that would be ceremony without payoff.

What is appropriate at this size:

- Staged rollout (admin first, then department leads, then everyone) gated by feature flag.
- Shadow mode for mutation changes (run the new logic in parallel, log differences, do not act on the result).
- Dual-write for data-shape changes where a backout must be possible without data loss.
- Dry-run for any money- or document-issuing flow (build the artifact, do not commit, accountant reviews).
- Qualitative signal collection (weekly retro, structured 1:1 interviews, ticket triage) as the primary measurement.
- Expand-migrate-contract for database schema changes (especially relevant: the project currently has zero baseline migrations under `prisma/migrations/`, so the first real migration is itself a hardening event).

A/B testing is only worth setting up if the org grows past ~50 active daily users on a stable feature surface. Until then, qualitative wins. State that openly: the playbook below is not "we don't measure," it is "we measure with the instrument that fits the sample size."

There is no existing experimentation infrastructure. Current feature flags are global, binary, and database-stored (see `lib/feature-flags.ts`). They are sufficient as the on/off primitive but lack per-user targeting, ring assignment, and exposure logging. Section 2 covers exactly what to add and what not to add.

## 2. Feature-Flag State

### 2.1 Current implementation

- `lib/feature-flags.ts` exports `getFeatureFlag(key)` and `getFeatureFlags(keys)`. Both read a Boolean from the `FeatureFlag` Prisma model and return `false` when the row is missing.
- The `FeatureFlag` model (`prisma/schema.prisma` line 799) has columns: `id`, `key`, `enabled`, `description`, `updatedByUserId`, `createdAt`, `updatedAt`. No targeting, no ring, no variant, no rollout percentage, no schedule.
- Toggling happens through `PATCH /api/admin/feature-flags/[key]` (`app/api/admin/feature-flags/[key]/route.ts`), admin only, audit logged via `writeAudit`.
- UI lives in `components/admin/FeatureFlagSection.tsx`. The receipt finalize toggle has an extra confirm dialog, which is the right pattern for irreversible flags.
- Seed lives in `prisma/fixtures/feature-flags.json` and seeds three flags: `receipt_finalize_enabled`, `financial_documents_module`, `agent_control_center_module`.
- Two production callers exist: `app/(portal)/financial-documents/page.tsx` and `app/(portal)/agent/page.tsx`. Each gates a placeholder page. The `receipt_finalize_enabled` flag is seeded but has no caller in code yet, because the receipts finalize endpoint is still a stub (`docs/pilot-launch-checklist.md` confirms this).

### 2.2 Gaps

- No per-user or per-role targeting. Every flag is global. There is no way to enable a feature for "admins only" or for "the helpdesk department" without writing a code-side guard alongside the flag check.
- No rollout percentage. Cannot do "10% of users see X."
- No environment scoping. Same flag value is read in dev, staging, and prod. A dev-only flag would have to be enforced through process discipline plus the admin UI, not the schema.
- No exposure log. There is no record of who saw which flag value when. The audit log captures flag toggles, not flag reads. That is fine for compliance, insufficient for post-hoc analysis.
- No expiration or stale-flag cleanup. Flags accumulate forever.
- No client-side delivery. Flags are read server-side in React Server Components and API routes. A client component would need to receive the value as a prop. This is fine for SSR-first Next.js, but worth knowing.

### 2.3 Recommended additions

Keep the changes minimal. Do not build a feature-flag platform. Add only what the next 12 weeks of rollouts need.

1. Add a `role` or `department` allowlist field. Either a JSON column on `FeatureFlag` of shape `{ roles?: string[], departments?: string[], userIds?: string[] }`, or a sibling table `FeatureFlagAudience`. The first is simpler for the volume involved. Wrap reads in a helper that takes the current `SessionUser` and returns the resolved boolean. Example signature:

       getFeatureFlagFor(key: string, user: SessionUser): Promise<boolean>

2. Add an `environment` enum field (`development | staging | production | all`). Default `all`. Lets the same flag have different defaults in different deployments without forking the seed.

3. Add a `notes` audit field on `FeatureFlag` separate from `description`. `description` is what the user sees in admin UI. `notes` is "why was this toggled on 2026-06-03 by the CTO, what ring is it in, when does it expire." Append-only.

4. Add a `stage` enum (`dark | shadow | pilot | rollout | ga | retired`). This is the rollout-state label, distinct from `enabled`. Lets the admin UI sort flags and lets the rollback playbook be triggered by stage rather than by toggle history.

5. Add a server-side helper `isInRing(user, ring: "admin" | "dept-lead" | "all")` to reuse the same ring definitions across many flag-gated features. The ring definitions belong in code, not in the database, so they live in version control and code review.

Do not add: percentage rollouts, randomized assignment, exposure logging, variant assignment, holdouts, sequential testing, or anything that smells like Optimizely-lite. The sample size will not support it for the foreseeable future.

## 3. Phasing Framework

These are the labels used throughout the per-change-class sections. Each change goes through some subset of these; not every change needs all.

### 3.1 Dark deploy

The code ships to production but no user can reach it. Either the route is admin-gated and unlinked, or it is hidden behind a flag that is off for everyone. Goal: verify the build, migration, and import graph in production without exposing behavior. Useful for new pages and new modules.

### 3.2 Shadow mode

The new logic runs in parallel with the old logic on real traffic. The result is logged but discarded. Outputs of old and new are compared offline. Useful for changes that compute (SLA targets, burn-rate projections, search scoring) where correctness matters but mutations can wait. Implement either by computing both in the same request and writing both to a comparison log table, or by piping the same input through a separate code path triggered by a flag like `sla_v2_shadow_enabled`.

### 3.3 Staged rollout (ring deploy)

The flag is enabled for ring 1 (admins, two people), then ring 2 (department leads, four to six people), then ring 3 (everyone). Move between rings on a schedule with explicit gates. Pilot ring sees the change first. Each ring is at least 48 hours, longer if the change touches workflows people only run once a week.

### 3.4 Pilot ring

A named subset of users explicitly told "you are testing this." They get a direct channel back to the change owner. Pilot ring is not a statistical sample; it is qualitative feedback collection. Two to four users is typical.

### 3.5 Full rollout

All employees see the change. Flag stays in place for at least two weeks after full rollout before being marked `retired`. Removing the flag too quickly removes the ability to back out without a redeploy.

### 3.6 Backout

A rollback path that does not require a code release. For additive changes this is "turn the flag off." For mutating changes this is the change-specific procedure documented in Section 6. Backout must be testable in staging before the change goes to ring 1.

## 4. Per-Change-Class Validation Patterns

### 4.1 Additive UI / UX changes

Examples: saved views on Jobs and Clients lists, global search bar, hourly-bank burn-rate visual, severity-vs-priority display, job tags surfaced, overdue aging buckets on admin dashboard, RTL polish, empty-state copy.

Pattern: flag + staged rollout. Skip shadow mode.

Steps:
1. Ship behind flag, default off.
2. Enable for admin ring. Hold 48 hours.
3. Enable for full rollout. Hold two weeks.
4. Mark flag `retired`. Remove flag check in a follow-up PR.

Signals:
- No new client-error spikes in the page (manual check on browser console / network tab during admin ring).
- One round of qualitative feedback from at least two pilot users: "is this useful, is anything broken, is it in your way."
- Admin can find and use the feature without being told where it is. Tested in week-2 retro.

Rollback: turn flag off. No data implications.

### 4.2 Read-only analytics and dashboards

Examples: Employee Statistics page, per-employee and business sections, admin dashboard aging-bucket strip, statistics CSV export, future "renewal radar" or "underpriced-client report."

Pattern: flag + qualitative review. Skip A/B, skip staged. Get the numbers right first.

Steps:
1. Ship behind flag, default off.
2. Internal QA pass: spot-check three numbers against a hand-computed reference. For statistics this means picking three employees and recomputing their median time-to-`working_on_it` by hand from the audit log.
3. Show to admin ring with explicit "do not act on these numbers yet" framing.
4. After 48 hours and admin sign-off on accuracy, full rollout.
5. Mark `retired` after two weeks.

Signals:
- Hand-computed reference matches displayed value within rounding tolerance.
- No admin reports a number that "looks wrong" without a satisfying explanation.

Rollback: turn flag off. Underlying data is not mutated by these views, so there is no cleanup.

Caveat: CSV export needs explicit verification that the export reflects the same numbers shown on screen. Off-by-one between display filter and export filter is the most common bug in this class.

### 4.3 New mutation flows

Examples: job assignment refinements, take-from-hub concurrency tightening, mark-done flow changes, time-session pause / resume edge cases, audit-log middleware changes, payment status transitions, new email-to-job manual form.

Pattern: shadow + dual-write where possible, then staged rollout.

Steps:
1. Ship the new logic behind a flag, default off. The new code path either runs in shadow mode (compute, log, do not commit) or writes to a parallel column or table (dual-write) for one or two days.
2. Compare shadow output to current behavior daily. Investigate every divergence. Most divergences will be the new logic catching a bug in the old logic, not the new logic being wrong. Document the resolution either way.
3. Cut over: flip the flag for admin ring. Old code path stays in place but is unused.
4. After 48 hours of admin use with no incident, enable for full rollout.
5. After two weeks of full rollout with no incident, delete the old code path in a follow-up PR.

Signals:
- Shadow divergences explained, not just counted.
- Audit log shows the expected event types and diffs.
- No unexpected 500s in the affected route during admin ring.
- For concurrency-sensitive changes (hub take, payment finalize): run the concurrent-take test in `e2e/` (or equivalent vitest under `tests/`) and confirm only one winner.

Rollback: turn flag off. If dual-write was used, the old column / table is still authoritative. If no dual-write, the old code path is still in place behind the flag.

### 4.4 Money-moving and document-issuing changes

Examples: receipt finalize activation, tax-document numbering, payment "mark paid" → create-receipt handoff, monthly-billing item changes, hourly-bank decrement on job done, mark-paid drawer field changes, future allocation-number integration, future PDF rendering.

Pattern: high-rigor. Dry-run mode, accountant review, explicit sign-off, no time pressure.

Steps:
1. Ship the new logic behind a flag, default off.
2. Build artifacts in dry-run mode only. A "draft" receipt that displays the proposed numbering, VAT calculation, and document body but does not allocate a real document number from the `ReceiptDocumentSequence`. The verification banner stays on.
3. Accountant review of the dry-run artifacts. Required. Documented sign-off in a shared doc with date, accountant name, scope of review (which document types, which date range, which VAT rate).
4. Backup the database immediately before enabling the flag. Documented in `docs/pilot-launch-checklist.md` already; reaffirm before each money-affecting flip.
5. Enable for admin ring only. Admin issues one real document with a real number, in production, end-to-end. Validate the number, the date, the VAT, the HTML output.
6. Pause. Twenty-four hours of human review. Do not batch.
7. If clean, enable for full rollout. Most money flows are admin-only anyway, so "full rollout" here means "all admins."
8. Do not retire the flag for at least 30 days. The kill switch matters.

Signals:
- Accountant sign-off, written, dated.
- Allocated document number is monotonic and gap-free in `ReceiptDocumentSequence`.
- Database backup taken within one hour of the flag flip.
- First real document issued matches accountant's expected template.

Rollback: turn flag off. If a real document was already issued and is wrong, the procedure is not "delete the row." It is "issue a correcting document of the appropriate type." Per Israeli accounting requirements, finalized tax documents are immutable. The kill switch prevents the next bad document; it does not unbake the previous one. This is why dry-run review must complete before the flag flips.

For this change class only: do not move the flag without a second admin present. Pairing is the gate.

### 4.5 Auth and permissions changes

Examples: role permission tightening, department visibility scope changes, admin-only route additions, session invalidation behavior, password reset flow, rate-limit thresholds, security headers, NextAuth provider changes.

Pattern: no flag. Deploy with peer approval and post-deploy verification.

Reason: flag-gating auth is dangerous. A misconfigured flag flip could leak data across departments. The flag itself becomes a new attack surface. The correct gate is code review by a second engineer plus a documented test that fails if the change regresses.

Steps:
1. Write the test first: "employee A in department X cannot read job belonging to department Y via the API." Confirm it fails against current code if the regression is introduced. Then implement the change.
2. Peer review required, not optional. Reviewer specifically checks the permission check, not just the diff.
3. Deploy to staging. Run the auth and permission validation block from `docs/internal-management-portal-final-plan/04-mvp-build-plan.md` Section 5.1.
4. Deploy to production. Re-run the same checks in production with a real employee and a real admin account.
5. Document the change in the audit-log so it shows up when someone asks "what changed."

Signals:
- Permission test passes in staging and production.
- Manual cross-department check confirms isolation.
- Rate-limit changes specifically: confirm the limit triggers (try to hit it intentionally) and confirm the limit does not lock out legitimate use under load.

Rollback: code revert. Auth changes are not flag-gated, so backout means redeploy. Keep the previous release tag handy.

### 4.6 Database migrations

Examples: the very first baseline migration (current state: `prisma/migrations/` contains only `migration_lock.toml`, no actual migrations), schema additions for new entities (CMDB lite, knowledge base), schema additions for new columns on existing entities, indexes for performance, partitioning the audit log.

Pattern: expand-migrate-contract. Especially important here because the project has not yet established a migration discipline.

Steps:
1. **Expand**: write the migration as additive only. New column nullable, new table with no foreign keys yet, new index `CONCURRENTLY` if Postgres supports it for the change type. Old code keeps running.
2. **Migrate (dual-write)**: deploy code that writes to both old and new shape. Reads still come from old. Run for one or two days, depending on data volume.
3. **Backfill**: populate the new column or new table from existing rows. Run in batches, log progress, idempotent. Do not run inside a single transaction for large tables.
4. **Cut over**: deploy code that reads from new. Writes still go to both. Verify reads in production via spot-check.
5. **Contract**: remove old-shape writes. After at least one week of clean operation, drop the old column or old table in a separate migration.

The first real migration is special: it is the baseline. Capture the current schema as the migration zero, deploy it to staging, run the seed, and confirm the seed runs clean. Then take a fresh backup. From that point forward the migration sequence is the source of truth and ad-hoc schema changes are disallowed.

Signals:
- Migration runs against a copy of production data without errors.
- Backfill completes within an acceptable window. Estimate from data volume first, do not guess.
- Old and new shapes agree for a 24-hour sample.

Rollback: each migration step is individually reversible if the order above is followed. Expand is non-breaking, so reverting the deploy is sufficient. Migrate and backfill can be paused. Cut-over is the irreversible step and must be the last one before contract. Contract itself is destructive; do not contract until at least one week post cut-over.

## 5. Validation Gates Between Phases

A gate is a checklist that must be true before a flag advances from one stage to the next. Gates are not "we feel good." They are "we verified."

| From | To | Gate |
|------|------|------|
| Off (built) | Dark deploy | CI green. Migration applied to staging. Code review by one peer minimum. Backout path documented in the PR description. |
| Dark deploy | Shadow (mutations only) | New code path runs in staging without error for at least 24 hours. Shadow comparison logging in place. |
| Shadow | Pilot ring (or skip if additive) | Shadow divergences explained for at least 48 hours. Owner reviewed the divergence log. No open critical issue on the feature. |
| Pilot ring | Staged rollout (admin ring) | Pilot users confirm the feature is usable. At least one pilot ran the happy path end to end. No new error in the relevant route. For mutations: audit log shows expected events. |
| Admin ring | Full rollout | 48 hours minimum. Admin ring used the feature on real work, not just smoke-tested it. No incident raised. For money-flow: accountant sign-off on file. |
| Full rollout | Retire flag | Two weeks minimum. No incident. No support request mentioning the feature. The flag has been on for everyone long enough that off-by-default is the regression risk, not on-by-default. |

For any backward step (rollout → admin ring, admin ring → pilot, etc.) document why. Backward steps are not failures, they are the system working. A retro at the end captures what the signal was.

## 6. Rollback Playbook

| Change class | Rollback action | Time to revert |
|--------------|-----------------|----------------|
| Additive UI / UX | Toggle flag off in admin panel | Under 1 minute |
| Read-only analytics | Toggle flag off in admin panel | Under 1 minute |
| New mutation flow with shadow / dual-write | Toggle flag off. New code path stops executing. Old code path is authoritative. No data cleanup needed if dual-write was correctly implemented. | Under 5 minutes |
| New mutation flow without shadow | Toggle flag off. Inspect audit log for any affected rows during the on-window. Manually reconcile if needed. | 5 minutes to several hours depending on data |
| Money-moving / document-issuing | Toggle flag off. Pair with second admin. Do not delete any allocated document number. Issue a correcting document if a real document was wrong. Notify accountant. | Under 1 minute for the flag, days for accounting reconciliation |
| Auth / permissions | Code revert. Redeploy previous release tag. Verify the change is gone in production. | 10 to 30 minutes depending on deploy pipeline |
| Database migration (in expand or migrate phase) | Revert deploy. Migration stays in place since it is additive. | Under 10 minutes |
| Database migration (in cut-over phase) | Revert deploy. Old code reads old shape. New writes during the on-window are in both old and new, so reads stay consistent. | Under 10 minutes |
| Database migration (post-contract) | Restore from backup. This is why contract waits one week. | Hours |

Common rule: every flag has a documented backout path before it is enabled for ring 1. If no backout path exists, the change is not ready to ship behind a flag. Either build the backout path or pick a different change class.

## 7. Qualitative Signal Channels

With under 20 users, qualitative signal is the measurement. Treat it with the same discipline a larger team would give to quantitative metrics.

### 7.1 Weekly retro

15 minutes per week, same time, same agenda, every week during a rollout phase. Three questions:

1. What flag-gated feature did you use this week. (Even if you didn't notice it was new.)
2. What worked. Be concrete.
3. What broke or confused you. Be concrete.

Notes go in a shared doc. The change owner reads them and either responds (in the doc, not over chat) or escalates. No-response means no-signal, which is itself a signal that the feature is invisible.

### 7.2 Structured 1:1 interviews

For larger changes (new module, mutation flow, money-flow), the change owner runs a 20-minute 1:1 with each pilot user. Scripted opener, three open questions, no leading. Do not show the feature during the interview; ask the user to navigate to it. If they cannot find it, that is the most important data point.

### 7.3 Ticket triage

Any internal bug report, support thread, or "this is weird" message in the comms channels gets a triage label tying it back to a flag-gated change if relevant. Owner is responsible for closing the loop. If three or more tickets mention the same change, that is enough signal to pause the rollout and investigate, regardless of severity.

### 7.4 Admin sanity check

Before any rollout phase advances, an admin runs through the relevant validation checklist from `docs/internal-management-portal-final-plan/04-mvp-build-plan.md` Section 5 for the feature. This is not optional. It is the gate.

### 7.5 Audit-log review

For mutation changes, the change owner reads the last 100 audit-log entries for the affected entity type at the end of admin ring. Looks for: unexpected actions, missing actions, diff shapes that look wrong, repeated retries. This is faster than building a dashboard and it forces the owner to know what normal looks like.

## 8. Recommended Phasing Template for the Upcoming Improvement Plan

A template the PM can fill in for each improvement coming out of the audit. The PM defines the WHAT; this template defines the HOW.

```
Change: <one-line description>
Class: <additive | read-only-analytics | mutation | money-flow | auth | migration>
Flag key: <snake_case_flag_name>  (or "none" if auth class)
Owner: <name>
Backout path: <one paragraph>

Phase 1 — Dark deploy
  Entry: PR merged, CI green, migration applied to staging
  Exit: feature loads in production behind off flag, no console error, observability spot-check done

Phase 2 — Shadow / Pilot (skip if additive UI)
  Entry: Phase 1 exit met
  Exit: <class-specific>
    - mutation: shadow divergences explained for 48h
    - money-flow: accountant sign-off, backup taken
    - migration: backfill complete, dual-write stable

Phase 3 — Admin ring
  Entry: Phase 2 exit met
  Exit: 48h of admin use, no incident, validation checklist passed

Phase 4 — Full rollout
  Entry: Phase 3 exit met
  Exit: 2 weeks of full rollout, no incident, no open support thread referencing the feature

Phase 5 — Retire
  Entry: Phase 4 exit met
  Exit: flag removed from code, schema not changed (DB row can stay for audit reasons)
```

The PM fills this in once per improvement. Improvements that share a class can share a template. Do not template-bloat: a one-paragraph rollout plan is fine for a UI tweak. A multi-page rollout plan is appropriate for the receipt finalize activation.

## 9. Risks and Tradeoffs of Staged Rollout in a Small Org

Staged rollout has costs that are easy to undercount when the team is small.

### 9.1 Inconsistent experience confuses users

If half the team sees a new "saved views" panel and the other half does not, conversations across that boundary fail. "Save this view for me" only works if the recipient has the feature. With four to six users per department, partial rollout within a department is particularly disruptive. Mitigation: in a small org, "ring 2" often makes more sense as "everyone except the day-one admin tester." Skip the middle ring for changes that only matter inside a single workflow.

### 9.2 Pilot users are also the loudest users

Selection bias in pilot feedback. The two people who volunteer to try a new feature are usually power users and usually forgiving. Their qualitative feedback skews positive relative to the broader team's eventual reaction. Mitigation: include at least one pilot user who is not a power user. Their first reaction is the higher-information signal.

### 9.3 Owner overhead is real

Each flag, each ring, each gate is owner time. A small team running many parallel rollouts will lose track. Limit concurrent rollouts to two or three at any time. Mark stale flags `retired` aggressively to keep the admin UI legible.

### 9.4 Flag debt accumulates

Flags that were "supposed to be removed in two weeks" stay forever. Code paths multiply. Tests have to cover both branches forever. Mitigation: every flag has an expiration date set when it is created. The admin UI sorts flags by expiration. The first task of any sprint is to retire flags past expiration.

### 9.5 Shadow mode catches more than expected

When you compare new logic against old logic, the most common outcome is finding bugs in the old logic. This is good but it eats more time than expected because you now have to decide whether the new logic preserves the old buggy behavior (yes, with a note), or fixes the bug (yes, but now it is a behavior change in addition to a refactor). Budget for this when scoping mutation changes.

### 9.6 Backout for money flows is partial

A wrong tax document cannot be uninvented. The flag stops the next one; it does not undo the previous one. Treat the dry-run and accountant-review steps as the actual gate. The flag is a kill switch, not a do-over.

### 9.7 Auth changes deployed without a flag mean code revert is the only kill switch

This is correct and intentional but the team needs to know it. If a permissions change goes out and is wrong, the response is a release rollback, not an admin-panel toggle. The previous release tag needs to be deployable in under 15 minutes. If the deploy pipeline does not support that, fix the pipeline before shipping the permissions change.

### 9.8 A/B is genuinely not appropriate; resist the pressure

There will be requests to "A/B this and see which one is better." With ~10 users per arm, the answer will not be statistically meaningful. Do not pretend otherwise. The truthful answer is "we will pilot it with three people, talk to them, and decide." That is a real decision-making process. It is not lesser than a randomized trial at this scale; it is the appropriate instrument.

## Handoff to PM

Top three recommendations to integrate into the improvement plan:

1. **Adopt the per-change-class taxonomy from Section 4** as the first thing each improvement is labeled with. Most improvements coming out of the audit will be class 4.1 (additive UI) or class 4.3 (new mutation). A few will be 4.4 (money-flow) and the receipt finalize activation is the obvious one. Once the class is set, the validation pattern is determined.

2. **Extend `lib/feature-flags.ts` with role-based targeting and a `stage` field** before the next wave of features ships. The minimal additions in Section 2.3 are enough to enable rings without overbuilding. Do not pursue percentage rollouts or randomized assignment; the user count does not justify it and the maintenance burden is real.

3. **Treat the first real Prisma migration as a hardening event in its own right.** The project currently has no migrations under `prisma/migrations/`, only the lock file. The baseline migration must be created, applied to staging, validated against `prisma/seed.ts`, and backed up before any further change ships. After that point, every schema change follows the expand-migrate-contract pattern in Section 4.6. This single discipline change has more impact on rollout safety than any flag-system feature.
