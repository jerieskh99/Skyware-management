# Skyware Internal Management Portal — Data Model

Version: 0.1 (planning draft)
Date: 2026-05-15
Status: Specification only.

This document defines the proposed entities, fields, relationships, status enums, permission rules, and the audit-log model. It pairs with `internal-management-portal-spec.md`.

Conventions:
- All primary keys are UUID v4 unless noted.
- All timestamps stored in UTC, displayed in Asia/Jerusalem.
- All money amounts stored as integer minor units (e.g., agorot for ILS). Currency stored alongside.
- All string lengths assumed unbounded text unless noted.
- Field `created_at` and `updated_at` exist on every entity unless explicitly noted; the table listings below omit them to reduce noise.
- "FK" means foreign key.

---

## 1. Proposed Database Tables / Entities

The entity list, with one-line purpose:

1. `User` — a person who logs in.
2. `Department` — Helpdesk, IT, R&D, Global.
3. `Role` — Employee, CEO, CTO. Permissions attach here.
4. `Client` — a customer company.
5. `BillingAccount` — one per Client.
6. `MonthlyBillingItem` — a recurring monthly plan on a BillingAccount.
7. `HourlyBank` — a prepaid block of hours on a BillingAccount.
8. `HourlyBankUsage` — a draw against a HourlyBank, written when work is reported.
9. `OneTimeJobCharge` — a single-job charge bound to a Job.
10. `Job` — a unit of work.
11. `JobStatusEvent` — timestamped status changes on a Job.
12. `WorkReport` — the final summary written when a Job becomes Done.
13. `CommunicationChannel` — Global, Helpdesk, IT, R&D.
14. `CommunicationPost` — top-level post in a channel.
15. `CommunicationReply` — reply under a post.
16. `Tag` — communication and job tags.
17. `Payment` — a money-movement record, paid or unpaid.
18. `ReceiptDocument` — an outbound document Skyware issues (receipt, tax invoice, etc.).
19. `FinancialDocument` — an inbound document Skyware receives (future).
20. `RawEmail` — captured inbound mail for the ingestion pipeline (future).
21. `AgentLog` — automation agent activity (future).
22. `AuditLog` — append-only system event log.
23. `Attachment` — a file blob reference attached to jobs, posts, or documents.
24. `Notification` — in-app notification (later phase).
25. `Session` — auth session (or delegated to the chosen auth library).
26. `PasswordResetToken` — when not delegated to auth library.

`TaskHubItem` from the spec is not a separate table. It is a query over `Job WHERE status = 'Available' AND department = ?`.

---

## 2. Fields per Entity

### 2.1 User
- id (UUID, PK)
- username (string, unique, lowercase, required)
- email (string, unique, required)
- display_name (string, required)
- password_hash (string)
- department_id (UUID, FK Department, required)
- role_id (UUID, FK Role, required)
- is_active (boolean, default true)
- language_pref (enum: en, he, default en)
- timezone (string, default "Asia/Jerusalem")
- last_login_at (timestamp, nullable)
- avatar_attachment_id (UUID, FK Attachment, nullable)

Indexes: unique(username), unique(email), (department_id), (role_id).

### 2.2 Department
- id (UUID, PK)
- key (enum: helpdesk, it, rnd, global, unique)
- name_en (string)
- name_he (string)
- is_global (boolean, derived from key = 'global')

Seed data: four fixed rows. The `key` is the stable identifier referenced in code.

### 2.3 Role
- id (UUID, PK)
- key (enum: employee, ceo, cto, unique)
- name_en (string)
- name_he (string)
- is_admin (boolean: true for ceo and cto)

Permissions are coded against `key`, not against `id`. See Section 4.

### 2.4 Client
- id (UUID, PK)
- company_name (string, required)
- contact_person (string, nullable)
- email (string, nullable)
- phone (string, nullable)
- address (string, nullable, multi-line)
- israeli_tax_id (string, nullable, placeholder validation only)
- status (enum: active, inactive, default active)
- notes (text, nullable, admin-only readable)
- created_by_user_id (UUID, FK User)

Indexes: (company_name) for search, (status), (israeli_tax_id) unique-if-present.

