# Final Data Model

Authoritative schema spec.
Reconciles the original data model with accepted additions.

Conventions match the original.
UUID primary keys. UTC timestamps. Money as integer minor units.
`created_at` and `updated_at` exist on every entity unless noted.

## 1. MVP entities

### 1.1 Core auth and org
- User
- Department
- Role
- Session (or delegated to auth library)
- PasswordResetToken (or delegated)

### 1.2 Work
- Job
- JobStatusEvent
- WorkReport
- TimeSession

### 1.3 Tags
- Tag
- JobTag (join)
- PostTag (join)

### 1.4 Customer
- Client
- BillingAccount
- ClientEnvironmentNote

### 1.5 Money
- MonthlyBillingItem
- HourlyBank
- HourlyBankUsage
- OneTimeJobCharge
- Payment
- ReceiptDocument
- ReceiptDocumentSequence

### 1.6 Communication
- CommunicationChannel
- CommunicationPost
- CommunicationReply

### 1.7 Productivity
- SavedView

### 1.8 System
- AuditLog
- Attachment
- JobAttachment (join)
- PostAttachment (join)
- ReplyAttachment (join)
- FeatureFlag

`TaskHubItem` is a query, not a table.

## 2. Later-phase entities

### 2.1 Phase 2
- Notification
- ClientEnvironmentAsset
- CredentialReference (pointer only)
- RecurringJobTemplate
- KnowledgeArticle
- EscalationRule
- ClientHealthSnapshot
- SatisfactionResponse
- JobMilestone
- Approval
- RenewalReminder

### 2.2 Phase 3 or later
- FinancialDocument
- RawEmail
- AgentLog
- IncidentCluster
- ClientReportSnapshot
- VendorRegistry
- LicenseRegistry
- DisasterRecoveryReadiness

## 3. Fields per MVP entity

### 3.1 User
- id (UUID, PK).
- username (string, unique, lowercase, required).
- email (string, unique, required).
- display_name (string, required).
- password_hash (string).
- department_id (FK Department, required).
- role_id (FK Role, required).
- is_active (boolean, default true).
- language_pref (enum: en, he; default en).
- timezone (string, default "Asia/Jerusalem").
- last_login_at (timestamp, nullable).
- avatar_attachment_id (FK Attachment, nullable).

Indexes: unique(username), unique(email), (department_id), (role_id).

### 3.2 Department
- id (UUID, PK).
- key (enum: helpdesk, it, rnd, global, unique).
- name_en (string).
- name_he (string).
- is_global (boolean derived from key).

Seed: four rows.

### 3.3 Role
- id (UUID, PK).
- key (enum: employee, ceo, cto, unique).
- name_en (string).
- name_he (string).
- is_admin (boolean).

Seed: three rows.

### 3.4 Job
- id (UUID, PK).
- public_number (string, e.g., "2026-0037", unique per year).
- client_id (FK Client, nullable).
- department_id (FK Department, required).
- title (string, required).
- description (text).
- assigned_employee_id (FK User, nullable).
- created_by_user_id (FK User, required).
- status (enum: see Section 5.1).
- priority (enum: low, normal, high, urgent; default normal).
- severity (enum: minor, moderate, major, critical; default moderate).
- sla_target_minutes (integer; derived at create, editable by admin).
- created_at, assigned_timestamp (nullable), taken_timestamp (nullable), started_timestamp (nullable), completed_timestamp (nullable), reviewed_timestamp (nullable), cancelled_timestamp (nullable).
- time_spent_minutes (integer, default 0). Sum of TimeSession durations or manual entries.
- admin_note (text, nullable, admin-only).
- is_billable (boolean, default true).
- linked_payment_id (FK Payment, nullable).
- linked_one_time_charge_id (FK OneTimeJobCharge, nullable).
- source (enum: portal_manual, email_manual; default portal_manual).
- first_response_at (timestamp, nullable). Set on first transition out of assigned or taken.

Indexes: (department_id, status), (assigned_employee_id, status), (client_id), (status, created_at), (priority, status), (severity, status), unique(public_number).

