# Implementation-Ready Specification

Authoritative behavior spec for the Skyware Internal Management Portal.
Reconciles the original spec with the accepted enhancements.

## 1. Product overview

An internal operations portal for Skyware IT LTD employees and admins.
Centralizes job assignment, work execution, internal communication, client management, and billing.
Includes a draft-only workflow for Israeli payment documents.
Includes placeholder pages for future financial-email ingestion and an internal automation agent.

The portal is not a CRM.
The portal is not a customer support tool.
The portal is not a public-facing system.
The portal is not a general-ledger accounting system.

## 2. User roles

Five roles. Two admin, three employee.

| Role | Type | Default department scope |
|---|---|---|
| Helpdesk Employee | Employee | Helpdesk |
| IT Employee | Employee | IT |
| R&D Employee | Employee | R&D |
| CEO | Admin | Full |
| CTO | Admin | Full |

CEO and CTO are identical at MVP.
The model allows future divergence.

## 3. Departments

Four departments. Fixed seed.

- Helpdesk.
- IT.
- R&D.
- Global. Pseudo-department for cross-team work.

The Global department is a real row for FK simplicity.

## 4. Permissions

Enforcement happens at the API layer.
The UI hides what the API would refuse.
All forbidden routes return 403 with a neutral empty state.

### 4.1 Read permissions

| Capability | Employee | Admin |
|---|---|---|
| Login | Yes | Yes |
| Own jobs | Yes | Yes |
| Department jobs | Own dept only | All |
| Global jobs | Yes | Yes |
| Department hub | Own dept only | All |
| Global hub | Yes | Yes |
| Global channel | Yes | Yes |
| Department channel | Own dept only | All |
| Clients | No | Yes |
| Billing | No | Yes |
| Receipts | No | Yes |
| Financial Documents | No | Yes |
| Employee Statistics cross-employee | No | Yes |
| Own Statistics widgets | Yes (own only) | Yes |
| Agent Control Center | No | Yes |
| Audit Log | No | Yes |
| Admin Panel | No | Yes |

### 4.2 Write permissions

| Capability | Employee | Admin |
|---|---|---|
| Create job | No | Yes |
| Assign job | No | Yes |
| Status change on own job | Yes (per lifecycle) | Yes (any) |
| Mark Reviewed | No | Yes |
| Take task from hub | Yes (eligible scope) | Yes |
| Post in own channel | Yes | Yes |
| Post in any channel | No | Yes |
| Manage clients | No | Yes |
| Manage billing items | No | Yes |
| Mark payment Paid | No | Yes |
| Create receipt draft | No | Yes |
| Finalize receipt | No (feature-flag gated) | Yes (feature-flag gated) |
| Edit own profile | Yes | Yes |
| Manage users | No | Yes |
| Manage tags | No | Yes |
| Manage feature flags | No | Yes |

### 4.3 Field-level rules

- `Job.admin_note` is admin-only.
- `Client.notes` is admin-only.
- `Attachment.visibility = admin_only` is admin-only.
- `ClientEnvironmentNote` is visible to admins and engineers. No client-facing read at MVP.

## 5. Navigation structure

Persistent left sidebar.
Header has global search, language toggle, user menu.
No notification bell at MVP. Phase 2 adds it.

### 5.1 Sidebar: employee view

1. Dashboard
2. My Jobs
3. Task Hub. Global plus own department.
4. Department Jobs (own department)
5. Global Jobs
6. Communication. Global plus own department.
7. Settings

### 5.2 Sidebar: admin view

1. Dashboard
2. My Jobs
3. Task Hub. Global, Helpdesk, IT, R&D.
4. Department Jobs. Helpdesk, IT, R&D.
5. Global Jobs
6. Communication. Global, Helpdesk, IT, R&D.
7. Clients
8. Billing
9. Receipts and Tax Documents
10. Financial Documents (placeholder, feature-flagged)
11. Employee Statistics
12. Agent Control Center (placeholder, feature-flagged)
13. Admin Panel
14. Settings

