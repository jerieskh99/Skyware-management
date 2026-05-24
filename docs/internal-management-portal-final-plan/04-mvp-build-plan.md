# MVP Build Plan

Authoritative scope and order spec.

## 1. MVP goal

A working portal where Skyware employees and admins run real work end to end.
Receipts produce drafts only.
Tax-document finalize is feature-flagged off until accountant sign-off.
No external integrations.
No automation engines.
No notification system.

## 2. Exact MVP feature list

### 2.1 Auth and accounts
- Username and password login.
- Session management.
- Password reset by admin.
- Five role and department combinations seeded.
- Settings page: display name, password, email, language, timezone.

### 2.2 Job workflow
- Job CRUD with the 10-status lifecycle.
- JobStatusEvent on every transition.
- WorkReport required on `done`.
- Take-from-hub with concurrency guard.
- Priority and severity fields.
- SLA target derivation.
- SLA bar on cards and detail (display only).
- Delayed filter and chip (display only).
- Tags on jobs.
- Audit log on every mutation.

### 2.3 Job lists
- My Jobs.
- Department Jobs per department.
- Global Jobs.
- Task Hub, four scopes.
- Filters and saved views.

### 2.4 Communication
- Four channels.
- Posts with title, body, tags, attachments, related job, related client.
- Replies.
- Search inside channel.
- Resolved and pinned flags.

### 2.5 Clients
- CRUD with overview, jobs, billing, payments, receipts, environment, notes tabs.
- ClientEnvironmentNote per section.
- Saved views on the client list.

### 2.6 Billing
- BillingAccount auto-created.
- MonthlyBillingItem, HourlyBank, HourlyBankUsage, OneTimeJobCharge.
- Payment with status workflow.
- Mark-paid drawer with create-receipt handoff.
- Burn-rate visual on client.
- Aging-bucket strip on admin dashboard.
- Saved views on billing.

### 2.7 Receipts
- ReceiptDocument with all six types.
- Draft and finalize flow.
- Numbering per type per year.
- HTML view.
- Verification banner.
- Finalize behind feature flag.

### 2.8 Productivity
- Active TimeSession timer with start, pause, resume, stop.
- Idle warning.
- Global search across Jobs, Clients, Posts.
- Saved views entity.
- Job tags surfaced.
- Manual create-job-from-email form.

### 2.9 Statistics
- Employee Statistics page.
- Per-employee and business sections.
- Filters and CSV export.

### 2.10 Admin
- User management.
- Tag management.
- Feature flag management.
- SLA default management.
- Audit log viewer.
- Company-details management for receipt headers.

### 2.11 Placeholder pages
- Financial Documents. Empty state. Feature-flagged.
- Agent Control Center. Desaturated placeholder. Feature-flagged.

### 2.12 Internationalization
- English and Hebrew.
- RTL on Hebrew.
- Asia/Jerusalem display.

## 3. Intentionally excluded from MVP

- Notification system (in-app, email, push).
- @mentions resolution.
- SLA breach automation, audit events, triggers.
- SLA pause for `waiting_for_client`.
- Per-client SLA tier overrides.
- Recurring job templates engine.
- Knowledge base.
- Escalation rules engine.
- Client health score.
- Underpriced-client report.
- CSAT capture.
- Approval workflow.
- Project mode for R&D.
- Client environment inventory (CMDB).
- Credential reference entity.
- PDF rendering of receipts.
- Allocation-number integration.
- Digital signature integration.
- 2FA for admins.
- SSO.
- Email-to-job full ingestion pipeline.
- Agent Control Center activation.
- Limited client portal.
- Change management workflow.
- Vendor and license registry.
- Disaster recovery readiness tracker.
- Auto-generated client status reports.
- Multi-currency on a single client.
- Native mobile app.

## 4. Recommended implementation order

Indicative weeks. Adjust for team size.

### Phase 0: Foundation. Week 0 to 1
- Repo, stack confirmation, CI, lint.
- Database, migrations tooling, seed loader.
- Configure environment and secrets management.
- Lock the data model from `03-data-model-final.md`.