### 3.5 JobStatusEvent
- id (UUID, PK).
- job_id (FK Job).
- from_status (enum, nullable on create).
- to_status (enum).
- changed_by_user_id (FK User).
- changed_at (timestamp).
- note (text, nullable).
- time_spent_delta_minutes (integer, default 0).
- reopened (boolean, default false).

Indexes: (job_id, changed_at), (changed_by_user_id, changed_at).
Append-only.

### 3.6 WorkReport
- id (UUID, PK).
- job_id (FK Job, unique).
- summary (text, required).
- total_time_minutes (integer, required).
- billable (boolean, default true).
- submitted_by_user_id (FK User).
- submitted_at (timestamp).
- approved_by_user_id (FK User, nullable).
- approved_at (timestamp, nullable).

Indexes: unique(job_id).

### 3.7 TimeSession
- id (UUID, PK).
- user_id (FK User).
- job_id (FK Job).
- started_at (timestamp).
- paused_at (timestamp, nullable).
- resumed_at (timestamp, nullable).
- ended_at (timestamp, nullable).
- accumulated_minutes (integer, default 0).
- source (enum: manual_button, idle_resume).
- idle_warned_at (timestamp, nullable).

Indexes: (user_id) partial where ended_at IS NULL, (job_id, started_at).

### 3.8 Tag
- id (UUID, PK).
- key (string, unique).
- label_en (string).
- label_he (string).
- scope (enum: communication, job, both; default communication).
- is_system (boolean).
- color_hex (string, nullable).

### 3.9 JobTag (join)
- job_id (FK Job).
- tag_id (FK Tag).
- PK (job_id, tag_id).

### 3.10 PostTag (join)
- post_id (FK CommunicationPost).
- tag_id (FK Tag).
- PK (post_id, tag_id).

### 3.11 Client
- id (UUID, PK).
- company_name (string, required).
- contact_person (string, nullable).
- email (string, nullable).
- phone (string, nullable).
- address (string, nullable, multi-line).
- israeli_tax_id (string, nullable).
- status (enum: active, inactive; default active).
- notes (text, nullable, admin-only).
- created_by_user_id (FK User).

Indexes: (company_name), (status), unique-if-present(israeli_tax_id).

### 3.12 BillingAccount
- id (UUID, PK).
- client_id (FK Client, unique).
- default_currency (enum: ILS, USD, EUR; default ILS).
- notes (text, nullable).

### 3.13 ClientEnvironmentNote
- id (UUID, PK).
- client_id (FK Client).
- section (enum: network, servers, hosting, contacts, vendors, security, backup, other).
- content (text, markdown).
- last_edited_by_user_id (FK User).
- last_edited_at (timestamp).

Indexes: (client_id, section).

### 3.14 MonthlyBillingItem
- id (UUID, PK).
- billing_account_id (FK BillingAccount).
- service_name (string).
- price_amount_placeholder (integer, minor units).
- currency (enum).
- billing_cycle (enum: monthly).
- start_date (date).
- end_date (date, nullable).
- status (enum: active, paused, cancelled, none; default active).
- last_billed_period (string YYYY-MM, nullable).
- next_due_date (date, nullable).

Indexes: (billing_account_id), (status), (next_due_date).

### 3.15 HourlyBank
- id (UUID, PK).
- billing_account_id (FK BillingAccount).
- total_hours_purchased_placeholder (integer, minutes).
- price_per_hour_placeholder (integer, minor units).
- total_payment_placeholder (integer, minor units).
- currency (enum).
- purchase_date (date).
- expiry_date (date, nullable).
- status (enum: active, used_up, none; default active).
- alert_threshold_percent (integer, default 25).

Indexes: (billing_account_id), (status).

### 3.16 HourlyBankUsage
- id (UUID, PK).
- hourly_bank_id (FK HourlyBank).
- job_id (FK Job).
- minutes_used (integer, required, > 0).
- used_at (timestamp).
- recorded_by_user_id (FK User).
- note (text, nullable).

Indexes: (hourly_bank_id, used_at), (job_id).