### 2.5 BillingAccount
- id (UUID, PK)
- client_id (UUID, FK Client, unique)
- default_currency (enum: ILS, USD, EUR, default ILS)
- notes (text, nullable)

One-to-one with Client. Created at the same time as a Client.

### 2.6 MonthlyBillingItem
- id (UUID, PK)
- billing_account_id (UUID, FK BillingAccount)
- service_name (string, required)
- price_amount_placeholder (integer, minor units, placeholder until verified)
- currency (enum: ILS, USD, EUR)
- billing_cycle (enum: monthly; quarterly and yearly reserved for later)
- start_date (date)
- end_date (date, nullable)
- status (enum: active, paused, cancelled, none, default active)
- last_billed_period (string YYYY-MM, nullable)
- next_due_date (date, nullable)

Indexes: (billing_account_id), (status), (next_due_date).

### 2.7 HourlyBank
- id (UUID, PK)
- billing_account_id (UUID, FK BillingAccount)
- total_hours_purchased_placeholder (integer, minutes)
- price_per_hour_placeholder (integer, minor units)
- total_payment_placeholder (integer, minor units)
- currency (enum)
- purchase_date (date)
- expiry_date (date, nullable)
- status (enum: active, used_up, none, default active)

Indexes: (billing_account_id), (status).

`hours_used` and `hours_remaining` are derived from `HourlyBankUsage` aggregation, not stored.

### 2.8 HourlyBankUsage
- id (UUID, PK)
- hourly_bank_id (UUID, FK HourlyBank)
- job_id (UUID, FK Job)
- minutes_used (integer, required, > 0)
- used_at (timestamp)
- recorded_by_user_id (UUID, FK User)
- note (text, nullable)

Indexes: (hourly_bank_id, used_at), (job_id).

### 2.9 OneTimeJobCharge
- id (UUID, PK)
- billing_account_id (UUID, FK BillingAccount)
- job_id (UUID, FK Job, unique)
- job_name_snapshot (string)
- price_amount_placeholder (integer, minor units)
- currency (enum)
- payment_id (UUID, FK Payment, nullable)
- date_created (timestamp)
- date_paid (timestamp, nullable)

Indexes: unique(job_id), (billing_account_id).

### 2.10 Job
- id (UUID, PK)
- public_number (integer, auto-increment per year, e.g., 2026-0007 as derived display)
- client_id (UUID, FK Client, nullable for internal jobs)
- department_id (UUID, FK Department, required)
- title (string, required)
- description (text)
- assigned_employee_id (UUID, FK User, nullable)
- created_by_user_id (UUID, FK User, required)
- status (enum, see Section 5.1)
- priority (enum: low, normal, high, urgent, default normal)
- sla_target_minutes (integer, derived from priority at creation, editable)
- created_at (timestamp)
- assigned_timestamp (timestamp, nullable)
- taken_timestamp (timestamp, nullable; equals assigned_timestamp if pulled from hub by employee)
- started_timestamp (timestamp, nullable; set on first transition to Working on it)
- completed_timestamp (timestamp, nullable; set on transition to Done)
- reviewed_timestamp (timestamp, nullable; set on transition to Reviewed)
- cancelled_timestamp (timestamp, nullable)
- time_spent_minutes (integer, default 0; cumulative of all transitions)
- admin_note (text, nullable, admin-only readable)
- is_billable (boolean, default true)
- linked_payment_id (UUID, FK Payment, nullable)
- linked_one_time_charge_id (UUID, FK OneTimeJobCharge, nullable)

Indexes: (department_id, status), (assigned_employee_id, status), (client_id), (status, created_at), (priority, status).

### 2.11 JobStatusEvent
- id (UUID, PK)
- job_id (UUID, FK Job)
- from_status (enum, nullable for creation event)
- to_status (enum)
- changed_by_user_id (UUID, FK User)
- changed_at (timestamp)
- note (text, nullable)
- time_spent_delta_minutes (integer, default 0; what this event reported as additional time)
- reopened (boolean, default false; true when going Done/Reviewed → Working on it)

Indexes: (job_id, changed_at), (changed_by_user_id, changed_at).

Append-only. No updates. No deletes.

