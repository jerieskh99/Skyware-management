# Analytics Audit

Date: 2026-05-24
Auditor: Senior Data Scientist
Scope: `/statistics`, `/dashboard`, and billing-derived analytics surfaces.
Out of scope: schema, API arch, UX critique, ML.

## 1. Executive summary

- Analytics surface is small. One admin statistics page (8 KPI cards + 3 tables), two role-conditional dashboards (admin / employee), and a 3-count billing KPI block reused by the admin dashboard.
- Metrics are operationally honest. Every metric is grounded in real `Job`, `JobStatusEvent`, `Payment`, or `WorkReport` rows. No fabricated numbers, no synthetic placeholders.
- Definitions are inconsistent across surfaces. `delayedCount` is recomputed in three places with the same JS-side `elapsed > slaTargetMinutes` rule (`lib/statistics/queries.ts:110-113`, `lib/statistics/queries.ts:220-223`, `lib/dashboard/queries.ts:15-22`), but the inputs differ slightly per call site and one is silently capped at 50 rows (`lib/dashboard/queries.ts:108`).
- Time-window semantics are mixed. "Active jobs" and "Delayed" are always live (ignore `rangeDays`), while "Completed", "Reviewed", "Hours reported", "Avg. completion", "Cancelled", "Reopened" are all window-filtered. The section heading "Overview — Last 30 days" is therefore partially misleading. Already flagged in `docs/phase-8-statistics-audit.md` Section 6.
- `avgCompletionHours` is computed on a `take: 500` Prisma slice with no ordering (`lib/statistics/queries.ts:80-89`). Result is a non-deterministic, non-random sample — it can drift across page loads once N > 500.
- All spec-promised billing analytics are missing: aging buckets (0-30 / 31-60 / 61-90 / 90+), hourly-bank burn rate, monthly retainer status, "hourly banks low" panel. Only flat counts and a 10-row aging list exist (`lib/billing/queries.ts:60-100`). Spec ref: `docs/internal-management-portal-enhancement/05-ux-ui-review.md:97-99`, `docs/internal-management-portal-final-plan/02-implementation-ready-spec.md:290-296`.
- No self-view for employees. Spec calls for "Admin sees cross-employee, employees see only own" (`02-implementation-ready-spec.md:277-278`); current implementation redirects non-admins off `/statistics` entirely (`app/(portal)/statistics/page.tsx:38`).
- The "reopened rate" KPI is a raw count of `JobStatusEvent` rows where `reopened=true` in the window, not a rate (no denominator). Misnamed at minimum.

## 2. Inventory of analytics surfaces

| Route | Audience | What it shows | Files |
|---|---|---|---|
| `/statistics` (page) | admin only | 8 KPI cards, 3 tables (employee, department, client) | `app/(portal)/statistics/page.tsx` |
| `/statistics/email-to-job` | admin only | Manual email→job entry form. Not analytics. | `app/(portal)/statistics/email-to-job/page.tsx` |
| `GET /api/statistics?range=7\|30\|90` | admin only | JSON snapshot for client-side consumers | `app/api/statistics/route.ts` |
| `/dashboard` admin variant | admin | 4 KPI cards + 3 list cards (reviews pending, waiting for admin, past SLA) | `app/(portal)/dashboard/page.tsx:86-226`, `lib/dashboard/queries.ts:36-117` |
| `/dashboard` employee variant | employee | 3 KPI cards + 2 list cards (working, assigned) | `app/(portal)/dashboard/page.tsx:233-335`, `lib/dashboard/queries.ts:121-186` |
| Billing KPIs (consumed by admin dashboard) | admin | unpaid count, overdue count, paid-this-month count | `lib/billing/queries.ts:60-77` |

No analytics on the billing page itself beyond the count KPIs surfaced via the admin dashboard. No client-detail analytics. No per-job analytics beyond the existing job detail page (not in scope).

## 3. Metric definitions

Each row: name, formula as implemented, time window, denominator, file:line.

