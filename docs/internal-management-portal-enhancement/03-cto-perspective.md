# CTO Perspective

The CTO owns delivery quality.
The CTO owns automation.
The CTO owns the agent.

## 1. The five CTO questions

1. What is on fire right now.
2. What keeps breaking.
3. Which clients have fragile environments.
4. What can be automated next.
5. What does the R&D pipeline look like.

The portal should make all five visible.

## 2. CTO dashboard widgets

### 2.1 What is on fire

- Urgent jobs in `working_on_it`.
- Urgent jobs delayed.
- Jobs waiting for admin over 24 hours.
- Open incidents per client.

### 2.2 Recurring incidents

- Top 10 recurring titles or tags this month.
- Per-client recurrence count.
- Drill-down opens an "incident cluster" view.

### 2.3 Client environment status

- Clients with known environment notes.
- Clients with no environment notes. Risk.
- Last-touched timestamp per environment.

### 2.4 Automation opportunities

- Job titles repeated more than 5 times.
- Clients with high-frequency, low-effort jobs.
- Candidates for monthly maintenance conversion.

### 2.5 R&D pipeline

- Active R&D jobs.
- R&D milestone status. Phase 2.
- Time spent this month on R&D.

### 2.6 Agent feed

- Latest agent proposals.
- Acceptance rate.
- Errors and rejected proposals.

Most cards are Phase 2 or later.
MVP should at least show recurring titles and delayed jobs.

## 3. Technical operations visibility

### 3.1 SLA performance

- Per-priority breach count this month.
- Per-department breach count.
- Trend over last 6 months.

### 3.2 Time-in-status

- Median time in `working_on_it`.
- Median time in `waiting_for_client`.
- Median time in `waiting_for_admin`.

Long `waiting_for_admin` is a CTO problem.
Long `waiting_for_client` is a CSM problem.

### 3.3 Reopened-jobs rate

- Total reopened this month.
- By employee.
- By client.

A high client number means the work was incomplete.
A high employee number suggests training need.

## 4. Recurring incidents

### 4.1 Detection sources

- Job title text similarity.
- Shared tags on jobs.
- Same client and same category within a window.

### 4.2 Data structure

- `IncidentCluster` entity. Phase 2.
- Linked jobs.
- Suggested resolution from knowledge base.

### 4.3 Action

- Mark cluster as "Root cause known." Phase 2.
- Link to a `KnowledgeArticle`.
- Promote to "Productize" candidate.

## 5. Infrastructure and client environment tracking

The single highest-leverage Phase 2 module.

### 5.1 Per-client environment

Fields per environment.

- Hostname or label.
- Type: server, workstation, network device, cloud, SaaS.
- Hosting provider.
- IP or DNS placeholder.
- OS or platform.
- Owner or contact at client.
- Important notes.
- Credential reference. No secrets. Pointer only.

### 5.2 Credential reference

Reference, not storage.

- Vault: 1Password, Bitwarden, KeePassXC, other.
- Item name in vault.
- Owner.

Real passwords never enter the portal.
Vault link is a deep-link to the vault item.

### 5.3 Linked jobs

A job can be linked to one or more environment records.
"This job touched server X and switch Y."
This is the foundation for change management.

## 6. R&D and project visibility

R&D is different from helpdesk and IT.

### 6.1 Project mode

A `Job` can opt into project mode.

- Has milestones.
- Has expected delivery date.
- Has scope notes.
- Has cross-dependencies.

### 6.2 Milestones

A simple `JobMilestone` entity.

- Title.
- Due date.
- Status: open, in progress, done, blocked.
- Owner.

### 6.3 Sprints

Reject for now.
Skyware is not a software-product company at this scale.
A milestone view covers the need.

## 7. Automation opportunities

Pre-agent automation is also valuable.

### 7.1 In MVP

- Auto-create draft job from a manual "Create from email" form.
- Auto-populate VAT and totals on receipt drafts.
- Auto-default SLA from priority.
- Auto-link a job to last selected client.

### 7.2 In Phase 2

- Recurring jobs from templates.
- Burn-rate alerts.
- SLA breach notifications.
- Client environment auto-link based on job text.

### 7.3 In Phase 3 or later

- Email ingestion with classification.
- Agent proposals for payment-paid actions.
- Agent proposals for supplier-receipt drafts.
- Agent suggestions for repeated-issue clustering.
- Agent autonomy gates per capability.

## 8. Operational risks

### 8.1 Knowledge in one head

- A senior engineer leaves. Knowledge leaves.
- Mitigation: knowledge base from solved jobs.

### 8.2 Configuration drift

- Client environments change without record.
- Mitigation: env entity with last-touched date.

### 8.3 Credentials sprawl

- Engineers store secrets in many places.
- Mitigation: vault-reference rule. No portal storage.

### 8.4 Slow review queue

- Done jobs sit unreviewed.
- Mitigation: review backlog widget. SLA on review.

### 8.5 Hub neglect

- Items pile up. No one takes them.
- Mitigation: hub age metric. Auto-escalate to admin after threshold.

### 8.6 Audit log gaps

- Some action is forgotten in audit code.
- Mitigation: middleware that writes on every mutation route.

### 8.7 Agent overreach

- Agent acts without admin approval.
- Mitigation: propose-only default. Per-capability autonomy flag.

## 9. Security posture overview

CTO is the security owner.

### 9.1 In MVP

- Strong password hashing.
- Session expiry.
- HTTPS enforced.
- Rate limits on login.
- Security headers. CSP, HSTS, frame-ancestors.
- Backup and restore drill.
- Admin-only access to financial pages.

### 9.2 In Phase 2

- 2FA for admins. Strongly recommended.
- IP allowlist option for admin panel.
- Login alerts on new device.

### 9.3 In Phase 3 or later

- SSO via Microsoft Entra or Google Workspace.
- Audit-log SIEM export.
- Secrets manager integration for vault references.

## 10. CTO-perspective additions classified

| Idea | Verdict |
|------|---------|
| Recurring incidents widget | Add to Phase 2 |
| Client environment entity | Add to Phase 2 |
| Credential reference field, no secrets | Add to Phase 2 |
| Project mode with milestones | Add to Phase 2 |
| Recurring-job templates engine | Add to Phase 2 |
| Manual create-job-from-email form | Add to MVP |
| Auto-default SLA from priority | Add to MVP |
| 2FA for admins | Add to Phase 2 |
| SSO integration | Add later |
| Email ingestion pipeline | Add later |
| Agent autonomy gates per capability | Add later |
| Hub age metric and escalation | Add to MVP |