### 2.12 WorkReport
- id (UUID, PK)
- job_id (UUID, FK Job, unique)
- summary (text, required)
- total_time_minutes (integer, required)
- billable (boolean, default true)
- submitted_by_user_id (UUID, FK User)
- submitted_at (timestamp)
- approved_by_user_id (UUID, FK User, nullable; set on Reviewed)
- approved_at (timestamp, nullable)

Indexes: unique(job_id).

### 2.13 CommunicationChannel
- id (UUID, PK)
- key (enum: global, helpdesk, it, rnd, unique)
- department_id (UUID, FK Department, nullable; null for global)
- name_en (string)
- name_he (string)
- description (text, nullable)

Seed data: four fixed rows.

### 2.14 CommunicationPost
- id (UUID, PK)
- channel_id (UUID, FK CommunicationChannel)
- author_id (UUID, FK User)
- title (string, required)
- body (text, markdown allowed)
- related_job_id (UUID, FK Job, nullable)
- related_client_id (UUID, FK Client, nullable)
- pinned (boolean, default false; admin-only set)
- resolved (boolean, default false)

Indexes: (channel_id, created_at desc), (author_id), full-text on title+body.

### 2.15 CommunicationReply
- id (UUID, PK)
- post_id (UUID, FK CommunicationPost)
- author_id (UUID, FK User)
- body (text)

Indexes: (post_id, created_at).

### 2.16 Tag
- id (UUID, PK)
- key (string, unique)
- label_en (string)
- label_he (string)
- scope (enum: communication, job, both, default communication)
- is_system (boolean; true for the seven seeded tags)
- color_hex (string, nullable)

And join tables:
- `PostTag(post_id, tag_id)` with composite PK.
- `JobTag(job_id, tag_id)` with composite PK.

Seed (system tags): urgent, client_issue, technical_note, internal_update, needs_admin, solved, follow_up_required.

### 2.17 Payment
- id (UUID, PK)
- client_id (UUID, FK Client)
- source_type (enum: monthly, hourly_bank, one_time)
- source_id (UUID, depends on source_type; not a hard FK at DB level due to polymorphism, but enforced at application level)
- amount_placeholder (integer, minor units)
- currency (enum)
- issued_date (date)
- due_date (date, nullable)
- paid_date (date, nullable)
- status (enum, see Section 5.2)
- method (enum: bank_transfer, bit, cheque, cash, credit_card, other, nullable until paid)
- reference (string, nullable; the Israeli asmachta number when paid)
- linked_receipt_id (UUID, FK ReceiptDocument, nullable)
- notes (text, nullable)
- created_by_user_id (UUID, FK User)

Indexes: (client_id, status), (status, due_date), (paid_date).

### 2.18 ReceiptDocument
- id (UUID, PK)
- type (enum: invoice, receipt, tax_invoice, tax_invoice_receipt, credit_note, proforma_invoice)
- client_id (UUID, FK Client)
- payment_id (UUID, FK Payment, nullable)
- document_number (integer, nullable while draft, assigned on finalize, immutable after)
- document_number_year (integer, nullable while draft)
- status (enum: draft, finalized, cancelled)
- issue_date (date)
- payment_date (date, nullable)
- description_lines (JSON: array of {description, quantity, unit_price, subtotal})
- amount_before_vat (integer, minor units)
- vat_rate_basis_points (integer, e.g., 1800 for 18 percent; stored per document so future rate changes do not rewrite history)
- vat_amount (integer, minor units)
- total_amount (integer, minor units)
- payment_method (enum, nullable)
- reference (string, nullable)
- currency (enum)
- notes (text, nullable)
- language (enum: he, en, both, default he)
- allocation_number (string, nullable)
- allocation_status (enum: not_required, pending, issued, failed, default not_required)
- allocation_obtained_at (timestamp, nullable)
- finalized_at (timestamp, nullable)
- finalized_by_user_id (UUID, FK User, nullable)

Indexes: unique(type, document_number_year, document_number) when document_number is not null; (client_id), (payment_id), (status).

Numbering: a `ReceiptDocumentSequence(type, year)` table tracks `next_number`. A SELECT FOR UPDATE on finalize protects against gaps.