### 5.3 Header

- Logo and breadcrumb on the left.
- Global search input in the center.
- Language toggle on the right. English and Hebrew. Persists per user.
- User menu on the right. Profile, Settings, Logout.

## 6. Page-by-page requirements

### 6.1 Dashboard

#### Employee dashboard sections (top to bottom)
- Status strip: active jobs, delayed jobs, hours this week.
- Resume work card. Only if a timer is paused.
- "Working on it" cards.
- "Assigned, not started" list.
- "Available in your hub." Maximum 5 cards. Link to full hub.
- Communication highlights from last 24 hours.

#### Admin dashboard sections (top to bottom)
- KPI strip: active jobs, delayed, hours this month, total unpaid placeholder.
- "Needs attention." Jobs in `waiting_for_admin`.
- "Reviews pending." Jobs in `done` not yet `reviewed`.
- "Aging payments." Buckets 0-30, 31-60, 61-90, 90 plus.
- "Hourly banks low." Clients near burnout.
- "Recent client activity." Last 7 days.

### 6.2 My Jobs

- Default filter: jobs assigned to current user, not Reviewed and not Cancelled.
- Columns: title, client, status, priority, severity, age, last update.
- Filters: status, priority, severity, client, department, date range, tags.
- Sort: priority desc, then created date.
- Saved views supported.
- Row hover actions: open detail, mark "Working on it," mark "Done," add note.
- Closed toggle reveals Done, Reviewed, Cancelled history.

### 6.3 Department Jobs

- One page per department. Admin sees a unified view too.
- Employee sees only own department.
- Columns and filters identical to My Jobs.
- Saved views supported.

### 6.4 Global Jobs

- Jobs with department Global.
- Columns and filters identical to My Jobs.
- Saved views supported.

### 6.5 Task Hub

- Four hubs in admin view. One own-department hub plus Global for employees.
- Cards layout, not table.
- Each card: title, client, priority, severity, posted-at, "Take task" button.
- Visibility scoped per role.
- Take action uses optimistic concurrency. Conditional update on status equals `available`.
- Auto-refresh every 30 seconds.

### 6.6 Communication

- Four channels.
- Each channel: title, post list, compose box at the top.
- Posts have title, body markdown, tags, attachments, related job, related client.
- Replies under each post.
- Resolved flag. Pinned flag for admins.
- Filters: tag, author, related client, related job, resolved.
- Search inside channel and global search across all channels.

### 6.7 Clients

- Admin-only.
- List view: company name, contact person, status, monthly status, hourly status, last activity, overdue flag.
- Filters: active or inactive, has monthly, has hourly bank, has overdue payment.
- Saved views supported.
- Detail view tabs:
  - Overview.
  - Jobs.
  - Billing.
  - Payments.
  - Receipts.
  - Environment. Free-text notes by section in MVP.
  - Notes. Admin-private.

### 6.8 Billing

- Admin-only.
- Master view of all billing items and payments.
- Tabs: All payments, Monthly, Hourly banks, One-time, Drafts.
- Filters by client, status, source, date.
- Aging-bucket strip at the top.
- Saved views supported.
- Row hover actions: Mark sent, Mark paid, Open detail.

### 6.9 Mark-paid drawer

Triggered from a Payment row.

- Paid date.
- Method enum: bank_transfer, bit, cheque, cash, credit_card, other.
- Reference, the Israeli asmachta number.
- Optional note.
- Checkbox: "Create receipt or tax document."
- On submit:
  - Payment updates to Paid.
  - AuditLog row written.
  - If checkbox set, route to receipt draft pre-filled.

### 6.10 Receipts and Tax Documents

- Admin-only.
- List of documents with filter by type, client, date, status.
- Verification banner across every page until accountant sign-off.

#### Document types (Hebrew names tentative, need verification)
- Invoice (חשבון עסקה).
- Receipt (קבלה).
- Tax Invoice (חשבונית מס).
- Tax Invoice + Receipt (חשבונית מס קבלה).
- Credit Note (חשבונית זיכוי).
- Proforma Invoice (חשבון עסקה פרופורמה or הצעת מחיר).

