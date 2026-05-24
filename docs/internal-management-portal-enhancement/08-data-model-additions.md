# Data Model Additions

These are additions to `internal-management-portal-data-model.md`.
They do not replace existing entities.

Conventions match the original data model.
UUID primary keys. Timestamps UTC. Money as integer minor units.

## 1. Additions to existing entities

### 1.1 Job

Add fields:

- `severity` (enum: minor, moderate, major, critical, default moderate).
- `first_response_at` (timestamp, nullable). Set on first transition out of `assigned` or `taken`.
- `sla_state` (enum: green, amber, red, breached, derived). Computed; may be cached.
- `sla_breached_at` (timestamp, nullable). Set when state first reaches breached.
- `source` (enum: portal_manual, email_manual, email_agent, recurring_template, agent_proposed, default portal_manual).
- `is_project` (boolean, default false). Phase 2 use.
- `parent_job_id` (UUID, FK Job, nullable). For sub-jobs in project mode. Phase 2.

Verdict per field:

- `severity`: MVP.
- `first_response_at`: MVP.
- `sla_state`, `sla_breached_at`: MVP.
- `source`: MVP.
- `is_project`, `parent_job_id`: Phase 2.

### 1.2 HourlyBank

Add fields:

- `alert_threshold_percent` (integer, default 25).
- `last_alert_sent_at` (timestamp, nullable). Phase 2.

Verdict:

- `alert_threshold_percent`: MVP.
- `last_alert_sent_at`: Phase 2.

### 1.3 Payment

Add fields:

- `discount_amount_placeholder` (integer, minor units, default 0). Phase 2.
- `discount_reason` (text, nullable). Phase 2.
- `reminder_last_sent_at` (timestamp, nullable). Phase 2.

Verdict: Phase 2 only.

### 1.4 Client

Add fields:

- `sla_tier` (enum: standard, premium, custom, default standard). Phase 2.
- `health_score_cached` (integer 0 to 100, nullable). Phase 2.
- `account_owner_user_id` (UUID, FK User, nullable). Phase 2.

Verdict: Phase 2.

### 1.5 Notification

Already in the spec as later phase.
Promote to MVP.

Fields:

- `id`.
- `user_id` (FK User).
- `kind` (enum).
- `title`.
- `body`.
- `link`.
- `read_at` (nullable).
- `entity_type` (string, nullable).
- `entity_id` (UUID, nullable).

Triggers active in MVP:

- `sla.breached`.
- `job.assigned`.
- `mention`.

Triggers Phase 2:

- `payment.overdue`.
- `bank.low`.
- `review.pending_too_long`.

## 2. New entity: TimeSession

### Purpose
Active timer on a job.

### Fields
- `id` (UUID).
- `user_id` (UUID, FK User).
- `job_id` (UUID, FK Job).
- `started_at` (timestamp).
- `paused_at` (timestamp, nullable).
- `resumed_at` (timestamp, nullable).
- `ended_at` (timestamp, nullable).
- `accumulated_minutes` (integer, default 0). Sum across pause cycles.
- `source` (enum: manual_button, idle_resume).
- `idle_warned_at` (timestamp, nullable).

### Relationships
- User has many TimeSession.
- Job has many TimeSession.

### Why
- Reduces end-of-day reconstruction.
- Improves billing accuracy.

### Phase
- MVP.

### Indexes
- (user_id, ended_at IS NULL) partial.
- (job_id, started_at).

## 3. New entity: SavedView

### Purpose
Saved filter set on a list page.

### Fields
- `id` (UUID).
- `user_id` (UUID, FK User, nullable when team).
- `scope` (enum: jobs, clients, billing, receipts, communication, statistics).
- `name` (string).
- `filter_json` (JSON).
- `is_team` (boolean, default false).
- `created_by_user_id` (UUID, FK User).

### Why
- Daily-driver productivity.

### Phase
- MVP.

### Indexes
- (user_id, scope) for personal.
- (is_team, scope) for team views.

## 4. New entity: ClientEnvironmentNote

### Purpose
Lite environment knowledge per client.