### 3.17 OneTimeJobCharge
- id (UUID, PK).
- billing_account_id (FK BillingAccount).
- job_id (FK Job, unique).
- job_name_snapshot (string).
- price_amount_placeholder (integer, minor units).
- currency (enum).
- payment_id (FK Payment, nullable).
- date_created (timestamp).
- date_paid (timestamp, nullable).

Indexes: unique(job_id), (billing_account_id).

### 3.18 Payment
- id (UUID, PK).
- client_id (FK Client).
- source_type (enum: monthly, hourly_bank, one_time).
- source_id (UUID; FK enforced in application).
- amount_placeholder (integer, minor units).
- currency (enum).
- issued_date (date).
- due_date (date, nullable).
- paid_date (date, nullable).
- status (enum: see Section 5.2).
- method (enum, nullable until paid).
- reference (string, nullable).
- linked_receipt_id (FK ReceiptDocument, nullable).
- notes (text, nullable).
- created_by_user_id (FK User).

Indexes: (client_id, status), (status, due_date), (paid_date).

### 3.19 ReceiptDocument
- id (UUID, PK).
- type (enum: invoice, receipt, tax_invoice, tax_invoice_receipt, credit_note, proforma_invoice).
- client_id (FK Client).
- payment_id (FK Payment, nullable).
- document_number (integer, nullable while draft).
- document_number_year (integer, nullable while draft).
- status (enum: draft, finalized, cancelled).
- issue_date (date).
- payment_date (date, nullable).
- description_lines (JSON: array of {description, quantity, unit_price, subtotal}).
- amount_before_vat (integer, minor units).
- vat_rate_basis_points (integer; e.g., 1800 means 18 percent).
- vat_amount (integer, minor units).
- total_amount (integer, minor units).
- payment_method (enum, nullable).
- reference (string, nullable).
- currency (enum).
- notes (text, nullable).
- language (enum: he, en, both; default he).
- allocation_number (string, nullable).
- allocation_status (enum: not_required, pending, issued, failed; default not_required).
- allocation_obtained_at (timestamp, nullable).
- finalized_at (timestamp, nullable).
- finalized_by_user_id (FK User, nullable).

Indexes: unique(type, document_number_year, document_number) where document_number is not null; (client_id), (payment_id), (status).

### 3.20 ReceiptDocumentSequence
- id (UUID, PK).
- type (enum).
- year (integer).
- next_number (integer).

Indexes: unique(type, year).
Locked with SELECT FOR UPDATE on finalize.

### 3.21 CommunicationChannel
- id (UUID, PK).
- key (enum: global, helpdesk, it, rnd; unique).
- department_id (FK Department, nullable for global).
- name_en, name_he, description (text, nullable).

### 3.22 CommunicationPost
- id (UUID, PK).
- channel_id (FK CommunicationChannel).
- author_id (FK User).
- title (string, required).
- body (text markdown).
- related_job_id (FK Job, nullable).
- related_client_id (FK Client, nullable).
- pinned (boolean, default false).
- resolved (boolean, default false).

Indexes: (channel_id, created_at desc), (author_id), full-text on title plus body.

### 3.23 CommunicationReply
- id (UUID, PK).
- post_id (FK CommunicationPost).
- author_id (FK User).
- body (text).

Indexes: (post_id, created_at).

### 3.24 SavedView
- id (UUID, PK).
- user_id (FK User, nullable when team view).
- scope (enum: jobs, clients, billing, receipts, communication, statistics).
- name (string).
- filter_json (JSON).
- is_team (boolean, default false).
- created_by_user_id (FK User).

Indexes: (user_id, scope), (is_team, scope).

### 3.25 AuditLog
- id (UUID, PK).
- actor_user_id (FK User, nullable for system).
- action (string, e.g., "job.status_changed").
- entity_type (string).
- entity_id (UUID).
- diff_json (JSON; sensitive fields redacted).
- ip_address (string, nullable).
- user_agent (string, nullable).
- created_at (timestamp).

Indexes: (entity_type, entity_id, created_at desc), (actor_user_id, created_at desc), (action, created_at desc).
Append-only.

### 3.26 Attachment
- id (UUID, PK).
- storage_key (string).
- file_name (string).
- mime_type (string).
- byte_size (integer).
- uploaded_by_user_id (FK User).
- visibility (enum: public_in_org, admin_only; default public_in_org).