### Phase 1: Auth and skeleton. Week 1
- Auth scaffold with hashed passwords.
- User, Role, Department, seed.
- Sidebar layout, header, language toggle, RTL pass.
- Settings page.

### Phase 2: Core jobs. Week 2 to 3
- Job, JobStatusEvent, WorkReport.
- Severity, priority, SLA derivation.
- Lifecycle endpoints with permission checks.
- Audit log middleware.
- My Jobs, Department Jobs, Global Jobs, Task Hub.
- Job detail with timeline.
- Mark-done flow.
- Tag entity surfaced.

### Phase 3: Productivity. Week 4
- TimeSession with timer UI.
- Postgres full-text search wiring.
- Header global search.
- SavedView entity and per-page wiring.

### Phase 4: Communication. Week 5
- Channels, posts, replies, tags, attachments.
- Linking to jobs and clients.
- Channel search.

### Phase 5: Clients and environment notes. Week 6
- Client CRUD.
- BillingAccount auto-create.
- Tabs and overview.
- ClientEnvironmentNote.

### Phase 6: Billing. Week 7 to 8
- MonthlyBillingItem, HourlyBank, HourlyBankUsage, OneTimeJobCharge.
- Payment with full status workflow.
- Mark-paid drawer.
- Burn-rate visual.
- Aging buckets.

### Phase 7: Receipts. Week 9
- ReceiptDocument with all six types.
- ReceiptDocumentSequence numbering.
- Draft and finalize behind feature flag.
- HTML view with verification banner.

### Phase 8: Manual email form and statistics. Week 10
- Create-job-from-email form.
- Statistics page.
- CSV export.

### Phase 9: Admin and placeholders. Week 11
- Admin Panel.
- Audit log viewer.
- Financial Documents placeholder page.
- Agent Control Center placeholder page.

### Phase 10: Hardening and pilot. Week 12
- Security headers.
- Rate limits.
- Backup and restore drill.
- Empty states. Loading states.
- RTL pass per page.
- Performance and indexing review.
- Pilot deployment.

## 5. Validation checklist

### 5.1 Auth and permissions
- [ ] Employee cannot read another department's jobs via direct URL or API.
- [ ] Admin-only routes return 403 with neutral empty state for employees.
- [ ] Sessions invalidate on logout and password reset.
- [ ] Rate limit on login and password reset.

### 5.2 Jobs
- [ ] All 10 statuses reachable per transition table.
- [ ] Done requires WorkReport.
- [ ] Reopen sets `reopened = true`.
- [ ] Severity and priority both visible.
- [ ] SLA bar correctly reflects elapsed vs target.
- [ ] Delayed filter returns the right rows.
- [ ] Tags filter applies correctly.

### 5.3 Task Hub
- [ ] Concurrent take produces one winner and one "already taken."
- [ ] Visibility scoped per department.
- [ ] Hub auto-refresh works.

### 5.4 TimeSession
- [ ] Only one active session per user.
- [ ] Pause and resume preserve accumulated minutes.
- [ ] Logout ends or pauses the session.
- [ ] Mark-done prefills time spent from sum of sessions.
- [ ] Idle warning fires.

### 5.5 Search
- [ ] Job title and description searchable.
- [ ] Client company name searchable.
- [ ] Post title and body searchable.
- [ ] No cross-scope leak.
- [ ] Empty state copy present.

### 5.6 Saved views
- [ ] User can save and load a view.
- [ ] Admin can pin a team view.
- [ ] URL reflects active filters.

### 5.7 Communication
- [ ] Employee posts in own department and global.
- [ ] Employee cannot post in another department.
- [ ] Resolved and pinned flags work.
- [ ] Search returns expected results.

### 5.8 Clients
- [ ] Client create auto-creates BillingAccount.
- [ ] Environment notes save per section.
- [ ] Tabs render correctly.
- [ ] Saved views on the client list work.

