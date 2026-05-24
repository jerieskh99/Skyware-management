# Revised MVP and Roadmap

This file refines `internal-management-portal-mvp-plan.md`.
It does not replace it.
It adds the highest-leverage items from this pass.

## 1. Revised MVP

### 1.1 Baseline MVP (from the original plan)

Already specified:

- Auth, users, roles, departments.
- Job lifecycle and Task Hub.
- My Jobs, Department Jobs, Global Jobs.
- Communication channels, posts, replies, tags.
- Clients CRUD with overview, jobs, billing, notes.
- Billing with three categories. Payment workflow.
- Mark-paid modal with create-receipt handoff.
- Receipts and Tax Documents draft and finalize.
- Employee Statistics page plus self-stats.
- Audit log on critical mutations.
- Hebrew and English UI scaffold.
- Financial Documents and Agent Control Center placeholders.

### 1.2 Additions to MVP (this pass)

Eleven additions. All small. All high value.

1. SLA tracking with breach detection.
2. Severity vs priority on jobs.
3. Hourly-bank burn-rate visual on client cards.
4. Overdue-payment aging buckets on admin dashboard.
5. Global search bar with scope chips.
6. Saved views on Jobs, Clients, Billing lists.
7. Active time timer on jobs.
8. Manual create-job-from-email form.
9. Notifications scaffold. Bell. Three triggers.
10. Job tags surfaced in UI and lists.
11. Client environment notes lite. Free-text sections per client.

### 1.3 Explicit MVP exclusions

Still excluded.

- PDF rendering of receipts. HTML only.
- Israel Tax Authority allocation number integration.
- Digital signature integration.
- Financial Documents ingestion. Placeholder only.
- Agent Control Center activation. Placeholder only.
- Real-time chat features.
- Native mobile app.
- General-ledger accounting features.

## 2. What to build first

The build order respects dependencies.

### Sprint A. Foundation
- Repo. Stack. CI. Lint.
- DB connection. Migration tooling.
- Auth scaffolding.
- Role, Department, User. Seed.

### Sprint B. Job core
- Job entity. JobStatusEvent. WorkReport.
- Lifecycle endpoints with permission checks.
- Severity field added.
- SLA target computed from priority and severity.

### Sprint C. Job UX
- My Jobs. Department Jobs. Global Jobs.
- Task Hub four scopes.
- Job detail page with timeline.
- Mark-done side sheet with timer integration.

### Sprint D. Timer and notifications
- TimeSession entity.
- Floating timer bar.
- Notification entity.
- Three triggers.

### Sprint E. Search and saved views
- Postgres full-text setup.
- Header search input.
- SavedView entity.

### Sprint F. Communication
- Channels. Posts. Replies. Tags.
- Search inside channels.
- Linking to jobs and clients.

### Sprint G. Clients
- Client CRUD.
- Tabs and overview.
- ClientEnvironmentNote entity.
- BillingAccount auto-create.

### Sprint H. Billing
- MonthlyBillingItem. HourlyBank. OneTimeJobCharge.
- Payment entity with full status workflow.
- Mark-paid drawer with create-receipt handoff.
- Burn-rate computation and bar.
- Overdue aging buckets.

### Sprint I. Receipts
- ReceiptDocument entity.
- Numbering sequence with no-gap guarantee.
- Draft and finalize flow.
- HTML view. Verification banner.

### Sprint J. Statistics and admin
- Statistics page.
- Saved views in statistics.
- Admin panel.
- Audit log viewer.

### Sprint K. Placeholders and polish
- Financial Documents placeholder page.
- Agent Control Center placeholder page.
- Settings.
- Manual create-from-email form.
- Empty states. Loading states. RTL pass.

## 3. What to postpone

Postponed to Phase 2 with clear ownership.

- Recurring job templates.
- Knowledge base from solved jobs.
- Escalation rules engine.
- Client environment inventory CMDB lite.
- Credential reference pointers.
- Client health score.
- Underpriced-client report.
- CSAT capture.
- Approval workflow.
- Project mode for R&D.
- PDF rendering of receipts.
- @mentions resolution.
- SLA pause on `waiting_for_client`.
- Per-client SLA tier overrides.
- 2FA for admins.

Postponed to Phase 3 or later.

- Email-to-job full ingestion pipeline.
- Financial Documents ingestion activation.
- Agent Control Center activation.
- Limited client portal.
- Change management workflow.
- Vendor and license registry.
- Disaster recovery readiness tracker.
- Auto-generated client status reports.
- Allocation-number integration.
- Digital signature integration.
- SSO via Entra or Google Workspace.

## 4. Suggested phase roadmap

Indicative weeks. Final timing depends on team size.

### Phase 0. Foundation. Week 0 to Week 1
- Per Section 2, Sprint A.

### Phase 1. Core MVP. Week 1 to Week 6
- Per Section 2, Sprints B, C, D, E, F.

### Phase 2. Clients, Billing, Receipts. Week 6 to Week 9
- Per Section 2, Sprints G, H, I.

### Phase 3. Stats, Admin, Polish. Week 9 to Week 11
- Per Section 2, Sprints J, K.
- Pilot deployment with the Skyware team.

