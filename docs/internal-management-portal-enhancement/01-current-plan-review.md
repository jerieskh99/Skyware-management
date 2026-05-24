# Current Plan Review

Source files reviewed on disk:
- `docs/internal-management-portal-spec.md`
- `docs/internal-management-portal-data-model.md`
- `docs/internal-management-portal-mvp-plan.md`

## 1. Current system map

### 1.1 Modules in the spec

Sidebar covers 14 sections.

1. Dashboard.
2. My Jobs.
3. Department Jobs.
4. Global Jobs.
5. Task Hub. Four scopes.
6. Communication. Four channels.
7. Clients.
8. Billing.
9. Receipts and Tax Documents.
10. Financial Documents. Placeholder.
11. Employee Statistics.
12. Agent Control Center. Placeholder.
13. Admin Panel.
14. Settings.

### 1.2 Roles

Three employee roles and two admin roles.

- Helpdesk employee.
- IT employee.
- R&D employee.
- CEO admin.
- CTO admin.

CEO and CTO are identical at MVP.
The data model allows future divergence.

### 1.3 Departments

Four departments.

- Helpdesk.
- IT.
- R&D.
- Global. Pseudo-department for cross-team work.

### 1.4 Data entities

26 entities are proposed in the data model.

Core ops: User, Department, Role.
Customer: Client, BillingAccount.
Money: MonthlyBillingItem, HourlyBank, HourlyBankUsage, OneTimeJobCharge, Payment.
Outbound docs: ReceiptDocument.
Inbound docs: FinancialDocument, RawEmail.
Work: Job, JobStatusEvent, WorkReport.
Comms: CommunicationChannel, CommunicationPost, CommunicationReply, Tag.
System: AuditLog, AgentLog, Attachment, Notification, Session.

`TaskHubItem` is a query, not a table.

### 1.5 Job lifecycle

Ten statuses with documented transitions.

`new` → `assigned` or `available` or `cancelled`.
`available` → `taken` via hub.
Work flows to `working_on_it`.
Pauses to `waiting_for_client` or `waiting_for_admin`.
Completion to `done`. Acceptance to `reviewed`.
Reopen is allowed and tracked.

Every change writes a `JobStatusEvent`.

### 1.6 Workflows captured

- Direct assignment by admin.
- Pull-from-hub by employee with concurrency guard.
- Final summary required on `done`.
- Admin marks `reviewed` with optional note.
- Mark-paid modal with create-receipt handoff.
- Draft to finalize with locked numbering.
- Audit-log writes on critical mutations.

### 1.7 Open questions still on the table

15 questions in spec Section 20.
The blocking ones for any real launch:

- Real client list. Marked "Needs user-provided client list."
- Real employee identities.
- Skyware legal details. Hebrew name, ח.פ., VAT number, address.
- Current VAT rate at launch.
- Allocation-number requirement at launch.
- Digital signature requirement.
- Hosting region preference.
- Ingestion mailbox.
- Default SLA values per priority.
- CEO vs CTO permission divergence.

## 2. What is already strong

- Clear role and permission matrix.
- Job lifecycle is complete and auditable.
- Receipt and tax-document workflow is modeled.
- Israeli compliance flagged as needs-verification.
- Future modules sketched without blocking MVP.
- Dual framing for statistics, not pure surveillance.
- Audit log written inside the mutation transaction.
- Bilingual scaffold from day one.
- Concurrency model for hub-take is correct.
- VAT rate stored per document, not hard-coded.
- Numbering sequence with no-gap guarantee.
- Sensitive financial pages are admin-only by default.
- Feature flags for placeholder modules.

## 3. What is missing for an IT services company

Listed by impact, not by effort.

### 3.1 SLA visibility

SLA targets exist as numbers.
Breach detection and alerting do not.
No client-specific SLA contracts.
No SLA performance report.

### 3.2 Severity vs priority

Only priority exists today.
IT operations need impact-vs-urgency split.
P1 outage looks identical to P1 favor request.

### 3.3 Recurring work

Monthly patching, audits, reviews recur.
Spec mentions recurring jobs in Phase 2.
No template entity yet.