| Metric | Implementation | Window | Denominator | Source |
|---|---|---|---|---|
| `activeJobs` | `count(Job.status IN ACTIVE_STATUSES)` where active = `new, assigned, available, taken, working_on_it, waiting_for_client, waiting_for_admin` | live (no filter) | none (count) | `lib/statistics/queries.ts:39`, `lib/statistics/queries.ts:3-11` |
| `completedCount` | `count(Job.status IN [done, reviewed] AND completedTimestamp >= since)` | window | none | `lib/statistics/queries.ts:41-46` |
| `reviewedCount` | `count(Job.status = reviewed AND reviewedTimestamp >= since)` | window | none | `lib/statistics/queries.ts:48-53` |
| `cancelledCount` | `count(Job.status = cancelled AND cancelledTimestamp >= since)` | window | none | `lib/statistics/queries.ts:55-60` |
| `reopenedCount` | `count(JobStatusEvent.reopened=true AND changedAt >= since)` | window | none (event count, not job count) | `lib/statistics/queries.ts:63-68` |
| `totalHoursReported` | `sum(Job.timeSpentMinutes) / 60` for closed jobs in window | window (by `completedTimestamp`) | none | `lib/statistics/queries.ts:71-77`, `lib/statistics/queries.ts:92-94` |
| `avgCompletionHours` | mean of `completedTimestamp - assignedTimestamp` over up to 500 closed jobs | window | sample size <=500 | `lib/statistics/queries.ts:80-89`, `lib/statistics/queries.ts:96-103` |
| `delayedCount` (overview) | `count(active jobs with assignedTimestamp where now - assignedTimestamp > slaTargetMinutes)` | live | none | `lib/statistics/queries.ts:106-113` |
| `delayedCount` (per department) | same rule, scoped by `departmentId` | live | none | `lib/statistics/queries.ts:210-223` |
| `delayedCount` (admin dashboard KPI) | same rule, over all active jobs | live | none | `lib/dashboard/queries.ts:38-49` |
| `lists.delayed` (admin dashboard list) | same rule, but pre-capped at 50 rows then JS-filtered to first 5 | live | none | `lib/dashboard/queries.ts:94-114` |
| employee row `activeCount` | `count(Job.assignedEmployeeId=X AND status IN ACTIVE)` | live | none | `lib/statistics/queries.ts:144-150` |
| employee row `completedCount` | `count(Job.assignedEmployeeId=X AND status IN [done, reviewed] AND completedTimestamp in window)` | window | none | `lib/statistics/queries.ts:151-157` |
| employee row `hoursReported` | `sum(Job.timeSpentMinutes)/60` over closed jobs in window assigned to user | window | none | `lib/statistics/queries.ts:158-165` |
| department row `activeCount` / `completedCount` / `delayedCount` | per-dept variants of the same rules | live / window / live | none | `lib/statistics/queries.ts:196-218` |
| client row `totalJobs` | `_count.jobs` on Client (all-time, all statuses) | all-time | none | `lib/statistics/queries.ts:247-248` |
| client row `activeCount` / `completedCount` | scoped per client; client list capped at 100 by `companyName` asc | live / window | none | `lib/statistics/queries.ts:243-252`, `lib/statistics/queries.ts:256-267` |
| `reviewsCount` (admin dashboard KPI) | `count(Job.status = done)` (all time) | all-time | none | `lib/dashboard/queries.ts:42` |
| `hoursThisWeek` (employee KPI) | `sum(WorkReport.totalTimeMinutes)/60` for current ISO week | ISO week (Mon 00:00 local) | none | `lib/dashboard/queries.ts:130-146`, `lib/dashboard/queries.ts:24-32` |
| `unpaidCount` (billing KPI) | `count(Payment.status IN [draft, sent_to_client, waiting_for_payment, partially_paid])` | live | none | `lib/billing/queries.ts:64-69` |
| `overdueCount` (billing KPI) | `count(Payment.status = overdue)` | live | none | `lib/billing/queries.ts:70` |
| `paidThisMonth` (billing KPI) | `count(Payment.status = paid AND paidDate >= 1st of current month)` | calendar month | none | `lib/billing/queries.ts:62-73` |

## 4. Defensibility of each metric

Well-defined: the metric has a single, reproducible formula.
Reproducible: re-running on the same DB at the same time yields the same number.
Manipulable: a user-level action can move the metric without genuine work change.

