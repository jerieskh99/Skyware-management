# Accepted Scope

This file lists every decision after the reconciliation pass.

## 1. Original requirements preserved

Every requirement from the original three planning files stays.
Nothing was removed.

Preserved core surface.

- Employee login. Username plus password.
- Three employee groups: Helpdesk, IT, R&D.
- Two admin roles: CEO, CTO.
- Job assignment by admin and pull from hub.
- Timestamped job status updates via JobStatusEvent.
- Employee work summaries via WorkReport at `done`.
- Task hubs: Global, Helpdesk, IT, R&D.
- Communication: Global, Helpdesk, IT, R&D channels.
- Client management with billing tabs.
- Three billing categories: Monthly, Hourly Bank, One-Time Job.
- Payment with full status workflow.
- Mark-paid modal with create-receipt handoff.
- Receipt and tax document workflow as drafts until accountant sign-off.
- Employee statistics with dual framing.
- Financial Documents page as placeholder.
- Agent Control Center as placeholder.
- Audit log on every critical mutation.
- Hebrew and English UI from day one.
- Asia/Jerusalem display timezone.

## 2. Enhancements accepted into MVP

Ten additions enter MVP.
Each maps to an acceptance criterion.

| # | Addition | Criterion | Effort |
|---|---|---|---|
| A1 | Severity field on Job, separate from priority | Core job workflow | Small |
| A2 | SLA target visible on job, display only | Core job workflow | Small |
| A3 | Hourly-bank burn-rate visual on client card | Basic billing visibility | Small |
| A4 | Overdue-payment aging buckets on admin dashboard | Basic billing visibility | Small |
| A5 | Global search bar with scope chips | Implementation foundation | Medium |
| A6 | Saved views on Jobs, Clients, Billing | Implementation foundation | Small |
| A7 | Active time timer with TimeSession entity | Employee status reporting | Medium |
| A8 | Manual create-job-from-email form | Admin assignment workflow | Small |
| A9 | Job tags surfaced in UI and lists | Core job workflow | Small |
| A10 | Client environment notes lite, free-text per section | Client management | Small |

### Rationale per addition

#### A1. Severity field
- IT operations need impact and urgency separately.
- Cheap. Single enum field.
- Improves prioritization clarity for CEO and CTO.

#### A2. SLA target visible
- The original spec already stores SLA target hours and a "delayed" derivation.
- This addition limits MVP to display only.
- A bar shows elapsed vs target.
- No automation. No breach event audit. No notification trigger.
- The richer SLA logic is Phase 2.

#### A3. Hourly-bank burn-rate visual
- A derived percent and a colored bar on the client card.
- No alert engine. No scheduled job.
- Catches the most common upsell moment.

#### A4. Overdue-payment aging buckets
- A derived query over Payment.
- No reminders sent. No automation.
- Highest signal for cash flow without engine work.

#### A5. Global search
- Postgres full-text indexes on title, body, names.
- Scope chips: Jobs, Clients, Posts.
- Foundation for everything else.

#### A6. Saved views
- SavedView entity.
- Personal by default. Team-shared optional.
- One-week productivity payoff.

#### A7. Active timer
- TimeSession entity.
- Reduces end-of-day reconstruction.
- Improves billing accuracy.
- Adds idle warning to avoid runaway timers.

#### A8. Manual create-job-from-email form
- Paste subject and body. Pre-fill job.
- Pure UI helper. No mailbox connector.
- Stepping stone to Phase 3 ingestion.

#### A9. Job tags
- The Tag and JobTag tables exist in the original data model.
- This addition surfaces them in lists, filters, detail.
- Required for repeated-issue detection later.

#### A10. Environment notes lite
- ClientEnvironmentNote entity. Free-text per section.
- No CMDB. No assets. No credentials.
- Reduces engineer ramp-up time.

## 3. Enhancements demoted from prior MVP draft

Two items that the prior pass proposed for MVP move to Phase 2.

| Item | New phase | Reason |
|---|---|---|
| Notifications scaffold | Phase 2 | User explicitly postpones notification system. Original spec also postponed it. |
| SLA breach automation | Phase 2 | User explicitly postpones SLA automation. Display only stays in MVP. |

## 4. Enhancements accepted for Phase 2

Substantial value, but not first-usable-version material.

- Notifications system in-app with email delivery.
- SLA breach detection events and triggers.
- SLA pause on `waiting_for_client`.
- Per-client SLA tier override.
- Recurring job templates engine.
- Knowledge base from solved jobs.
- Escalation rules engine.
- Client health score and snapshot.
- Underpriced-client report.
- CSAT capture after `reviewed`.
- Approval workflow for quotes and changes.
- Project mode for R&D milestones.
- Client environment inventory CMDB lite.
- Credential reference pointer entity. No secrets stored.
- Discount tracking field on payments.
- Burn-rate notification trigger.
- Renewal radar for monthly plans.
- Hourly-bank top-up workflow.
- PDF rendering of receipts.
- 2FA for admins.
- Convert post to job action.

## 5. Enhancements accepted for Phase 3 or later

Foundations from Phase 2 are required first.

- Email-to-job full ingestion pipeline.
- Financial Documents real activation.
- Agent Control Center real activation.
- Limited client portal.
- Change management workflow.
- Vendor and license registry.
- Disaster recovery readiness tracker.
- Auto-generated client status reports.
- Allocation-number integration.
- Digital signature integration.
- SSO via Microsoft Entra or Google Workspace.

## 6. Placeholders retained in MVP nav

Two pages remain as placeholders.
The data model is reserved. No active code paths.

- Financial Documents.
- Agent Control Center.

Both are visible in admin sidebar.
Both show explanatory empty-state copy.
Both are gated behind feature flags so they cannot be enabled by accident.

## 7. Rejected for now

These add complexity without payoff for the first version.

- Full client self-service portal.
- ITSM-grade workflow engine.
- Hardware POS asset tracking with serial numbers.
- Slack or Teams replacement.
- General-ledger accounting features.
- Native mobile app.
- Cross-sell recommendation engine.
- Real credential storage of any kind.
- Storing OAuth tokens for client systems.

"Rejected for now" does not mean forbidden forever.
It means revisit after MVP proves value.

## 8. Sources for each decision

- Original spec, Section 18 and 19, defines baseline MVP and later phases.
- Enhancement folder `06-recommended-new-modules.md` proposed 30 modules.
- Enhancement folder `07-mvp-and-roadmap.md` proposed 11 MVP additions.
- This file accepts 10 of those 11.
- The 11th (Notifications scaffold) is reclassified to Phase 2 per the reconciliation criteria.
- SLA breach automation, also reclassified to Phase 2 per the reconciliation criteria.

## 9. Open questions deferred

These do not block MVP scaffold work. They block real launch.

1. Real client list. "Needs user input."
2. Real employee identities and emails.
3. Skyware IT LTD legal details. Hebrew name. ח.פ. VAT number. Address.
4. Default SLA hours per priority. Suggested: Urgent 4h, High 24h, Normal 72h, Low 168h.
5. Default low-balance threshold. Suggested: 25 percent.
6. Israeli VAT rate at launch. Suggested placeholder 18 percent.
7. Allocation-number requirement and threshold for launch year.
8. Digital signature requirement and provider.
9. Hosting region preference.
10. Mailbox for future Financial Documents ingestion.
11. Vault provider used by the team.
12. CEO and CTO permission divergence. None at MVP.
13. Should employees see the global statistics page or only own. Default: own only.
14. Should `waiting_for_client` pause SLA in MVP. Default: no. Phase 2.
15. Default currency. Default: ILS only at MVP. Multi-currency Phase 2.