### 5.9 Billing
- [ ] Mark-paid drawer validates required fields.
- [ ] Paid status updates correctly.
- [ ] Aging buckets compute correctly across timezone changes.
- [ ] Burn-rate bar reflects hours remaining accurately.
- [ ] Threshold colors match thresholds.
- [ ] Create-receipt handoff pre-fills the draft.

### 5.10 Receipts
- [ ] Drafts editable. Finalized immutable.
- [ ] Numbering is monotonic per type per year.
- [ ] No gaps after finalize.
- [ ] Verification banner is visible.
- [ ] Finalize endpoint refuses without the feature flag in production.

### 5.11 Audit log
- [ ] Every mutation writes a row.
- [ ] Sensitive fields are redacted.
- [ ] Audit log viewer filters work.

### 5.12 Internationalization
- [ ] Hebrew RTL renders per page.
- [ ] Language toggle persists.
- [ ] Asia/Jerusalem display regardless of client timezone.

### 5.13 Operational
- [ ] Backup automated. Restore drill completed.
- [ ] CSV export works for Statistics filters.
- [ ] Health endpoint returns 200.

## 6. Risks

### 6.1 Scope creep
- Risk: feature list grows mid-build.
- Mitigation: this file is the contract. Section 3 is closed.

### 6.2 Compliance overreach
- Risk: an admin finalizes a draft against a live tax-document number.
- Mitigation: `receipt_finalize_enabled` flag default off in production.
- Mitigation: prominent verification banner.

### 6.3 Audit log growth
- Risk: table becomes large quickly.
- Mitigation: partition by month at the database level if Postgres.
- Mitigation: index plan in Section 3 of `03-data-model-final.md`.

### 6.4 RTL bugs
- Risk: mixed content breaks layout in Hebrew.
- Mitigation: dedicated RTL test pass in Phase 10.
- Mitigation: `dir="auto"` on user content.

### 6.5 Timer runaway
- Risk: forgotten timers inflate hours.
- Mitigation: idle warning. Auto-pause on logout.

### 6.6 Hub abandonment
- Risk: tasks pile up without takers.
- Mitigation: admin can reassign at any time. Phase 2 adds age metric.

### 6.7 Concurrency on take and on finalize
- Risk: race conditions.
- Mitigation: conditional update on take. SELECT FOR UPDATE on numbering.

### 6.8 Search index cost
- Risk: full-text indexes slow writes.
- Mitigation: scope each query. Throttle background reindex if needed.

### 6.9 Stack mismatch
- Risk: chosen ORM does not fit the schema.
- Mitigation: pick Prisma or Drizzle after one-day prototype.

### 6.10 Dependency on user inputs
- Risk: blocked at compliance hold.
- Mitigation: scaffold all flows with placeholder data. Block real launch only.

## 7. Fallback simplifications

If implementation runs over budget, cut in this order.
Each cut keeps the system shippable.

1. Drop SavedView entity. Use URL filters only.
2. Drop manual create-job-from-email form. Use the regular Create Job page.
3. Drop ClientEnvironmentNote. Use Client.notes for free text.
4. Drop TimeSession. Use manual time_spent_minutes entry at mark-done.
5. Drop burn-rate visual. Show numeric remaining only.
6. Drop aging-bucket strip. Show plain "overdue" filter only.
7. Drop tag UI surfaces. Tag tables stay; UI deferred.
8. Drop global search header. Use per-page list filters only.
9. Drop severity field. Use priority only.
10. Drop language toggle UI. Hard-code Hebrew or English at MVP. Keep schema bilingual.

Stop cutting once timeline fits.
Original spec items always rank higher than enhancement items.

## 8. Success metrics for the pilot

Measure during the first month after launch.

- Percent of jobs created via the portal.
- Median time from `assigned` to `working_on_it`.
- Median time from `done` to `reviewed`.
- Reopened rate per department.
- Hub take latency by department.
- Percent of payments marked Paid within 30 days of due.
- Weekly active employees.
- Number of CTO-flagged bugs in pilot week 2 vs week 4.
- Self-reported time saved by employees, weeks 4 and 8.