| Metric | Well-defined | Reproducible | Manipulable | Notes |
|---|---|---|---|---|
| activeJobs | yes | yes | low | Status transitions are audited; hard to game. |
| completedCount | yes | yes | medium | "Closing the wrong thing" inflates it. Reopened rate does not subtract. |
| reviewedCount | yes | yes | low | Only admin can review. |
| cancelledCount | yes | yes | medium | Workflow may encourage cancelling stale jobs to clear queues. |
| reopenedCount | partial | yes | low | Counts events not jobs; one job reopened twice in window counts twice. |
| totalHoursReported | yes | yes | high | Self-reported `timeSpentMinutes` set at mark-done. No cross-check against `TimeSession` durations. |
| avgCompletionHours | no | no | medium | Non-deterministic 500-row sample with no ordering; result drifts. Excludes jobs without `assignedTimestamp` (silent bias toward assigned-flow jobs over hub-taken ones — see Section 7). |
| delayedCount | yes | yes | low | Definition is consistent across surfaces. |
| employee.activeCount / completedCount / hoursReported | yes | yes | medium-high | Same caveat as totals. No normalization by capacity or time-in-role. |
| department.delayedCount | yes | yes | low | |
| client.totalJobs | yes | yes | low | All-time count; not comparable across clients with different tenure. |
| reviewsCount (admin dashboard KPI) | yes | yes | low | "Needs review" label implies pending but the underlying status `done` is unambiguous. |
| hoursThisWeek (employee KPI) | mostly | yes | high | ISO-week start derived from server local time; behavior near midnight Sunday/Monday in non-UTC server depends on `TZ`. `WorkReport.totalTimeMinutes` is self-reported. |
| unpaidCount / overdueCount / paidThisMonth | yes | yes | low | `overdueCount` depends on a status that must be advanced (manual or job). `paidThisMonth` excludes partial payments — see Section 6. |

## 5. Missing high-value metrics

Proposed, with reasoning. Roughly ordered by business value for an MSP at MVP scale.

1. SLA adherence rate. `closed_within_sla / total_closed` per period, per department, per priority. The current `delayedCount` is a stock (snapshot of active jobs in breach); a flow rate (`closed_within_sla / closed`) is what the team can actually improve and report on. Data needed: `slaTargetMinutes`, `assignedTimestamp`, `completedTimestamp`. All present.
2. First response time. `firstResponseAt - assignedTimestamp` (or `createdAt` for hub-takes). Median + p90 per priority. `firstResponseAt` exists per `docs/audit-2026-05/database_audit.md:128`. Strong indicator of triage quality.
3. Jobs throughput per week. `count(completed) per ISO week`. Trend matters more than the 30-day point estimate. Required for the "weekly activity sparkline" in `02-implementation-ready-spec.md:289`.
4. Reopened rate (not count). `reopened_events / completed_jobs_in_window`. Currently labeled "Reopened" but is a raw count.
5. Hub take latency. `takenTimestamp - availableTimestamp` (or `createdAt` for hub-routed). Spec'd in `02-implementation-ready-spec.md:295`. Tells you how quickly available jobs get picked up.
6. Hub vs assignment ratio. `count(jobs where takenTimestamp not null) / count(all jobs)` per period. Spec'd in `02-implementation-ready-spec.md:294`.
7. Aging buckets (payments). 0-30, 31-60, 61-90, 90+ days past `dueDate`. Spec'd in `05-ux-ui-review.md:97`. Existing `getAgingPayments` returns 10 rows, no buckets.
8. Hourly-bank burn rate. `sum(HourlyBankUsage.minutesUsed) per bank per month` and `projected_months_remaining = remaining_minutes / avg_monthly_burn`. Spec'd in `05-ux-ui-review.md:99` "Hourly banks low". Data is in `HourlyBank.usages` (see `lib/billing/queries.ts:11-15`).
9. Monthly retainer status. For each `MonthlyBillingItem` active in the period: hours included, hours consumed via job/work-report linkage, overage minutes. Confirm the model supports linkage before promising the metric — if not, add it to the data-engineer backlog.
10. Revenue per employee. `sum(Payment.amount where paidDate in period) / count(active employees)`. Need to clarify amount column on Payment; do not invent.
11. Repeat issues per client. `count(jobs per client) / months_active`. Indicator of underlying tech debt at the client site; useful for retainer pricing.
12. MRR vs hourly mix. `sum(monthly retainer amount) vs sum(hourly_bank_topup amount + one_time amount) per month`. Strategic mix indicator. Verify which Payment fields back this before exposing.
13. Cancelled-job reason mix. `cancelledTimestamp` exists; if there is a cancel-reason enum or note, surface a count by reason. Otherwise add a cancel-reason field to Job (defer to data engineer).
14. Time-to-assignment for new jobs. `assignedTimestamp - createdAt`. Catches scheduler/dispatcher backlog separately from worker capacity.
15. Per-priority histogram of completion time. Box plot or percentile table (p50/p90/max) per priority and per department. Replaces the brittle scalar `avgCompletionHours`.

