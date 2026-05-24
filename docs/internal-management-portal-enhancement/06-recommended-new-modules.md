# Recommended New Modules

Each module is a discrete unit of value.
Each has a verdict.

Verdict legend:

- MVP. Ship in the first release.
- Phase 2. Right after MVP stabilization.
- Phase 3. Several months after launch.
- Reject. Not now. Maybe never.

---

## Module 1. SLA Tracking and Breach Detection

### Purpose
Make SLA targets enforceable, not decorative.

### Users
- Employees see the SLA state on their jobs.
- Admins see breach reports and trends.

### Key features
- SLA target derived from priority. Stored on job.
- SLA target override per client. Phase 2.
- SLA timer pauses during `waiting_for_client`. Phase 2.
- SLA bar on job card. Red on breach.
- "Delayed" filter in lists.
- Breach event written to audit log.

### Data needed
- `Job.sla_target_minutes`. Already in spec.
- `Job.sla_state`. Derived. green, amber, red.
- `Job.first_response_at`. New field. Phase 2.

### Verdict
- MVP for derivation, display, filtering.
- Phase 2 for pause on `waiting_for_client` and per-client overrides.
- Phase 2 for breach notifications.

### Risk
- Complexity in computing accurate elapsed time.
- Mitigation: compute on the fly. Cache in a view.

---

## Module 2. Severity vs Priority

### Purpose
Split impact and urgency. Standard ITIL practice.

### Users
- All employees and admins.

### Key features
- `Job.priority` stays. Time urgency.
- New `Job.severity`. Impact scale.
- Combined matrix derives default SLA.

### Data needed
- `Job.severity` enum. minor, moderate, major, critical.

### Verdict
- MVP. Cheap. High value for IT ops.

### Risk
- Confuses employees if not explained well.
- Mitigation: tooltip on each field. Cheatsheet in onboarding.

---

## Module 3. Hourly-Bank Burn-Rate Alerts

### Purpose
Catch banks approaching empty in time to upsell.

### Users
- Admins and account-aware employees.

### Key features
- Burn-rate bar on client card.
- Threshold per bank. Default 25 percent remaining.
- Dashboard widget for at-risk banks.
- Phase 2: notification on threshold cross.

### Data needed
- `HourlyBank.alert_threshold_percent`. Default 25.
- `HourlyBank.alert_sent_at`. Phase 2.

### Verdict
- MVP for the visual.
- Phase 2 for active notification.

### Risk
- False alarms on legitimate slow months.
- Mitigation: compute over rolling window.

---

## Module 4. Overdue-Payment Flags

### Purpose
Cash collection by visibility.

### Users
- Admins.

### Key features
- Aging buckets on dashboard.
- Client list filter for overdue.
- Per-client "Overdue X days" chip.

### Data needed
- Derived from `Payment.status` and `due_date`.

### Verdict
- MVP.

### Risk
- Low.

---

## Module 5. Global Search

### Purpose
Find anything fast.

### Users
- Everyone.

### Key features
- Single input in header.
- Scope chips: Jobs, Clients, Posts, Documents, KB.
- Recent results as you type.
- Server-side full-text where possible.
- Recency boost.

### Data needed
- Postgres full-text indexes on title, body, names.
- Optional later: dedicated search service.

### Verdict
- MVP.

### Risk
- Index maintenance cost.
- Mitigation: scope each query. No "search all" without scope.

---

## Module 6. Saved Views

### Purpose
Personal and team-shared filters.

### Users
- Everyone.

### Key features
- "Save current view" button on lists.
- Personal views by default.
- Pin a view as team-wide. Admin only.

### Data needed
- `SavedView` entity. user_id, scope, filter_json, name, is_team.

### Verdict
- MVP.

### Risk
- Low.

---

## Module 7. Active Time Timer

### Purpose
Accurate time tracking. Not end-of-day recall.

### Users
- Employees.

### Key features
- Start, pause, resume, stop on a job.
- Only one active timer per user.
- Auto-pause on logout.
- Sticky floating bar.