#### Creation flow
1. Admin picks document type.
2. Picks client.
3. Picks source payment if available.
4. Edits description lines.
5. Reviews VAT and total.
6. Picks language.
7. Saves as Draft.
8. Clicks Finalize behind a feature flag.
9. System assigns the next document_number for the type and year.
10. Document becomes immutable.
11. HTML view available. PDF deferred to Phase 2.

### 6.11 Financial Documents

- Admin-only.
- Placeholder page with empty state.
- Feature-flagged off by default.
- See `02-implementation-ready-spec.md` Section 13 for the future design.

### 6.12 Employee Statistics

- Admin sees cross-employee.
- Employees see only own.
- Banner reinforces "operational insight, not surveillance."
- Filters: employee, department, client, tag, date, status.
- Bucketing: day, week, month.
- Per-employee metrics:
  - Jobs completed.
  - Hours reported.
  - Avg completion time per priority.
  - Active jobs.
  - Delayed jobs.
  - Reopened rate.
  - Weekly activity sparkline.
- Business metrics:
  - Workload distribution.
  - High-effort clients.
  - Departments under pressure.
  - Hub vs assignment ratio.
  - Hub take latency.
- Export to CSV.

### 6.13 Agent Control Center

- Admin-only.
- Placeholder. Page is desaturated to indicate "not live."
- Sections: status badge, planned capabilities, permissions matrix, tasks handled (empty), logs (empty), controls (disabled), notes panel (editable).
- Feature-flagged off by default.

### 6.14 Admin Panel

- Manage users. Create, deactivate, reset password, change role and department.
- Manage tags. Curated list.
- View Audit Log. Search by entity, actor, action.
- Manage feature flags.
- Manage default SLA values per priority.
- Manage company details for receipt headers.

### 6.15 Settings

- Per-user: display name, password, email, language, timezone, notification preferences placeholder.

## 7. Job lifecycle

### 7.1 Statuses

- `new`.
- `assigned`.
- `available`.
- `taken`.
- `working_on_it`.
- `waiting_for_client`.
- `waiting_for_admin`.
- `done`.
- `reviewed`.
- `cancelled`.

### 7.2 Allowed transitions

| From | Allowed to | Actor |
|---|---|---|
| new | assigned | admin |
| new | available | admin |
| new | cancelled | admin |
| assigned | working_on_it | assignee or admin |
| assigned | waiting_for_client | assignee or admin |
| assigned | waiting_for_admin | assignee or admin |
| assigned | cancelled | admin |
| available | taken | any eligible employee |
| available | cancelled | admin |
| taken | working_on_it | assignee or admin |
| taken | waiting_for_client | assignee or admin |
| taken | waiting_for_admin | assignee or admin |
| taken | cancelled | admin |
| working_on_it | done | assignee or admin |
| working_on_it | waiting_for_client | assignee or admin |
| working_on_it | waiting_for_admin | assignee or admin |
| working_on_it | cancelled | admin |
| waiting_for_client | working_on_it | assignee or admin |
| waiting_for_client | cancelled | admin |
| waiting_for_admin | working_on_it | admin |
| waiting_for_admin | cancelled | admin |
| done | reviewed | admin |
| done | working_on_it (reopen) | assignee or admin |
| reviewed | working_on_it (reopen) | admin only |
| cancelled | (terminal) | none |

### 7.3 Required fields on transitions

- Every transition writes a JobStatusEvent.
- `done` requires a WorkReport: summary text and time spent minutes.
- Reopen sets `reopened = true` on the event.

### 7.4 Priority and severity

- Priority enum: low, normal, high, urgent.
- Severity enum: minor, moderate, major, critical.
- The pair derives the SLA target. See Section 7.5.

### 7.5 SLA target