## 6. Vanity / weak metrics to deprecate or rework

1. `avgCompletionHours` as currently computed. Non-deterministic 500-row slice. Either compute on full set with a SQL `AVG(EXTRACT(EPOCH FROM (completed - assigned)))`, or report median + p90 with explicit `ORDER BY completedTimestamp DESC` and named sample size. As scalar, also fragile to outliers (one 30-day job dominates).
2. "Reopened" KPI. Rename to "Reopen events" or convert to a rate (`reopened_events / completed_in_window`).
3. `totalHoursReported` without a denominator. By itself it is "more is better, more is worse" depending on framing. Pair with `jobs_closed` so the reader sees rate (hours/job).
4. `reviewsCount` admin dashboard KPI is all-time, not periodized. The number grows monotonically as a backlog. If the intent is "backlog", label it "Review backlog"; if the intent is "weekly throughput", switch to a window.
5. `client.totalJobs` is all-time and not normalized by tenure. Ranking clients by it favors long-tenured clients regardless of intensity. Either normalize per active month or display alongside tenure.
6. `paidThisMonth` counts only `status=paid` and excludes `partially_paid`. For a financial KPI, define explicitly as "payments closed in calendar month" and surface partial-pay separately.
7. `hoursThisWeek` uses server-local ISO week start. If the team works across time zones (or the server runs UTC while staff are local), Sunday-night work bleeds into the wrong week. Pin to a business time zone constant.
8. Hard-coded `take: 100` on `getClientStats` silently drops clients alphabetically beyond #100. Either remove the cap, paginate, or rank by activity (e.g. `orderBy: { jobs: { _count: "desc" } }`).
9. `lists.delayed` admin dashboard list. Fetches 50 active jobs ordered by priority desc, then JS-filters to delayed, then slices to 5. If fewer than 5 of the top-50-by-priority jobs are SLA-breached, you can show "no delayed" while delayed jobs exist at lower priorities. False sense of safety.
10. Employee row in `/statistics` colors `activeCount > 5` amber (`app/(portal)/statistics/page.tsx:182`). Threshold is hard-coded with no justification and no role/department adjustment. Drop the warning or move the threshold to config.

## 7. Data quality requirements

The metrics above only hold if the following are true in source tables. List of conditions an analytics-quality DB invariant set must guarantee:

1. `assignedTimestamp` is set on every job that ever leaves the `new`/`available` states. Currently used to anchor SLA, avg-completion, and time-to-assignment. Hub-taken jobs may skip `assigned` — confirm. If `takenTimestamp` is the SLA anchor for hub jobs, the `isDelayed` rule (`lib/dashboard/queries.ts:15-22`) is wrong for that flow because it only looks at `assignedTimestamp`.
2. `completedTimestamp` is set on every job that reaches `done` or `reviewed`. Backfill check: `Job.status IN [done, reviewed] AND completedTimestamp IS NULL` should equal 0.
3. `reviewedTimestamp` set on every `reviewed` job.
4. `cancelledTimestamp` set on every `cancelled` job.
5. `JobStatusEvent.reopened` only set when status moves from a closed-ish status back to an open one. Defined uniformly across all transition paths.
6. `Job.timeSpentMinutes` reconciles with `sum(TimeSession.minutes)` plus any work-report override. A cross-check query that flags drift > 10% should run nightly.
7. `WorkReport.totalTimeMinutes` is non-negative and not double-counted across multiple `WorkReport` rows for the same job.
8. `slaTargetMinutes` is non-null on every job. Defaulted at create, not nullable.
9. `Payment.dueDate` non-null when `status IN [waiting_for_payment, overdue, partially_paid]`.
10. `Payment.paidDate` non-null when `status = paid`.
11. `HourlyBankUsage.usedAt` non-null and monotonic per bank; `minutesUsed` non-negative.
12. `MonthlyBillingItem.startDate` and `endDate` (or rolling flag) clearly defined so the "active in month" filter is unambiguous.
13. Time zone: pick one (UTC for storage, business-local for bucket boundaries). The implementation currently mixes `new Date()` server-local and naive `setHours(0,0,0,0)` (`lib/statistics/queries.ts:19`, `lib/dashboard/queries.ts:24-32`). Document and align.
14. Soft-deletes: confirm no statistics query is silently including soft-deleted jobs or users. Spot-check `User.isActive` is correctly filtered in employee stats (it is, line 134). Spot-check client `status="active"` filter doesn't exclude jobs from churned clients that should still appear in historicals (`lib/statistics/queries.ts:244` filters clients then joins jobs — churned-client jobs will be missing from the client workload table).