### Fields
- `id` (UUID).
- `client_id` (UUID, FK Client).
- `section` (enum: network, servers, hosting, contacts, vendors, security, backup, other).
- `content` (text, markdown).
- `last_edited_by_user_id` (UUID, FK User).
- `last_edited_at` (timestamp).

### Relationships
- Client has many ClientEnvironmentNote.

### Why
- Engineer ramp-up.
- Continuity when an engineer leaves.

### Phase
- MVP.

### Indexes
- (client_id, section).

## 5. New entity: ClientEnvironmentAsset

### Purpose
Structured CMDB lite.

### Fields
- `id` (UUID).
- `client_id` (UUID, FK Client).
- `label` (string).
- `asset_type` (enum: server, workstation, network_device, cloud_resource, saas_subscription, other).
- `hosting_provider` (string, nullable).
- `address_or_dns` (string, nullable).
- `os_or_platform` (string, nullable).
- `owner_at_client` (string, nullable).
- `notes` (text, nullable).
- `credential_reference_id` (UUID, FK CredentialReference, nullable).
- `last_touched_at` (timestamp, nullable).
- `status` (enum: active, retired, default active).

### Why
- Reduce confusion across engineers.
- Foundation for change management.

### Phase
- Phase 2.

### Indexes
- (client_id, asset_type), (status).

## 6. New entity: CredentialReference

### Purpose
Pointer to a vault item. No secrets ever stored.

### Fields
- `id` (UUID).
- `vault_provider` (enum: 1password, bitwarden, keepassxc, dashlane, lastpass, other).
- `vault_item_name_or_id` (string).
- `vault_item_url` (string, nullable). Deep-link only.
- `owner_user_id` (UUID, FK User).
- `last_verified_at` (timestamp, nullable).
- `notes` (text, nullable).

### Why
- Engineers find credentials without storing them in the portal.

### Phase
- Phase 2.

### Security rules
- API rejects content matching long random strings inside `vault_item_url`.
- API forbids the strings "password", "passphrase", "private key" inside `notes`.
- Audit log captures every read.

### Indexes
- (owner_user_id).

## 7. New entity: RecurringJobTemplate

### Purpose
Auto-create jobs on a schedule.

### Fields
- `id` (UUID).
- `client_id` (UUID, FK Client, nullable for internal templates).
- `title_template` (string).
- `description_template` (text).
- `department_id` (UUID, FK Department).
- `default_assignee_user_id` (UUID, FK User, nullable).
- `priority` (enum).
- `severity` (enum).
- `tag_ids` (UUID array).
- `is_billable` (boolean, default true).
- `linked_billing_source` (enum: monthly, hourly_bank, one_time, none).
- `schedule_kind` (enum: monthly, weekly, custom).
- `schedule_config_json` (JSON). Day of month, day of week, hour, etc.
- `lead_time_days` (integer, default 0). Create N days before due.
- `next_run_at` (timestamp, nullable).
- `status` (enum: active, paused, archived).

### Why
- Maintenance and audits should run themselves.

### Phase
- Phase 2.

### Indexes
- (status, next_run_at).

## 8. New entity: KnowledgeArticle

### Purpose
Reusable resolution captured from a job.

### Fields
- `id` (UUID).
- `title`.
- `body` (text, markdown).
- `tag_ids` (UUID array).
- `source_job_id` (UUID, FK Job, nullable).
- `related_client_ids` (UUID array). Optional.
- `created_by_user_id` (UUID, FK User).
- `last_reviewed_at` (timestamp, nullable).
- `review_due_at` (timestamp, nullable).
- `views_count` (integer, default 0).
- `helpful_count` (integer, default 0).

### Why
- Reduce repeated effort.

### Phase
- Phase 2.

### Indexes
- Full-text on title and body.
- (review_due_at) for staleness.

## 9. New entity: EscalationRule

### Purpose
Trigger actions when a condition holds.

### Fields
- `id` (UUID).
- `name`.
- `enabled` (boolean, default true).
- `condition_json` (JSON). Documented mini-DSL.
- `action_json` (JSON). Documented mini-DSL.
- `priority_order` (integer). Lower wins on conflict.
- `created_by_user_id` (UUID, FK User).
- `last_fired_at` (timestamp, nullable).
- `fire_count` (integer, default 0).