- Stored on Job as `sla_target_minutes`.
- Derivation default at MVP:
  - Effective SLA equals min(priority SLA, severity SLA).
  - Priority defaults: urgent 240, high 1440, normal 4320, low 10080 minutes.
  - Severity defaults: critical 240, major 1440, moderate 4320, minor 10080 minutes.
- Admin Panel may override defaults.
- Per-client override: Phase 2.

### 7.6 Delayed detection

- Display only at MVP.
- A job is delayed if elapsed time since `assigned_timestamp` or `taken_timestamp` exceeds `sla_target_minutes` and status is not terminal.
- No automated breach event. No notification.
- The UI shows a colored bar and a "delayed" filter.

## 8. Task hub lifecycle

### 8.1 Lifecycle steps

- Admin creates a job with no assignee.
- Selects "Send to hub" with a department choice.
- Job becomes `available` in that hub.
- Eligible employees see the card.
- Employee clicks "Take task."
- Status transitions to `taken`. Assignee set. Timestamps recorded.
- Flow follows Section 7.

### 8.2 Concurrency

- Conditional update where status equals `available`.
- The loser sees "Already taken."
- UI refreshes.

### 8.3 Visibility rules

- Global hub: all users.
- Department hub: own department and admins.

## 9. Communication system

### 9.1 Channels

- Four canonical channels. Seeded. Names available in English and Hebrew.

### 9.2 Post

- title, body markdown, tags, attachments, related_job_id, related_client_id, pinned, resolved.
- Author and timestamp.

### 9.3 Reply

- post_id, author, body, attachments.

### 9.4 Tags

Seeded list. Editable by admins.

- urgent.
- client_issue.
- technical_note.
- internal_update.
- needs_admin.
- solved.
- follow_up_required.

### 9.5 Search

- Full text on title and body.
- Filter by tag, author, channel, date, related client, related job, resolved.

### 9.6 Mentions and notifications

- Out of MVP.
- Phase 2 adds in-app notification on mention and needs_admin tag.

## 10. Client management

### 10.1 Client fields

- client_id, company_name, contact_person, email, phone, address.
- israeli_tax_id placeholder.
- status: active, inactive.
- notes admin-only.
- created_by, created_at, updated_at.

### 10.2 BillingAccount

- One per Client. Auto-created on Client create.
- default_currency. Default ILS.

### 10.3 Environment notes lite (MVP)

- Free text per section.
- Sections: network, servers, hosting, contacts, vendors, security, backup, other.
- Last edited timestamp and editor.
- Visible to admins and engineers.

### 10.4 Asset inventory CMDB lite

- Phase 2.
- Structured asset records.
- Credential reference. No secrets stored.

## 11. Billing model

### 11.1 Monthly payment

- service_name.
- price_amount_placeholder. Money minor units. Currency.
- billing_cycle. monthly only in MVP.
- start_date. end_date optional.
- status: active, paused, cancelled, none.
- last_billed_period. next_due_date.
- Each cycle generates a Payment row.

### 11.2 Hourly bank

- total_hours_purchased_placeholder.
- price_per_hour_placeholder.
- total_payment_placeholder.
- purchase_date. expiry_date optional.
- status: active, used_up, none.
- hours_used and hours_remaining derived from HourlyBankUsage.
- alert_threshold_percent. Default 25 in MVP.
- Burn-rate bar uses these fields.

### 11.3 One-time job payment

- linked_job_id unique.
- job_name_snapshot.
- price_amount_placeholder. Currency.
- date_created, date_paid, linked_receipt_id.

### 11.4 Payment

- Single unified entity for all three categories.
- source_type and source_id.
- amount_placeholder, currency.
- issued_date, due_date, paid_date.
- status: draft, sent_to_client, waiting_for_payment, partially_paid, paid, cancelled, overdue.
- method, reference, linked_receipt_id, notes.
- overdue derived where `due_date < today` and status not in (paid, cancelled).
- Aging buckets derived: 0-30, 31-60, 61-90, 90 plus.

## 12. Receipt and tax-document workflow