## 8. Visualization recommendations

Chart type per metric. No library lock-in.

| Metric | Chart | Reason |
|---|---|---|
| Active jobs, Delayed, Reviews pending, Unpaid, Overdue | Stat card with delta vs prior period | Atomic scalars; trend is the value, not the level. |
| Jobs throughput per week | Bar chart (week on x, count on y) | Discrete buckets; comparison across periods. |
| Avg / median / p90 completion time per priority | Grouped bar or small-multiples box plot | Distribution matters; scalar mean hides outliers. |
| Reopen rate over time | Line chart with rolling 4-week mean | Rate trend over time. |
| SLA adherence rate per dept per week | Heatmap (dept x week, color = adherence %) | Two categorical axes + one ratio. |
| First response time distribution | Cumulative distribution / histogram | Distribution shape is the diagnostic, not the mean. |
| Hub take latency | Histogram with p50 / p90 marker lines | Same. |
| Aging buckets (payments) | Stacked horizontal bar (0-30, 31-60, 61-90, 90+) | Canonical AR aging view. |
| Hourly-bank burn rate | Line per client (months on x, remaining minutes on y) with low-water threshold | Burn-down visualization familiar to MSPs. |
| Monthly retainer status | Per-row progress bar (used / included) with overage flag | Easy at-a-glance per client. |
| Workload distribution per employee | Sorted horizontal bar | Ranking + magnitude. |
| Department activity | Stacked bar (active vs completed vs delayed) per dept | Composition + comparison. |
| Client workload | Sortable table with column sparklines for trend per row | Drill-down is the use case, not visual scan. |
| Hub vs assignment ratio | Stacked area over time | Composition trend. |

Avoid: pie charts for >3 slices; gauge meters; word clouds; any 3D chart; dual-axis charts unless both axes share a unit.

## 9. Dual-framing review — employee self-view vs admin oversight

The spec (`02-implementation-ready-spec.md:277-278`) is clear: admin sees cross-employee, employees see only their own. Current implementation deviates.

| Concern | Current state | Implication |
|---|---|---|
| Employees blocked from `/statistics` | `app/(portal)/statistics/page.tsx:38` redirects non-admins to `/dashboard` | Employees have no self-view at all. Spec calls for one. |
| Employee dashboard has 3 KPIs only | `active`, `delayed`, `hoursThisWeek` (`lib/dashboard/queries.ts:121-148`) | No personal trend, no completion stats, no reopened rate, no SLA adherence. Cannot self-diagnose. |
| Cross-employee table fully named | `app/(portal)/statistics/page.tsx:175` shows `displayName` per employee with active jobs, completed, hours | Permitted for admin per spec, but ranking effect creates leaderboard dynamics. Footer disclaimer ("operational activity, not employee surveillance") exists but the page is structurally a leaderboard. |
| Hours reported are self-entered | `Job.timeSpentMinutes` is user-set at mark-done | If hours are used in evaluation, employees may under- or over-report. Pair with TimeSession data as a sanity check. |
| Privacy filters absent | No way for an employee to see their own hours, completion time, or reopen rate | Symmetric transparency principle is violated. Employees can only be measured by admins, not by themselves. |