### Why
- Auto-alerts. Reassignment. Priority bumps.

### Phase
- Phase 2.

### Risks
- Spaghetti rules.
- Mitigation: cap at 20 rules. Per-rule audit log.

## 10. New entity: ClientHealthSnapshot

### Purpose
Composite health score per client per week.

### Fields
- `id` (UUID).
- `client_id` (UUID, FK Client).
- `as_of_date` (date).
- `score` (integer 0 to 100).
- `components_json` (JSON). Hours burn, payment timeliness, reopened rate, CSAT.
- `risk_band` (enum: green, amber, red).

### Why
- One number for triage.

### Phase
- Phase 2.

### Indexes
- (client_id, as_of_date desc).

## 11. New entity: SatisfactionResponse

### Purpose
CSAT after `reviewed`.

### Fields
- `id` (UUID).
- `job_id` (UUID, FK Job).
- `client_id` (UUID, FK Client).
- `score` (integer 1 to 5).
- `comment` (text, nullable).
- `respondent` (enum: admin, client). Phase 3 enables client.
- `respondent_user_id` (UUID, FK User, nullable).
- `respondent_contact_email` (string, nullable).

### Why
- Retention signal.

### Phase
- Phase 2.

### Indexes
- (client_id, created_at desc), (job_id).

## 12. New entity: JobMilestone

### Purpose
R&D milestones in project mode.

### Fields
- `id` (UUID).
- `job_id` (UUID, FK Job).
- `title`.
- `description` (text, nullable).
- `due_date` (date, nullable).
- `status` (enum: open, in_progress, done, blocked).
- `owner_user_id` (UUID, FK User, nullable).
- `order_index` (integer).

### Why
- Multi-step R&D delivery.

### Phase
- Phase 2.

### Indexes
- (job_id, order_index).

## 13. New entity: Approval

### Purpose
Sign-off step on a job, quote, or change.

### Fields
- `id` (UUID).
- `entity_type` (string).
- `entity_id` (UUID).
- `requested_by_user_id` (UUID, FK User).
- `approver_user_id` (UUID, FK User, nullable).
- `status` (enum: requested, approved, rejected, cancelled).
- `note` (text, nullable).
- `requested_at` (timestamp).
- `decided_at` (timestamp, nullable).

### Why
- CEO and CTO sign-off.

### Phase
- Phase 2.

### Indexes
- (entity_type, entity_id), (status).

## 14. New entity: IncidentCluster

### Purpose
Grouping of similar repeated jobs.

### Fields
- `id` (UUID).
- `label`.
- `signature_json` (JSON). Tags, keywords, client subset.
- `first_seen_at` (timestamp).
- `last_seen_at` (timestamp).
- `count` (integer).
- `root_cause_known` (boolean, default false).
- `linked_knowledge_article_id` (UUID, FK KnowledgeArticle, nullable).
- `status` (enum: open, monitoring, resolved).

### Why
- Productization signals.

### Phase
- Phase 2 detection. Phase 3 automation.

### Indexes
- (status, last_seen_at desc).

## 15. New entity: RenewalReminder

### Purpose
Track upcoming end_date of monthly plans.

### Fields
- `id` (UUID).
- `monthly_billing_item_id` (UUID, FK MonthlyBillingItem).
- `due_at` (timestamp).
- `state` (enum: scheduled, sent, dismissed).
- `kind` (enum: 30_day, 7_day, same_day).

### Why
- Renewal radar.

### Phase
- Phase 2.

### Indexes
- (state, due_at).

## 16. New entity: ClientReportSnapshot

### Purpose
Monthly digest per client.

### Fields
- `id` (UUID).
- `client_id` (UUID, FK Client).
- `period_year_month` (string YYYY-MM).
- `hours_used`.
- `jobs_closed`.
- `csat_average`.
- `payments_paid_count`.
- `payments_outstanding_amount_placeholder`.
- `rendered_html` (text, nullable).
- `created_by_user_id` (UUID, FK User).