### Phase 4. Workflow upgrades. Week 12 to Week 18
- Recurring job templates.
- CSAT capture.
- Knowledge base.
- Escalation rules engine.
- Notifications enrich. Email channel.
- SLA pause for `waiting_for_client`.
- 2FA for admins.
- Client environment inventory CMDB lite.
- Credential reference pointers.
- Project mode for R&D.
- Underpriced-client report.
- Renewal radar for monthly plans.
- Approval workflow.
- PDF rendering of receipts.

### Phase 5. Insights and scaling. Week 18 to Week 26
- Client health score.
- Burn-rate notifications.
- Hourly-bank top-up workflow.
- Email-to-job ingestion start.

### Phase 6. Compliance hardening. Week 22 to Week 30
- Allocation number integration if required.
- Digital signature integration if required.
- Long-term retention policy.

### Phase 7. Financial Documents real. Week 26 to Week 36
- Mailbox connector.
- RawEmail storage.
- Classifier and extractor.
- Linker UI.

### Phase 8. Agent Control Center real. Week 32 to Week 44
- Activate from placeholder.
- Initial capabilities in propose-only.
- Capability autonomy gates.

### Phase 9. Client-facing surface. Week 40 onwards
- Limited client portal.
- Auto-generated client reports.

## 5. Risks for the revised plan

### 5.1 Scope creep from this pass
- Added 11 MVP items. Each is small.
- Combined effort is real.
- Mitigation: cut item 11, item 10 if needed. Both are surface-only.

### 5.2 Notification scope explosion
- Notification scaffold attracts feature requests fast.
- Mitigation: hard limit MVP to three triggers.

### 5.3 Search and saved views correctness
- Mistakes cost adoption.
- Mitigation: ship with seeded examples and a dogfood week.

### 5.4 Timer accuracy
- Timer left running overnight inflates hours.
- Mitigation: idle detect plus daily warning.

### 5.5 Compliance from numbering
- Even draft receipts must not produce real numbers.
- Mitigation: a single `is_demo` global flag in dev. Production sequence starts only after accountant sign-off.

### 5.6 Hebrew RTL bugs
- Mixed content rendering is fragile.
- Mitigation: per-page RTL test in Sprint K.

### 5.7 Performance with full audit
- Audit on every mutation grows fast.
- Mitigation: write to a partitioned table. Index by entity_type and id.

## 6. Validation checklist additions

Add to the validation list in `internal-management-portal-mvp-plan.md`.

### 6.1 SLA
- [ ] A job with priority Urgent gets SLA 4 hours by default.
- [ ] A job with severity Critical and priority Normal raises effective SLA.
- [ ] SLA bar goes amber at 75 percent elapsed.
- [ ] SLA bar goes red at 100 percent.
- [ ] Breach event lands in audit log.
- [ ] Breach triggers a notification to assignee and admins.

### 6.2 Timer
- [ ] Only one active timer per user.
- [ ] Logout stops the timer.
- [ ] Pause and resume keep accumulated time.
- [ ] Mark-done prefills time spent from timer.

### 6.3 Search
- [ ] Job title and description searchable.
- [ ] Client name and tax id searchable.
- [ ] Post title and body searchable.
- [ ] Empty result has a meaningful state.
- [ ] No cross-scope leak of forbidden entities.

### 6.4 Saved views
- [ ] User can save and load a view.
- [ ] Admin can pin a view as team-wide.
- [ ] URL reflects active filters.

### 6.5 Burn-rate
- [ ] Bar shows correct remaining percent.
- [ ] Bar turns yellow at 50 percent. Red at 25 percent.
- [ ] Tooltip shows projected runout based on last 30-day usage.

### 6.6 Overdue aging
- [ ] Buckets compute correctly across timezone changes.
- [ ] A payment moved to Paid clears its bucket immediately.

### 6.7 Severity
- [ ] Severity enum visible on create and edit.
- [ ] Tooltip explains the difference from priority.

### 6.8 Environment notes
- [ ] Multiple sections per client.
- [ ] Edit history visible.
- [ ] Stale warning at 90 days.

### 6.9 Manual create-job-from-email
- [ ] Pasting an email body fills description.
- [ ] Subject becomes title.
- [ ] User picks client and department.
- [ ] Created job has `source = email_manual`.

### 6.10 Notifications
- [ ] Bell shows unread count.
- [ ] Click marks read.
- [ ] User can mute a trigger in Settings.

## 7. Future expansion checklist additions

Add to the future expansion list.

- Phase 2: SLA pause logic for `waiting_for_client`.
- Phase 2: Per-client SLA tier override.
- Phase 2: Templates for jobs, posts, receipts.
- Phase 2: Renewal radar widget for monthly plans.
- Phase 2: Discount tracking field on payments.
- Phase 3: Email-to-job pipeline.
- Phase 3: Hourly-bank top-up workflow.
- Phase 4: Agent autonomy gates per capability.
- Phase 4: Disaster recovery readiness tracker.
- Phase 4: Vendor and license registry.

## 8. Suggested success metrics

Pick a handful. Measure after pilot.

- Median time to mark a job `working_on_it` from `assigned`.
- Median time from `done` to `reviewed`.
- SLA breach rate per priority.
- Reopened-job rate per department.
- Hub take latency by department.
- Percent of payments marked Paid within 30 days of due.
- Percent of clients with environment notes filled.
- Time saved per employee. Self-reported survey at month two.
- Adoption: weekly active employees.
- Adoption: percent of jobs created via portal vs verbal.