### 2.19 FinancialDocument (future)
- id (UUID, PK)
- type (enum: client_payment_confirmation, bank_transfer_confirmation, supplier_invoice, supplier_receipt, company_expense, subscription_invoice, tax_document, other)
- source (enum: email, manual_upload, agent)
- raw_email_id (UUID, FK RawEmail, nullable)
- attachment_id (UUID, FK Attachment, nullable)
- vendor_or_payer_name (string, nullable)
- document_number_extracted (string, nullable)
- issue_date (date, nullable)
- amount_extracted (integer, minor units, nullable)
- vat_extracted (integer, minor units, nullable)
- currency_extracted (enum, nullable)
- linked_client_id (UUID, FK Client, nullable)
- linked_job_id (UUID, FK Job, nullable)
- linked_payment_id (UUID, FK Payment, nullable)
- linked_receipt_id (UUID, FK ReceiptDocument, nullable)
- review_status (enum: unreviewed, reviewed, archived, default unreviewed)
- reviewed_by_user_id (UUID, FK User, nullable)
- reviewed_at (timestamp, nullable)
- extracted_payload_json (JSON, the full classifier output)
- ocr_text (text, nullable, for search)

Indexes: (review_status, issue_date desc), (linked_client_id), full-text on ocr_text and vendor_or_payer_name.

### 2.20 RawEmail (future)
- id (UUID, PK)
- mailbox (string)
- message_id_header (string, unique)
- from_address (string)
- to_addresses (string array)
- subject (string)
- received_at (timestamp)
- body_plain (text)
- body_html (text, nullable)
- headers_json (JSON)
- attachments_attachment_ids (UUID array, FK to Attachment)

Indexes: unique(message_id_header), (mailbox, received_at desc).

### 2.21 AgentLog (future)
- id (UUID, PK)
- agent_capability (enum: payment_detection, supplier_receipt_draft, draft_job_from_email, urgent_alert, billing_suggestion, weekly_summary, repeated_issue_detection, report_generation, other)
- action (enum: proposed, executed, failed)
- target_entity_type (string, nullable)
- target_entity_id (UUID, nullable)
- input_summary (text)
- output_summary (text)
- outcome (enum: accepted, rejected, pending, error)
- created_at (timestamp)

Indexes: (agent_capability, created_at desc), (outcome).

### 2.22 AuditLog
- id (UUID, PK)
- actor_user_id (UUID, FK User, nullable for system actions)
- action (string; e.g., "job.status_changed", "payment.marked_paid", "receipt.finalized", "client.created")
- entity_type (string; e.g., "Job", "Payment")
- entity_id (UUID)
- diff_json (JSON; old and new values for the changed fields, redacted for sensitive fields)
- ip_address (string, nullable)
- user_agent (string, nullable)
- created_at (timestamp)

Indexes: (entity_type, entity_id, created_at desc), (actor_user_id, created_at desc), (action, created_at desc).

Append-only. No updates. No deletes.

### 2.23 Attachment
- id (UUID, PK)
- storage_key (string; S3 or compatible object key)
- file_name (string)
- mime_type (string)
- byte_size (integer)
- uploaded_by_user_id (UUID, FK User)
- visibility (enum: public_in_org, admin_only, default public_in_org)

Linking is done via foreign keys on the consumer (CommunicationPost.attachment_ids, ReceiptDocument has none, etc.) using join tables where many-to-many is needed.

Join tables:
- `JobAttachment(job_id, attachment_id)`
- `PostAttachment(post_id, attachment_id)`
- `ReplyAttachment(reply_id, attachment_id)`

### 2.24 Notification (later phase)
- id (UUID, PK)
- user_id (UUID, FK User; the recipient)
- kind (enum: mention, job_assigned, job_status_change, needs_admin_post, urgent_post, payment_due, agent_alert)
- title (string)
- body (text)
- link (string; in-app path)
- read_at (timestamp, nullable)

---

## 3. Relationships

Selected relationships in cardinality form. All others follow naturally from the foreign keys above.