Join tables: JobAttachment, PostAttachment, ReplyAttachment.

### 3.27 FeatureFlag
- id (UUID, PK).
- key (string, unique).
- enabled (boolean, default false).
- description (text, nullable).
- updated_by_user_id (FK User).

Seed examples:
- `financial_documents_module`: false.
- `agent_control_center_module`: false.
- `receipt_finalize_enabled`: false.
- `csat_enabled`: false (Phase 2).
- `notifications_enabled`: false (Phase 2).

## 4. Relationships

- User N:1 Department, N:1 Role.
- Client 1:1 BillingAccount, 1:N Job, 1:N Payment, 1:N ReceiptDocument, 1:N ClientEnvironmentNote.
- BillingAccount 1:N MonthlyBillingItem, 1:N HourlyBank, 1:N OneTimeJobCharge.
- HourlyBank 1:N HourlyBankUsage.
- Job N:1 Client (nullable), N:1 Department, N:0..1 User (assignee).
- Job 1:N JobStatusEvent, 1:1 WorkReport, 1:N TimeSession, 1:N HourlyBankUsage.
- Job N:M Tag via JobTag.
- Job 0..1 OneTimeJobCharge.
- Payment N:1 Client, optionally references one of MonthlyBillingItem, HourlyBank, OneTimeJobCharge.
- ReceiptDocument N:1 Client, 0..1 Payment.
- CommunicationPost N:1 CommunicationChannel, 1:N CommunicationReply.
- CommunicationPost N:M Tag via PostTag.
- AuditLog references any entity polymorphically.
- SavedView N:1 User (nullable for team views).
- Attachment N:M Job, Post, Reply via join tables.

## 5. Status enums

### 5.1 Job
`new`, `assigned`, `available`, `taken`, `working_on_it`, `waiting_for_client`, `waiting_for_admin`, `done`, `reviewed`, `cancelled`.

### 5.2 Payment
`draft`, `sent_to_client`, `waiting_for_payment`, `partially_paid`, `paid`, `cancelled`, `overdue`.

### 5.3 ReceiptDocument
`draft`, `finalized`, `cancelled`.

### 5.4 ReceiptDocument allocation
`not_required`, `pending`, `issued`, `failed`.

### 5.5 Client
`active`, `inactive`.

### 5.6 MonthlyBillingItem
`active`, `paused`, `cancelled`, `none`.

### 5.7 HourlyBank
`active`, `used_up`, `none`.

### 5.8 TimeSession state
Derived from columns. No explicit enum.
- running: started_at not null, paused_at null, ended_at null.
- paused: started_at not null, paused_at not null, ended_at null.
- ended: ended_at not null.

### 5.9 Job priority
`low`, `normal`, `high`, `urgent`.

### 5.10 Job severity
`minor`, `moderate`, `major`, `critical`.

## 6. Audit and event history

Two complementary mechanisms.

### 6.1 JobStatusEvent
Domain timeline for Jobs.
Renders the job timeline view.
Powers statistics.
Append-only.

### 6.2 AuditLog
System-wide append-only log.
Written inside the same transaction as the mutation.

Action namespaces:
- `user.*`
- `job.*`
- `client.*`
- `billing.monthly.*`
- `billing.hourly_bank.*`
- `billing.one_time.*`
- `payment.*`
- `receipt.*`
- `auth.*`
- `time_session.*`
- `saved_view.*`
- `client_environment_note.*`
- `feature_flag.*`

Sensitive fields redacted in `diff_json`.

### 6.3 Retention

- JobStatusEvent: indefinite.
- AuditLog: indefinite at MVP. 7-year retention policy applied at Phase 2 once accountant confirms.
- TimeSession: indefinite.

## 7. Permission model

### 7.1 Read rules
- Job: assignee, own-department employee, or admin.
- WorkReport: same as parent Job.
- CommunicationPost: global or own-department or admin.
- Client and BillingAccount and Payment and ReceiptDocument: admin only.
- ClientEnvironmentNote: admins and employees. No client-facing read.
- TimeSession: owner or admin.
- SavedView: owner or admin or anyone if `is_team`.
- AuditLog: admin only.
- FeatureFlag: admin only.