### Data needed
- `TimeSession` entity. user_id, job_id, started_at, ended_at, source.

### Verdict
- MVP.

### Risk
- Forgotten running timers inflate hours.
- Mitigation: idle detect. Daily "you have a running timer" notification.

---

## Module 8. Manual Create-Job-From-Email Form

### Purpose
Reduce hand-rekeying client emails.

### Users
- Admins primarily. Helpdesk too.

### Key features
- Paste email subject and body.
- Pre-fill title and description.
- Pick client.
- Pick department.
- Save as draft job.

### Data needed
- `Job.source` enum field. manual, email_manual, email_agent, etc.

### Verdict
- MVP.

### Risk
- Low.
- This is a stepping stone to Phase 3 ingestion.

---

## Module 9. Notifications Scaffold

### Purpose
Critical alerts that the user must see.

### Users
- Everyone.

### Key features
- `Notification` table.
- In-app bell with unread.
- Triggers for MVP:
  - SLA breach. Triggered immediately for admins and assignee.
  - Job assigned to me.
  - Mention in post.
- Email channel. Phase 2.
- Mobile push. Phase 3.

### Data needed
- `Notification`. Already in spec as later phase. Promote to MVP.

### Verdict
- MVP for scaffold and minimum triggers.
- Phase 2 for email and richer triggers.

### Risk
- Notification fatigue.
- Mitigation: per-user prefs in Settings. Minimal default set.

---

## Module 10. Job Tags Surfaced in UI

### Purpose
Group, filter, and detect repeated issues.

### Users
- Everyone.

### Key features
- Add tags when creating a job.
- Tags visible on cards and detail.
- Filter by tag.
- System and admin-managed tag list.

### Data needed
- `JobTag` join table. Already in data model.

### Verdict
- MVP. Surface the existing model.

### Risk
- Tag sprawl.
- Mitigation: managed list. Admin curates.

---

## Module 11. Client Environment Notes (Lite)

### Purpose
Engineers ramp up faster on each client.

### Users
- Engineers, admins.

### Key features
- New tab on Client page.
- Free-form sections. "Network." "Servers." "Hosting."
- Last-edited timestamp.
- Link a job to an environment record. Phase 2.

### Data needed
- `ClientEnvironmentNote` entity. client_id, section, content, updated_by.

### Verdict
- MVP for the lite version.
- Phase 2 for structured asset entity.

### Risk
- Becomes a write-only wall.
- Mitigation: surface "stale 90 days" warning.

---

## Module 12. Client Environment Inventory (CMDB Lite)

### Purpose
Structured record of servers, network, SaaS, devices.

### Users
- Engineers, admins.

### Key features
- One record per asset.
- Type, host, OS, owner, last touched.
- Credential reference. Pointer only. No secrets.
- Link to jobs.

### Data needed
- `ClientEnvironmentAsset` entity.
- `CredentialReference` entity. vault_name, vault_item_id, owner.

### Verdict
- Phase 2.

### Risk
- Adoption.
- Mitigation: ship with seeded records during onboarding.

---

## Module 13. Recurring Job Templates

### Purpose
Monthly maintenance and audits auto-create jobs.

### Users
- Admins.

### Key features
- Define a template. Title, description, department, tags, SLA, billable.
- Schedule: monthly, weekly, custom cron-lite.
- Auto-create jobs N days before due date.
- Link to monthly billing item.

### Data needed
- `RecurringJobTemplate` entity.

### Verdict
- Phase 2.

### Risk
- Drift if templates change while jobs already issued.
- Mitigation: snapshot fields onto created job.

---

## Module 14. Knowledge Base From Solved Jobs

### Purpose
Reusable resolutions.

### Users
- All employees.

### Key features
- "Promote to KB" on `reviewed` jobs.
- Article: problem, environment, resolution, related jobs.
- Search across articles. Linked from job detail.
- Tags shared with jobs.

### Data needed
- `KnowledgeArticle` entity.

### Verdict
- Phase 2.

