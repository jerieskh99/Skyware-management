# IT Business Advisor Perspective

This file looks at the portal as a revenue and retention tool.
Not just an internal scoreboard.

## 1. The advisor frame

An IT services company has five economic levers.

1. Hours sold and hours delivered.
2. Pricing per client.
3. Retention of recurring revenue.
4. Operational cost per ticket.
5. Productization of repeated work.

Every feature recommendation maps to one of these.

## 2. Features that grow revenue

### 2.1 Hourly-bank top-up workflow

When a client's bank drops below a threshold:

- Show alert in CEO and Account Manager dashboards.
- Offer one-click "Send top-up proposal" workflow. Phase 2.
- Track conversion rate of top-up offers.

### 2.2 Plan upgrade signals

When a client without a monthly plan exceeds N billable jobs in a month:

- Flag the client for "Consider monthly plan."
- Suggest a tier based on actual usage. Phase 2.

### 2.3 Proforma to receipt conversion

Already in the spec. Make it more visible.

- "Quotes outstanding" widget for CEO.
- Stale-quote alert after 14 days. Phase 2.

### 2.4 Renewal radar

Monthly plans approaching `end_date`.

- 30-day warning. 7-day warning. Same-day alert.
- One-click renew.

### 2.5 Cross-sell from solved jobs

When a job is reviewed, propose related services.

- Manual at MVP. Free text in admin note.
- Suggestion engine in Phase 3.

## 3. Features that reduce wasted time

### 3.1 Knowledge base

Solved jobs become articles.

- "Promote to KB" button on `reviewed` jobs.
- Article fields: problem, environment, resolution, related jobs.
- Search from any job page.

### 3.2 Templates

- Job templates. Common shapes. "Backup verification check."
- Receipt templates. Common line-items.
- Communication post templates. Outage announcements.

### 3.3 Saved views

- Each user saves filter sets.
- Admin can pin team-wide views.

### 3.4 Active timer

- One click starts a timer on a job.
- Pause and resume.
- Reduces end-of-day reconstruction.

### 3.5 Global search

- Single search bar.
- Scoped: jobs, clients, posts, documents, KB.
- Recency boost. Tag boost.

## 4. Features that improve client retention

### 4.1 CSAT capture

- After `reviewed`, optional 1-tap rating.
- Comment optional.
- Visible on client detail page.

### 4.2 Account review cadence

- Calendar entry per client for quarterly check-ins.
- Last review date on client overview.
- Phase 2.

### 4.3 Client-facing summary

- Monthly auto-generated report per client.
- Hours used. Jobs completed. CSAT.
- Sent by admin click. Not auto-sent. Phase 3.

### 4.4 Limited client portal

- Read-only status page for the client's jobs.
- Authenticated with magic link.
- Phase 3 or later. Real scope creep risk.

### 4.5 Proactive contact log

- Communication module already supports posts linked to clients.
- Surface "no client contact in 60 days" on the client page.

## 5. Features that reduce operational chaos

### 5.1 SLA tracking

- Breach detection on each job.
- Banner on the job page.
- In-app and email notification at breach. Phase 2.

### 5.2 Escalation rules

- "If a job is urgent and not started in 30 minutes, page CTO."
- "If a job is waiting_for_admin over 24h, ping CEO."
- Phase 2. Rules table with simple condition syntax.

### 5.3 Single inbox

- Communication module is already this.
- Reinforce: no Skyware operational chat outside the portal.
- Track via dashboard widget. Phase 2.

### 5.4 Status of "waiting" buckets

- Waiting for client by client. Waiting for admin by admin.
- One click "nudge" prompt that opens a draft post.

### 5.5 Audit log access

- CTO and CEO can search by user, by entity.
- Reduces "who changed that" debates.

## 6. Features that support pricing decisions

### 6.1 Hours-vs-revenue per client

- Margin per client. Trend.
- See `02-ceo-perspective.md` Section 4.

### 6.2 Effort per service type

- Average hours for "email outage." For "VPN setup."
- Grounds new quote estimates in real data.

### 6.3 Underpriced flag

- Auto-flag clients with margin below threshold.
- Threshold configurable.

### 6.4 Effort by tag

- Tag-driven effort report.
- "Backup recovery" averages X hours. Quote accordingly.

### 6.5 Discount tracking

- When a discount is given, capture it.
- A `Payment.discount_reason` field. Phase 2.

## 7. Things to deprioritize as an advisor

Saying no is also advice.

### 7.1 General-ledger accounting

- The portal is not a bookkeeping system.
- An Israeli accountant uses dedicated tools.
- Stay focused on operations.

### 7.2 Full ITSM workflow engine

- ServiceNow-grade workflow is overkill.
- The job lifecycle is enough.

### 7.3 Slack or Teams replacement

- Communication module is for work-context posts.
- Real-time chat lives elsewhere.

### 7.4 Hardware POS-style asset tracking

- A CMDB lite is enough for now.
- Serial-number tracking only if a client demands it.

### 7.5 Public ticket submission

- Out of scope.
- A limited client portal can come later in Phase 3 or later.

## 8. Quick-win prioritization

Top 5 to commit for MVP. Highest leverage per hour.

1. Hourly-bank low-balance flag. Even a passive UI banner is enough.
2. Global search bar with scoped results.
3. Saved views on Jobs, Clients, Billing.
4. SLA breach indicator on job detail.
5. Severity field added to Job.

Next 5 for Phase 2.

1. Recurring jobs from templates.
2. CSAT capture on reviewed jobs.
3. Knowledge base "promote to KB" workflow.
4. Renewal radar for monthly plans.
5. Underpriced-client report.

## 9. Pricing levers the portal unlocks

- Real average hours per service category.
- Real margin per client.
- Real CSAT per client.
- Real reopened rate per client.

Each unlocks a conversation:

- "Your average effort doubled. We need to revise the plan."
- "Your CSAT is dropping. Let's invest in environment notes."
- "Your reopened rate is 30 percent. We need to widen scope."

## 10. Risks of advisor additions

- Knowledge base unused. Mitigation: low friction promote button.
- CSAT not collected. Mitigation: 1-tap, optional, in `reviewed`.
- Underpriced flag becomes finger-pointing. Mitigation: shown only to admins, framed as renegotiation prompt.
- Renewal radar misfires on flexible contracts. Mitigation: nullable `end_date` and explicit "auto-renews" flag.

## 11. Advisor additions classified

| Idea | Verdict |
|------|---------|
| Hourly-bank top-up workflow | Add to Phase 2 |
| Plan upgrade signal | Add to Phase 2 |
| Renewal radar | Add to Phase 2 |
| Cross-sell suggestion engine | Add later |
| Knowledge base from solved jobs | Add to Phase 2 |
| Templates for jobs and posts | Add to Phase 2 |
| Saved views | Add to MVP |
| Active timer | Add to MVP |
| Global search | Add to MVP |
| CSAT capture | Add to Phase 2 |
| Account review cadence | Add to Phase 2 |
| Client-facing report PDF | Add later |
| Limited client portal | Add later |
| SLA breach detection | Add to MVP |
| Escalation rules engine | Add to Phase 2 |
| Hours-vs-revenue margin chart | Add to Phase 2 |
| Effort per service report | Add to Phase 2 |
| Underpriced client flag | Add to Phase 2 |
| Discount tracking field | Add to Phase 2 |