### 7.2 Write rules
- Job create and assign: admin.
- Job status change: assignee per transition table or admin.
- Take task: any eligible employee with conditional update.
- ClientEnvironmentNote write: admin or engineer.
- Client and BillingAccount and MonthlyBillingItem and HourlyBank and OneTimeJobCharge and Payment write: admin.
- ReceiptDocument draft write: admin.
- ReceiptDocument finalize: admin behind feature flag.
- CommunicationPost in global: any user. In department: own dept or admin.
- TimeSession write: owner only.
- SavedView write: owner; admin can pin team-shared.
- FeatureFlag write: admin only.
- AuditLog write: system only.

### 7.3 Field-level rules
- `Job.admin_note`: admin-only.
- `Client.notes`: admin-only.
- `Attachment.visibility = admin_only`: admin-only read.

## 8. Placeholder seed data guidance

### 8.1 Departments
Four seeded rows.

```json
[
  { "key": "global",   "name_en": "Global",   "name_he": "כללי" },
  { "key": "helpdesk", "name_en": "Helpdesk", "name_he": "תמיכה" },
  { "key": "it",       "name_en": "IT",       "name_he": "מערכות מידע" },
  { "key": "rnd",      "name_en": "R&D",      "name_he": "מחקר ופיתוח" }
]
```

### 8.2 Roles
Three seeded rows.

```json
[
  { "key": "employee", "name_en": "Employee", "name_he": "עובד",   "is_admin": false },
  { "key": "ceo",      "name_en": "CEO",      "name_he": "מנכ\"ל", "is_admin": true  },
  { "key": "cto",      "name_en": "CTO",      "name_he": "סמנכ\"ל טכנולוגיות", "is_admin": true }
]
```

### 8.3 Communication channels
Four seeded rows. Keyed to department keys, plus global.

### 8.4 Tags
Seven seeded system tags.

```json
[
  { "key": "urgent" },
  { "key": "client_issue" },
  { "key": "technical_note" },
  { "key": "internal_update" },
  { "key": "needs_admin" },
  { "key": "solved" },
  { "key": "follow_up_required" }
]
```

### 8.5 Demo users
Placeholder usernames. Real identities: Needs user input.

```json
[
  { "username": "admin.ceo",      "role_key": "ceo",      "department_key": "global"  },
  { "username": "admin.cto",      "role_key": "cto",      "department_key": "global"  },
  { "username": "helpdesk.demo",  "role_key": "employee", "department_key": "helpdesk" },
  { "username": "it.demo",        "role_key": "employee", "department_key": "it"       },
  { "username": "rnd.demo",       "role_key": "employee", "department_key": "rnd"      }
]
```

### 8.6 Demo clients
"Client A," "Client B," "Client C." Placeholder tax IDs. Placeholder monetary values.
The real client list is "Needs user input."

### 8.7 Feature flags
Disabled by default for any placeholder module and for receipt finalize.

### 8.8 SLA defaults
Stored in a config table or `FeatureFlag` extension at MVP. Suggested values per Section 7.5 of `02-implementation-ready-spec.md`. Final values: Needs user input.

## 9. Index strategy notes

- Hot lists indexed in Section 3.
- Postgres full-text indexes:
  - Job: (title, description).
  - Client: (company_name).
  - CommunicationPost: (title, body).
- Partial index on TimeSession active sessions.

## 10. Migration order suggestion

1. Department, Role.
2. User. Auth tables.
3. Tag, JobTag, PostTag.
4. Client, BillingAccount, ClientEnvironmentNote.
5. Job, JobStatusEvent, WorkReport, TimeSession.
6. CommunicationChannel, CommunicationPost, CommunicationReply.
7. MonthlyBillingItem, HourlyBank, HourlyBankUsage, OneTimeJobCharge.
8. Payment.
9. ReceiptDocument, ReceiptDocumentSequence.
10. Attachment, join tables.
11. SavedView.
12. FeatureFlag.
13. AuditLog. Create early but writes start once mutations exist.