- User N:1 Department
- User N:1 Role
- Client 1:1 BillingAccount
- BillingAccount 1:N MonthlyBillingItem
- BillingAccount 1:N HourlyBank
- BillingAccount 1:N OneTimeJobCharge
- HourlyBank 1:N HourlyBankUsage
- Client 1:N Job
- Department 1:N Job
- User 1:N Job (as assigned_employee)
- Job 1:N JobStatusEvent
- Job 1:1 WorkReport
- Job 1:0..1 OneTimeJobCharge
- Job 1:N HourlyBankUsage
- Job 1:0..1 Payment (linked_payment_id, denormalized for fast lookup)
- Payment 1:0..1 ReceiptDocument (linked_receipt_id, denormalized)
- Client 1:N Payment
- Client 1:N ReceiptDocument
- CommunicationChannel 1:N CommunicationPost
- CommunicationPost 1:N CommunicationReply
- CommunicationPost N:M Tag (via PostTag)
- Job N:M Tag (via JobTag)
- AuditLog references any entity polymorphically by (entity_type, entity_id). No DB-level FK.
- AgentLog references targets polymorphically. No DB-level FK.

---

## 4. Permission Rules

Enforcement happens at the API/service layer. UI gates are advisory only.

### 4.1 Read rules
- Job read:
  - Employee can read a Job if `Job.department_id = user.department_id` OR `Job.assigned_employee_id = user.id` OR `Job.department_id = global`.
  - Admin can read any Job.
- WorkReport read: same as the job's read rule.
- CommunicationPost read:
  - Global channel: any user.
  - Department channel: users in that department or admins.
- Client read: admin only.
- BillingAccount, MonthlyBillingItem, HourlyBank, OneTimeJobCharge: admin only.
- Payment: admin only.
- ReceiptDocument: admin only.
- FinancialDocument: admin only.
- AgentLog: admin only.
- AuditLog: admin only.
- EmployeeStatistics page (cross-employee view): admin only.
- Employee self-statistics: the user themselves.

### 4.2 Write rules
- Job create: admin only.
- Job update (general fields, not status): admin only.
- Job status change:
  - Admin: any transition allowed by the lifecycle.
  - Employee: only on a job they are the `assigned_employee` of, only the transitions matching Section 5.1 employee-allowed column.
  - Take-from-hub: any eligible employee. Conditional update on `status = 'Available'`.
- CommunicationPost create:
  - In global channel: any user.
  - In department channel: only users of that department (or admin).
- Client / Billing / Payment / Receipt create or update: admin only.
- FinancialDocument: admin only (or system, when ingestion runs).
- AgentLog: system or admin write.
- AuditLog: system write only. Never via user-facing routes.

### 4.3 Field-level rules
- `Job.admin_note`: admin-only read and write.
- `Client.notes`: admin-only read and write.
- `Attachment.visibility = admin_only`: admin-only read.

---

## 5. Status Enums

### 5.1 Job status
Enum values, in order of typical progression:
- `new`
- `assigned`
- `available`
- `taken`
- `working_on_it`
- `waiting_for_client`
- `waiting_for_admin`
- `done`
- `reviewed`
- `cancelled`

Allowed transitions and who can perform them:

| From → To | Who |
|---|---|
| new → assigned | admin |
| new → available | admin |
| new → cancelled | admin |
| assigned → working_on_it | assigned employee or admin |
| assigned → waiting_for_client | assigned employee or admin |
| assigned → waiting_for_admin | assigned employee or admin |
| assigned → cancelled | admin |
| available → taken | any eligible employee (becomes assignee) |
| available → cancelled | admin |
| taken → working_on_it | assignee or admin |
| taken → waiting_for_client | assignee or admin |
| taken → waiting_for_admin | assignee or admin |
| taken → cancelled | admin |
| working_on_it → done | assignee or admin (requires WorkReport submission) |
| working_on_it → waiting_for_client | assignee or admin |
| working_on_it → waiting_for_admin | assignee or admin |
| working_on_it → cancelled | admin |
| waiting_for_client → working_on_it | assignee or admin |
| waiting_for_client → cancelled | admin |
| waiting_for_admin → working_on_it | admin |
| waiting_for_admin → cancelled | admin |
| done → reviewed | admin |
| done → working_on_it (reopen) | admin or assignee |
| reviewed → working_on_it (reopen) | admin only |
| cancelled → * | not allowed |