Recommendations:

- Build a personal statistics view at `/statistics/me` available to all roles. Same metrics the admin sees for the user, no comparisons to peers, no rankings.
- For admins: add explicit "compare against department median" rather than ranking by raw counts. Ranks invite leaderboards; medians do not.
- For the leaderboard-shaped employee table, surface the metric definition and the time window in a tooltip per column. Reproducibility is a fairness property.
- If hours are ever used in performance review, document that source explicitly. State which fields are self-reported vs system-derived.

## 10. Recommendations

### P0

1. Define `delayedCount` once and reuse. Currently three call sites duplicate the rule. The Data Engineer audit already recommends a materialized `Job.sla_state` column (`docs/audit-2026-05/database_audit.md:525`, `:779`). Until then, extract a single `isDelayed(job)` helper used by all call sites. The current duplication is small but it is already inconsistent in scope (admin dashboard list capped at 50, statistics overview uncapped).
2. Fix `avgCompletionHours` non-determinism. Either compute in SQL on the full set, or add `orderBy: { completedTimestamp: "desc" }` and rename to "Avg of last N completed jobs". Document N in the UI.
3. Convert "Reopened" KPI to a rate or rename to "Reopen events". The current label implies a rate.
4. Add the spec-required billing analytics: aging buckets, hourly-bank burn, monthly-retainer status, "hourly banks low". Spec ref in Section 5 items 7-9. The schema supports it (see `database_audit.md:164`); the queries are missing.
5. Build a personal `/statistics/me` view for all roles. Spec requires it.

### P1

6. Add SLA adherence rate, first response time, jobs throughput per week, hub take latency, hub-vs-assignment ratio. All have backing fields per the data model.
7. Periodize the admin dashboard "Reviews pending" KPI or rename it to "Review backlog".
8. Replace the alphabetic `take: 100` on `getClientStats` with activity-ranked top-N or pagination.
9. Recompute `lists.delayed` correctly. Either query directly for active jobs that are SLA-breached (push the comparison to SQL once `sla_state` exists), or fetch all `active + assignedTimestamp` and rank by breach severity, not priority-then-filter.
10. Normalize client.totalJobs by tenure (or display tenure alongside).
11. Define and enforce the time zone for ISO-week boundaries and "today" buckets. Currently server-local.
12. Add data-quality nightly checks per Section 7 items 1-7 (job timestamp invariants, hours reconciliation).

### P2

13. Replace scalar `avgCompletionHours` with median + p90 + per-priority breakout in the UI.
14. Add weekly throughput sparkline per employee row (spec `02-implementation-ready-spec.md:289`).
15. Build the CSV export (deferred from Phase 8).
16. Add revenue-per-employee, MRR vs hourly mix, repeat issues per client after confirming `Payment.amount` semantics with the Data Engineer.
17. Add explicit metric-definition tooltips on every KPI card and table column. Reproducibility / fairness.

---

## Handoff to PM

Top three analytics concerns to act on:

1. **Spec compliance gap, not just polish.** The "Employee Statistics" feature shipped in Phase 8 is the cross-employee admin view only. The employee self-view, the billing aging buckets, the hourly-bank burn rate, the monthly-retainer status, the hub-take latency, and the hub-vs-assignment ratio are all called out by the implementation spec (`02-implementation-ready-spec.md:275-296`) and the UX review (`05-ux-ui-review.md:91-103`) but are absent in code. The audit verdict in `phase-8-statistics-audit.md` marks the phase complete for "committed MVP scope" by deferring these. PM should decide which of these promote to MVP and which slip to a labeled "Analytics v2" milestone.
2. **Two metrics give the wrong answer.** `avgCompletionHours` samples 500 rows with no ordering and will drift across page loads once N > 500. "Reopened" is a raw event count labeled like a rate. These are cheap to fix and the only KPIs in the current UI that are not just incomplete but actually misleading. P0 in the recommendations.
3. **Employees have no self-view and no metric definitions surfaced.** Combined with self-reported hours used in admin-side rankings, the current shape is closer to oversight than to the dual-framing the spec promises. The fix is small (a `/statistics/me` route with the same query layer, plus tooltips defining each metric and its time window) but is the kind of thing that becomes a trust issue if it ships unaddressed.