### 3.4 Knowledge from solved jobs

Solved jobs are lost into history.
No reusable knowledge base.
No linkage of similar issues across clients.

### 3.5 Client environment context

Engineers need to know each client's setup.
Servers, network, hosting, contacts.
No structured field for this today.
"Notes" is a free-text catch-all.

### 3.6 Asset inventory

IT companies often track client assets.
Laptops, servers, licenses, renewals.
Not in scope today. Sometimes needed.

### 3.7 Burn-rate awareness

Hourly bank can quietly drain.
Spec defers alerting to later.
This is the highest-revenue blind spot.

### 3.8 Cash flow surface

Unpaid total is in the admin dashboard.
No aging buckets. No per-client risk flag.
No notice for "overdue 60 days."

### 3.9 Profitability per client

Statistics page mentions "high-effort clients."
No first-class profitability metric.
No effort-vs-revenue chart per client.

### 3.10 Repeated-issue detection

Mentioned as a future agent capability.
No data structure for incident clustering.
No tag taxonomy on jobs for grouping.

### 3.11 Escalation

No escalation rules.
No on-call rotation.
No "Urgent unanswered for 30 minutes" alert.

### 3.12 Notifications

Listed as later phase.
Nothing actionable runs in MVP.
SLA breach with no notice is a missed promise.

### 3.13 Active time tracking

Time spent is reported at `done`.
This is a recall task, often inaccurate.
A simple start/pause/stop timer changes accuracy.

### 3.14 Approval flow

Large jobs and proposals need CEO sign-off.
No formal approval entity exists.

### 3.15 Search

Header has "global search."
No detail on scope or ranking.
Should span jobs, clients, posts, documents.

### 3.16 Saved views

Filters exist on lists.
No way to save and share a filter set.
Daily-driver users want this within a week.

### 3.17 Mobile usage

Helpdesk staff often respond from phones.
Spec does not call out responsive design depth.

### 3.18 Customer satisfaction

No CSAT or NPS signal anywhere.
Even a 1-tap rating on `reviewed` is valuable.

### 3.19 Quote and proposal flow

Pre-sale quotes are not modeled.
Proforma invoice exists but only post-decision.

### 3.20 Credential reference

Engineers need to access client systems.
Real credentials must not live in the portal.
A pointer to the password manager is healthy.

## 4. Risks in the current plan

### 4.1 Statistics-as-surveillance perception

Spec acknowledges and mitigates.
Real risk is operational, not legal.
Employees push back if the framing slips.

### 4.2 Israeli compliance overconfidence

Allocation number, digital signature, retention.
All three need accountant sign-off.
Any premature finalize is legally hazardous.

### 4.3 Plan size

The spec is large.
MVP is generously scoped already.
Risk of trying to ship the entire spec at once.

### 4.4 Hub abandonment

Items in hubs may sit untaken.
No fallback to direct assignment.
No metric flagged for hub take latency.

### 4.5 Notification deferral

Without notifications, SLA targets become decorative.
Need at least one channel for breaches.

### 4.6 No client-side touchpoint

Clients have zero visibility.
Status updates rely on email or phone.
Eventually this becomes a retention drag.

### 4.7 Hourly bank top-up gap

If a bank empties mid-job, what happens?
No documented behavior for negative hours.

## 5. Biggest opportunities

Ranked for impact.

1. SLA tracking and breach alerts. Drives service-quality reputation.
2. Hourly-bank burn alerts. Drives upsell timing.
3. Knowledge base from solved jobs. Drives speed and onboarding.
4. Recurring jobs. Drives revenue and reduces no-show maintenance.
5. Client environment notes. Drives engineer ramp-up time.
6. Repeated-issue detection. Drives productization candidates.
7. CSAT capture. Drives retention signals.
8. Underpriced-client detector. Drives renegotiation timing.
9. Saved views and global search. Drives daily-driver efficiency.
10. Active time timer. Drives billing accuracy.

These ten directly improve revenue, retention, and clarity.
Each fits the original system without breaking it.