### Risk
- Stale articles.
- Mitigation: review-by date field. Annual prompt.

---

## Module 15. Escalation Rules Engine

### Purpose
Auto-alert when a condition trips.

### Users
- Admins.

### Key features
- Rule list. If-then.
- Conditions: priority, status duration, department, client.
- Actions: notify user, change priority, reassign.
- Audit on every rule fire.

### Data needed
- `EscalationRule` entity.

### Verdict
- Phase 2.

### Risk
- Spaghetti rules.
- Mitigation: small DSL. Max 10 rules early.

---

## Module 16. Client Health Score

### Purpose
One number per client. Operational risk.

### Users
- Admins.

### Key features
- Composite score 0 to 100.
- Inputs: hours burn rate, payment timeliness, reopened rate, CSAT.
- Visible on client card and admin dashboard.

### Data needed
- `ClientHealthSnapshot` entity. Updated weekly.

### Verdict
- Phase 2.

### Risk
- Score gamed by ignoring inputs.
- Mitigation: transparency. Show component values.

---

## Module 17. CSAT Capture

### Purpose
Customer satisfaction signal.

### Users
- Admins for analysis. Clients in Phase 3.

### Key features
- 1-tap rating after `reviewed`.
- Optional comment.
- Stored per job.
- Aggregate per client. Per employee. Per service.

### Data needed
- `SatisfactionResponse` entity.

### Verdict
- Phase 2 in admin form.
- Phase 3 if client-facing.

### Risk
- No client responses if internal-only.
- Mitigation: admins fill it during review. Better than nothing.

---

## Module 18. Underpriced-Client Report

### Purpose
Find clients where margin is poor.

### Users
- CEO. CTO for context.

### Key features
- Effort hours vs revenue placeholder.
- Trend over months.
- Flag below threshold.

### Data needed
- No new entities. Aggregated query.

### Verdict
- Phase 2.

### Risk
- Placeholders make the chart meaningless until real prices entered.
- Mitigation: gate behind "prices entered" flag.

---

## Module 19. Approval Workflow

### Purpose
Big decisions go through admin approval.

### Users
- CEO, CTO.

### Key features
- Generic approval entity attached to a job or quote.
- States: requested, approved, rejected.
- One approver required at MVP. Multi-level Phase 3.

### Data needed
- `Approval` entity.

### Verdict
- Phase 2.

### Risk
- Adds friction if used everywhere.
- Mitigation: opt-in per workflow.

---

## Module 20. Project Mode for R&D

### Purpose
Multi-step deliverables for R&D.

### Users
- R&D.

### Key features
- `Job.is_project` flag.
- Milestones with due dates.
- Project-only timeline view.

### Data needed
- `JobMilestone` entity.

### Verdict
- Phase 2.

### Risk
- Pulled into PM-tool territory.
- Mitigation: keep it minimal. No Gantt.

---

## Module 21. Credential Reference Vault Pointer

### Purpose
Engineers find passwords. Portal never stores them.

### Users
- Engineers, admins.

### Key features
- Field per asset and per client.
- Vault name. Item id or URL.
- Owner.
- Last verified date.

### Data needed
- `CredentialReference` entity.

### Verdict
- Phase 2.

### Risk
- Tempt to paste a password.
- Mitigation: explicit "do not paste secrets" rule and a paste-detector that warns on long random strings.

---

## Module 22. Email-to-Job Ingestion (Full Pipeline)

### Purpose
Inbound client emails auto-create draft jobs.

### Users
- Admins. Helpdesk to triage.

### Key features
- Mailbox connector.
- Classifier picks "create job?" yes or no.
- Pre-fills job. Awaits human accept.
- Linked to Financial Documents module's RawEmail.

### Verdict
- Phase 3 or later.

### Risk
- Spam and noise.
- Mitigation: address whitelisting and confirmation step.

---

## Module 23. Limited Client Portal

### Purpose
Clients see their open jobs and invoices.

### Users
- Client contacts.