### 12.1 Document types

Listed in Section 6.10.

### 12.2 Numbering

- Sequence per type per year.
- A ReceiptDocumentSequence row tracks next_number.
- SELECT FOR UPDATE on finalize prevents gaps.
- Drafts are not numbered.

### 12.3 Verification banner

- Always shown until accountant sign-off.
- Finalize is feature-flagged off in production until ready.

### 12.4 Immutability

- Finalized documents cannot be edited.
- Corrections require Credit Note plus new corrected document.

### 12.5 Fields

- company_details, client_details, document_number, issue_date, payment_date.
- description_lines: description, quantity, unit_price, subtotal.
- amount_before_vat, vat_rate_basis_points, vat_amount, total_amount.
- payment_method, reference, currency, notes.
- language: he, en, both.
- allocation_number and status. Default not_required at MVP.

### 12.6 PDF rendering

- Out of MVP. Phase 2.
- HTML view is enough at MVP.

## 13. Israeli compliance notes

Each statement requires accountant verification.

- The Israeli VAT rate at issuance is stored per document. Placeholder rate 18 percent.
- Allocation numbers (מספרי הקצאה) may apply above a yearly-decreasing threshold.
- Digital signature may be required for tax documents.
- Document retention policy is typically 7 years. Verify.
- Hebrew RTL must render correctly on documents.
- Hebrew title is required on Israeli-language documents.
- Foreign-currency invoices have additional rules.
- No document is issued to a real client until accountant sign-off.

## 14. Future financial-email ingestion placeholder

The Financial Documents page is a placeholder in MVP.

Future scope, kept for design alignment:

- Ingest a dedicated mailbox.
- Classify each message.
- Extract structured fields.
- Link to clients, jobs, payments.
- Admin review and accept.

No code in MVP. The page shows planned behavior and the empty state.

## 15. Agent placeholder page

- Status badge: offline, testing, active. Default offline.
- Planned capabilities list. Read-only.
- Permissions matrix. Read-only.
- Tasks table empty.
- Logs empty.
- Controls disabled.
- Notes panel editable.
- Feature-flagged.

## 16. Employee statistics

Per Section 6.12.
Filters and exports work in MVP.
No advanced analytics. Phase 2.

## 17. Audit and history model

Two complementary logs.

### 17.1 JobStatusEvent
- Job lifecycle timeline.
- Append-only.

### 17.2 AuditLog
- System-wide append-only log.
- Written inside the same transaction as the mutation.
- Action names use `domain.verb`.
- Sensitive fields redacted.

## 18. Security and permission notes

- Passwords hashed with argon2 or bcrypt.
- Sessions invalidate on logout and password reset.
- Rate limit on login and password reset endpoints.
- HTTPS enforced.
- Security headers: CSP, HSTS, X-Content-Type-Options, frame-ancestors.
- Admin-only routes return 403 with a neutral empty state.
- No real secrets or credentials stored anywhere.
- CredentialReference Phase 2 entity is a pointer only.
- No third-party OAuth tokens stored at MVP.

## 19. Internationalization

- Hebrew and English from day one.
- RTL on the body element when Hebrew.
- Bilingual labels in seeded enums.
- Asia/Jerusalem display.

## 20. Search and saved views

- Postgres full-text indexes on Job title and description, Client company_name, Communication post title and body, ReceiptDocument client snapshot.
- Header search input. Scope chips. Recency boost.
- SavedView entity. Per-page filter sets. Optional team-shared by admin.

## 21. Time tracking

- TimeSession entity.
- One active session per user.
- Pause, resume, stop. Auto-pause on logout.
- Idle warning after a configurable threshold.
- WorkReport.total_time_minutes prefilled from sum of TimeSession durations.

## 22. Tags

- Existing Tag and JobTag tables surfaced.
- Admin curates the list.
- Visible on cards, filters, detail.
- Foundation for repeated-issue detection.

## 23. Open questions

Decisions blocked on user input.
See `01-accepted-scope.md` Section 9.