### Why
- Client retention.

### Phase
- Phase 3 or later.

### Indexes
- unique(client_id, period_year_month).

## 17. New entity: VendorRegistry and LicenseRegistry

### Purpose
Track Skyware vendors and per-client licenses.

### Phase
- Phase 3 or later.

### Fields
Minimal sketch.

Vendor:
- `id`.
- `name`.
- `category`.
- `renewal_date`.
- `monthly_cost_placeholder`.
- `currency`.

License:
- `id`.
- `vendor_id` (FK Vendor).
- `client_id` (FK Client, nullable for Skyware-internal).
- `seat_count`.
- `renewal_date`.
- `cost_per_seat_placeholder`.

## 18. New entity: DisasterRecoveryReadiness

### Purpose
Track DR posture per client.

### Phase
- Phase 3 or later.

### Fields
- `id`.
- `client_id` (FK Client).
- `backup_target` (text).
- `rpo_minutes`.
- `rto_minutes`.
- `last_verified_at`.
- `next_verification_due_at`.
- `notes`.

## 19. Relationship updates

- User has many TimeSession, SavedView, Notification.
- Client has many ClientEnvironmentNote, ClientEnvironmentAsset, ClientHealthSnapshot, SatisfactionResponse, RenewalReminder, ClientReportSnapshot.
- Job has many TimeSession, SatisfactionResponse, JobMilestone, Approval through polymorphic.
- HourlyBank gains alert thresholds; no new FK.
- RecurringJobTemplate optionally links Client and Department.
- KnowledgeArticle optionally links source Job.
- IncidentCluster optionally links a KnowledgeArticle.
- EscalationRule references no entities at the schema level. Runtime evaluation only.
- Approval references entities polymorphically.

## 20. Index strategy notes

- New tables follow Postgres-friendly indexing.
- Active-state predicates use partial indexes where common.
- Full-text on KnowledgeArticle title plus body.
- Hot lists like Job already covered in the original spec.

## 21. Permission rules for new entities

- TimeSession: writes only by the owner user.
- SavedView: read by owner or by anyone if `is_team`. Write by owner or admin.
- ClientEnvironmentNote and Asset: admins and engineers in any department. Edit by admin or engineer.
- CredentialReference: admins and engineers. Audit on every read.
- KnowledgeArticle: read for all employees. Write for admins; editor opt-in for senior engineers.
- EscalationRule: admin only.
- Approval: requested by anyone allowed by the workflow. Decided by named approver.
- ClientHealthSnapshot, SatisfactionResponse, ClientReportSnapshot: admin only.

## 22. Audit log actions to add

- `time_session.started`, `time_session.paused`, `time_session.stopped`, `time_session.discarded`.
- `saved_view.created`, `saved_view.updated`, `saved_view.deleted`.
- `client_environment_note.updated`.
- `credential_reference.read`, `credential_reference.created`, `credential_reference.updated`.
- `recurring_template.created`, `recurring_template.fired`.
- `knowledge_article.created`, `knowledge_article.updated`, `knowledge_article.reviewed`.
- `escalation_rule.fired`, `escalation_rule.created`, `escalation_rule.updated`.
- `approval.requested`, `approval.decided`.
- `csat.submitted`.
- `notification.sent`, `notification.read`.

## 23. Open modeling questions

1. Should `TimeSession` persist after the job is `done`? Recommended yes for audit.
2. Should `SavedView` filter_json be schema-validated per scope? Recommended yes via Zod or JSON Schema.
3. Should `EscalationRule` use a JSON DSL or named templates? Recommended named templates with config to avoid generic-rule complexity.
4. Should `KnowledgeArticle` be visible to clients in the future portal? Default no, with explicit opt-in per article.
5. Should `Approval` allow multiple approvers? MVP scope no. Phase 3 yes.
6. Should `ClientHealthSnapshot` be regenerated nightly or weekly? Default weekly.
7. Should `IncidentCluster` be admin-curated or auto-detected? Hybrid. Auto-suggest. Admin confirms.