### 5.2 Payment status
- `draft`
- `sent_to_client`
- `waiting_for_payment`
- `partially_paid`
- `paid`
- `cancelled`
- `overdue` (often derived but settable)

Allowed transitions:
- draft → sent_to_client | cancelled
- sent_to_client → waiting_for_payment | partially_paid | paid | cancelled | overdue
- waiting_for_payment → partially_paid | paid | overdue | cancelled
- partially_paid → paid | overdue | cancelled
- overdue → partially_paid | paid | cancelled
- paid → cancelled (only via admin-with-reason; cancellation of a paid payment is rare and audited)
- cancelled → (terminal)

### 5.3 ReceiptDocument status
- `draft` (editable; no number)
- `finalized` (numbered, immutable)
- `cancelled` (administrative cancel of a draft; finalized documents should be voided via Credit Note, not cancelled directly; needs accountant verification)

### 5.4 Receipt allocation status
- `not_required`
- `pending`
- `issued`
- `failed`

### 5.5 FinancialDocument review status
- `unreviewed`
- `reviewed`
- `archived`

### 5.6 Client status
- `active`
- `inactive`

### 5.7 MonthlyBillingItem status
- `active`
- `paused`
- `cancelled`
- `none`

### 5.8 HourlyBank status
- `active`
- `used_up`
- `none`

### 5.9 Agent status (on Agent Control Center)
- `offline`
- `testing`
- `active`

---

## 6. Audit Log / Event History Model

Two complementary mechanisms.

### 6.1 JobStatusEvent
Domain-specific timeline for jobs. Used for:
- Rendering the Job timeline view.
- Computing time-in-status metrics.
- Statistics page.

Append-only. Never updated. Never deleted.

### 6.2 AuditLog
System-wide append-only log. Used for:
- Security and compliance review.
- Investigating "who changed what."
- Future Israeli-tax-document compliance evidence (every finalize and every issued document recorded).

Action names use a `domain.verb` pattern:
- `user.created`, `user.updated`, `user.deactivated`
- `job.created`, `job.assigned`, `job.status_changed`, `job.note_added`
- `client.created`, `client.updated`, `client.deactivated`
- `billing.monthly.created`, `billing.monthly.paused`, `billing.hourly_bank.created`, `billing.one_time.created`
- `payment.created`, `payment.sent`, `payment.marked_paid`, `payment.cancelled`
- `receipt.created_draft`, `receipt.finalized`, `receipt.allocation_obtained`
- `financial_document.ingested`, `financial_document.linked`, `financial_document.reviewed`
- `agent.action_proposed`, `agent.action_executed`
- `auth.login_succeeded`, `auth.login_failed`, `auth.password_reset_requested`, `auth.password_reset_completed`

Every entry stores actor, target, diff, IP, user agent, timestamp.

Sensitive fields (password_hash, etc.) are redacted before being written to `diff_json`.

### 6.3 Retention
- JobStatusEvent: kept indefinitely (small rows, high value).
- AuditLog: kept for at least 7 years to align with likely Israeli tax-record retention. Confirm with accountant.
- RawEmail and FinancialDocument: long-term retention; archival policy decided in Phase 7.

---

## 7. Placeholder Seed Data Examples

The following examples illustrate shape, not real data. All money values are placeholders.

### 7.1 Departments
```json
[
  { "key": "global",   "name_en": "Global",     "name_he": "כללי" },
  { "key": "helpdesk", "name_en": "Helpdesk",   "name_he": "תמיכה" },
  { "key": "it",       "name_en": "IT",         "name_he": "מערכות מידע" },
  { "key": "rnd",      "name_en": "R&D",        "name_he": "מחקר ופיתוח" }
]
```

### 7.2 Roles
```json
[
  { "key": "employee", "name_en": "Employee", "name_he": "עובד",   "is_admin": false },
  { "key": "ceo",      "name_en": "CEO",      "name_he": "מנכ\"ל", "is_admin": true  },
  { "key": "cto",      "name_en": "CTO",      "name_he": "סמנכ\"ל טכנולוגיות", "is_admin": true }
]
```