### Key features
- Magic-link login.
- Read-only views.
- Submit a new request form.

### Verdict
- Phase 3 or later.

### Risk
- Doubles support surface.
- Mitigation: small scope. No file uploads in first iteration.

---

## Module 24. Change Management Workflow

### Purpose
Plan, approve, and record infrastructure changes.

### Users
- Engineers, CTO.

### Key features
- Change ticket with risk, rollback, window.
- Linked to assets.
- Approval before execution.
- Post-change verification.

### Verdict
- Phase 3 or later.

### Risk
- Heavyweight if applied to every job.
- Mitigation: opt-in for high-risk jobs only.

---

## Module 25. Vendor and License Registry

### Purpose
Track Skyware vendors. Track per-client licenses.

### Users
- Admins.

### Key features
- Vendor record. Cost. Renewal date.
- License record per client.
- Renewal radar.

### Verdict
- Phase 3 or later.

### Risk
- Out-of-portal source of truth in finance.
- Mitigation: light. Pointers and dates only.

---

## Module 26. Disaster Recovery Readiness

### Purpose
Track DR readiness per client.

### Users
- Engineers, CTO.

### Key features
- Per-client checklist.
- Last verified date.
- Backup target. RPO. RTO.

### Verdict
- Phase 3 or later. Skyware's "Business Continuity" service makes this attractive.

### Risk
- Document drift.
- Mitigation: quarterly review schedule with auto-recurring jobs.

---

## Module 27. Auto-Generated Client Status Reports

### Purpose
Monthly digest per client.

### Users
- Admins. Then clients.

### Key features
- Hours used. Jobs closed. CSAT. Open items.
- HTML render. Then PDF. Phase 4.

### Verdict
- Phase 3 or later.

### Risk
- Numbers placeholder until prices real.
- Mitigation: gate behind prices flag.

---

## Module 28. Full ITSM Workflow Engine

### Purpose
Generic stateful workflows.

### Verdict
- Reject.
- Job lifecycle plus approvals are enough.

---

## Module 29. Hardware POS Asset Tracking

### Purpose
Serial-number, warranty tracking.

### Verdict
- Reject for now.
- Use the CMDB lite for general assets.

---

## Module 30. Slack or Teams Replacement

### Purpose
Real-time chat.

### Verdict
- Reject.
- Communication module is forum-style on purpose.

---

## Summary table

| Module | Verdict |
|--------|---------|
| 1. SLA tracking and breach detection | MVP and Phase 2 split |
| 2. Severity vs priority | MVP |
| 3. Hourly-bank burn-rate alerts | MVP visual, Phase 2 alert |
| 4. Overdue-payment flags | MVP |
| 5. Global search | MVP |
| 6. Saved views | MVP |
| 7. Active time timer | MVP |
| 8. Manual create-job-from-email form | MVP |
| 9. Notifications scaffold | MVP scaffold, Phase 2 enrich |
| 10. Job tags surfaced in UI | MVP |
| 11. Client environment notes lite | MVP |
| 12. Client environment inventory CMDB lite | Phase 2 |
| 13. Recurring job templates | Phase 2 |
| 14. Knowledge base from solved jobs | Phase 2 |
| 15. Escalation rules engine | Phase 2 |
| 16. Client health score | Phase 2 |
| 17. CSAT capture | Phase 2 |
| 18. Underpriced-client report | Phase 2 |
| 19. Approval workflow | Phase 2 |
| 20. Project mode for R&D | Phase 2 |
| 21. Credential reference, no secrets | Phase 2 |
| 22. Email-to-job ingestion full | Phase 3 |
| 23. Limited client portal | Phase 3 |
| 24. Change management workflow | Phase 3 |
| 25. Vendor and license registry | Phase 3 |
| 26. Disaster recovery readiness | Phase 3 |
| 27. Auto-generated client reports | Phase 3 |
| 28. Full ITSM workflow engine | Reject |
| 29. Hardware POS asset tracking | Reject |
| 30. Slack or Teams replacement | Reject |
