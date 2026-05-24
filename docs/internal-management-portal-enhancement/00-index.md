# Enhancement Pass: Index

Version: 0.1
Date: 2026-05-15
Status: Strategic review. No code.

## Purpose

The original plan in `docs/` is a solid baseline.
This pass adds IT-services-specific value.
It does not replace the original plan.
It targets revenue, retention, ops clarity.

## Files in this folder

Read in numeric order for full context.

| File | Subject |
|------|---------|
| `00-index.md` | This file. |
| `01-current-plan-review.md` | System map and gap analysis. |
| `02-ceo-perspective.md` | CEO visibility, profitability, risk. |
| `03-cto-perspective.md` | Tech ops, automation, risk. |
| `04-it-business-advisor-perspective.md` | Revenue, retention, pricing. |
| `05-ux-ui-review.md` | Layout and interaction guidance. |
| `06-recommended-new-modules.md` | Per-module specs with verdicts. |
| `07-mvp-and-roadmap.md` | Revised MVP and phasing. |
| `08-data-model-additions.md` | New entities and fields. |
| `09-ux-wireframe-descriptions.md` | Text-only wireframes. |
| `10-final-recommendation.md` | Shortlist and next prompt. |
| `README.md` | Folder usage and merge guidance. |

## Reading orders by audience

Decision makers: `00`, `02`, `04`, `10`.
Implementation prep: `00`, `01`, `06`, `07`, `08`, `09`.
Design review: `05`, `09`.
Everything: numeric order.

## Final recommendation summary

Full detail lives in `10-final-recommendation.md`.

### Accept into MVP (small, high leverage)

- SLA tracking with breach detection.
- Hourly-bank low-balance alerts.
- Overdue-payment client flag on dashboards.
- Severity field separated from priority.
- Active time session (timer) on jobs.
- Global search bar with scoped results.
- Saved views on Jobs, Clients, Billing.
- Job tags surfaced in list and detail UI.
- Light client environment notes panel.
- Manual "Create job from email" form.
- In-app notification scaffold for alerts.

### Postpone to Phase 2

- Asset and CMDB lite inventory.
- Recurring and scheduled jobs engine.
- Knowledge base from solved jobs.
- Escalation rules engine.
- Client health score.
- Underpriced-client detector report.
- CSAT survey after job review.
- Approval workflow for quotes and changes.
- Project mode for R&D milestones.
- Credential reference vault, no secrets.

### Postpone to Phase 3 or later

- Email-to-job full ingestion pipeline.
- Limited client-facing portal.
- Change management workflow.
- Vendor and license registry.
- Disaster recovery readiness tracker.
- Auto-generated client status reports.

### Reject for now

- Full client self-service portal.
- ITSM-grade workflow engine.
- Hardware POS asset tracking.
- Slack or Teams replacement.
- General-ledger accounting features.

## Cross-file dependency map

- `01` informs every later file.
- `02`, `03`, `04` feed `06`, `07`, `10`.
- `06` and `08` are tightly coupled.
- `07` consumes `06`.
- `09` illustrates `05` and `07`.
- `10` collapses all above.

## TODO and continuation notes

All 12 files are written.
If output is interrupted, see `README.md`.
The numeric order is the resume order.