### 7.3 Communication channels
```json
[
  { "key": "global",   "department_key": null,       "name_en": "Global",   "name_he": "כללי" },
  { "key": "helpdesk", "department_key": "helpdesk", "name_en": "Helpdesk", "name_he": "תמיכה" },
  { "key": "it",       "department_key": "it",       "name_en": "IT",       "name_he": "מערכות מידע" },
  { "key": "rnd",      "department_key": "rnd",      "name_en": "R&D",      "name_he": "מחקר ופיתוח" }
]
```

### 7.4 Tags (system seed)
```json
[
  { "key": "urgent",                "label_en": "Urgent",                "label_he": "דחוף",            "scope": "both" },
  { "key": "client_issue",          "label_en": "Client issue",          "label_he": "תקלת לקוח",       "scope": "both" },
  { "key": "technical_note",        "label_en": "Technical note",        "label_he": "הערה טכנית",      "scope": "both" },
  { "key": "internal_update",       "label_en": "Internal update",       "label_he": "עדכון פנימי",     "scope": "communication" },
  { "key": "needs_admin",           "label_en": "Needs admin",           "label_he": "דורש אישור מנהל",  "scope": "both" },
  { "key": "solved",                "label_en": "Solved",                "label_he": "נפתר",            "scope": "communication" },
  { "key": "follow_up_required",    "label_en": "Follow-up required",    "label_he": "נדרש המשך טיפול", "scope": "both" }
]
```

### 7.5 Users
```json
[
  { "username": "admin.ceo", "email": "ceo@skyware-it.com", "display_name": "Skyware CEO", "department_key": "global", "role_key": "ceo" },
  { "username": "admin.cto", "email": "cto@skyware-it.com", "display_name": "Skyware CTO", "department_key": "global", "role_key": "cto" },
  { "username": "helpdesk.demo", "email": "helpdesk.demo@skyware-it.com", "display_name": "Helpdesk Demo", "department_key": "helpdesk", "role_key": "employee" },
  { "username": "it.demo",       "email": "it.demo@skyware-it.com",       "display_name": "IT Demo",       "department_key": "it",       "role_key": "employee" },
  { "username": "rnd.demo",      "email": "rnd.demo@skyware-it.com",      "display_name": "R&D Demo",      "department_key": "rnd",      "role_key": "employee" }
]
```

Real names and emails: Needs user input.

### 7.6 Clients (placeholder; the real list is "Needs user-provided client list.")
```json
[
  {
    "company_name": "Client A Ltd",
    "contact_person": "Contact A",
    "email": "contact@client-a.example",
    "phone": "+972-50-0000001",
    "address": "Tel Aviv, Israel",
    "israeli_tax_id": "000000001",
    "status": "active",
    "billing_account": {
      "default_currency": "ILS",
      "monthly_items": [
        { "service_name": "Managed IT Operations", "price_amount_placeholder": 0, "currency": "ILS", "billing_cycle": "monthly", "status": "active", "start_date": "2026-01-01" }
      ],
      "hourly_banks": [
        { "total_hours_purchased_placeholder": 0, "price_per_hour_placeholder": 0, "currency": "ILS", "purchase_date": "2026-01-01", "status": "active" }
      ],
      "one_time_charges": []
    }
  },
  {
    "company_name": "Client B Ltd",
    "contact_person": "Contact B",
    "email": "contact@client-b.example",
    "phone": "+972-50-0000002",
    "address": "Haifa, Israel",
    "israeli_tax_id": "000000002",
    "status": "active",
    "billing_account": {
      "default_currency": "ILS",
      "monthly_items": [],
      "hourly_banks": [],
      "one_time_charges": [
        { "job_name_snapshot": "Initial network audit", "price_amount_placeholder": 0, "currency": "ILS" }
      ]
    }
  }
]
```

### 7.7 Example Job
```json
{
  "title": "Email outage at Client A office",
  "description": "Users report intermittent send failures on the on-prem relay.",
  "client_company_name": "Client A Ltd",
  "department_key": "helpdesk",
  "priority": "high",
  "status": "new",
  "created_by_username": "admin.cto",
  "is_billable": true
}
```

### 7.8 Example status event sequence for the above job
```json
[
  { "from_status": null,             "to_status": "new",             "changed_by_username": "admin.cto", "note": "Created from inbound report" },
  { "from_status": "new",            "to_status": "available",       "changed_by_username": "admin.cto", "note": "Pushed to Helpdesk hub" },
  { "from_status": "available",      "to_status": "taken",           "changed_by_username": "helpdesk.demo" },
  { "from_status": "taken",          "to_status": "working_on_it",   "changed_by_username": "helpdesk.demo" },
  { "from_status": "working_on_it",  "to_status": "done",            "changed_by_username": "helpdesk.demo", "note": "Replaced relay certificate. Verified send/receive.", "time_spent_delta_minutes": 75 },
  { "from_status": "done",           "to_status": "reviewed",        "changed_by_username": "admin.cto" }
]
```

### 7.9 Example ReceiptDocument (draft)
```json
{
  "type": "tax_invoice_receipt",
  "client_company_name": "Client A Ltd",
  "status": "draft",
  "issue_date": "2026-05-15",
  "payment_date": "2026-05-15",
  "description_lines": [
    { "description": "Managed IT Operations - May 2026", "quantity": 1, "unit_price_placeholder": 0, "subtotal_placeholder": 0 }
  ],
  "amount_before_vat_placeholder": 0,
  "vat_rate_basis_points": 1800,
  "vat_amount_placeholder": 0,
  "total_amount_placeholder": 0,
  "payment_method": "bank_transfer",
  "reference": "ASMACHTA-PLACEHOLDER",
  "currency": "ILS",
  "language": "he"
}
```

VAT rate `1800` represents 18 percent. Verify at issuance time.

### 7.10 Example AuditLog entry
```json
{
  "actor_username": "admin.cto",
  "action": "payment.marked_paid",
  "entity_type": "Payment",
  "entity_id": "uuid-here",
  "diff_json": {
    "status": { "old": "waiting_for_payment", "new": "paid" },
    "paid_date": { "old": null, "new": "2026-05-15" },
    "method": { "old": null, "new": "bank_transfer" },
    "reference": { "old": null, "new": "ASMACHTA-PLACEHOLDER" }
  }
}
```

---

## 8. Indexes Summary

The most important non-PK indexes, restated for implementation reference:

- User: unique(username), unique(email), (department_id), (role_id).
- Client: (company_name), (status).
- BillingAccount: unique(client_id).
- Job: (department_id, status), (assigned_employee_id, status), (client_id), (status, created_at), (priority, status), unique(public_number, year).
- JobStatusEvent: (job_id, changed_at), (changed_by_user_id, changed_at).
- WorkReport: unique(job_id).
- CommunicationPost: (channel_id, created_at desc), full-text on title+body.
- CommunicationReply: (post_id, created_at).
- Payment: (client_id, status), (status, due_date), (paid_date).
- ReceiptDocument: unique(type, document_number_year, document_number) where document_number is not null; (client_id), (payment_id), (status).
- FinancialDocument: (review_status, issue_date desc), (linked_client_id), full-text on ocr_text and vendor_or_payer_name.
- AuditLog: (entity_type, entity_id, created_at desc), (actor_user_id, created_at desc), (action, created_at desc).
- HourlyBankUsage: (hourly_bank_id, used_at), (job_id).

---

## 9. Open Modeling Questions

1. Should `Job.public_number` reset per year (e.g., 2026-0001) or be monotonic forever? Default proposed: per year. Confirm.
2. Should `ReceiptDocument` numbering be per type and per year (proposed) or per type only (some Israeli accounting practices)? Confirm with accountant.
3. Should partial payments produce multiple `Payment` rows or one `Payment` with installment children? Proposed: one Payment plus a `PaymentInstallment` child table (added when partial-payment support is built; out of MVP).
4. Should `WorkReport` be a separate table or be inlined into `Job`? Proposed: separate. Reasons: cleaner approval flow, easier audit, supports future "revise summary" workflow without polluting `Job` history.
5. Should Hebrew and English text live as parallel fields (e.g., `name_en`, `name_he`) or in a translation table? Proposed: parallel fields for short labels, translation table for long content (later phase). MVP uses parallel fields.
6. Should `Department` be hard-coded enum or table-driven? Proposed: table-driven with fixed seed keys. Keeps code simple, allows display-name changes without migration.
