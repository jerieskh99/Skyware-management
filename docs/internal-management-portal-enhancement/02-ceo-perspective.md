# CEO Perspective

The CEO needs answers in seconds.
Not dashboards. Specific answers.

## 1. The five CEO questions

Every CEO of a services company asks the same five.

1. Are we making money this month?
2. Which clients are profitable. Which are not.
3. Who is overloaded. Who is idle.
4. What money is owed to us. How old is it.
5. What could blow up this week.

The portal should answer all five on the dashboard.

## 2. CEO dashboard widgets

### 2.1 Revenue this month

- MRR from active monthly plans. Placeholder amounts.
- Hourly-bank revenue recognized this month.
- One-time-job revenue invoiced this month.
- Comparison to last month. Percent and delta.

### 2.2 Cash position

- Total invoiced and unpaid. Aging buckets.
  - 0 to 30 days.
  - 31 to 60 days.
  - 61 to 90 days.
  - 90 plus days.
- Drill-down per client.

### 2.3 Top profitable and unprofitable clients

- Hours consumed vs revenue placeholder per client.
- Rank from best margin to worst margin.
- Highlight clients in the bottom quartile.
- Flag "underpriced" when margin is negative.

### 2.4 Workload distribution

- Hours per employee this week and this month.
- Active job count per employee.
- Flag employees above a configurable load threshold.
- Flag employees below an "idle" threshold.

### 2.5 Risk this week

- SLA breaches in last 7 days.
- Currently delayed jobs.
- Clients with two or more reopened jobs this month.
- Clients with unpaid invoices past 60 days.

### 2.6 Pipeline placeholder

- Proforma invoices outstanding.
- Quotes waiting for client decision.
- Optional. Not MVP.

## 3. Company health indicators

A small strip of numbers at the top.

- Active clients.
- Active monthly plans.
- Hourly-bank active count.
- Hours billed this month.
- Open jobs total.
- Delayed jobs total.
- Net new clients this quarter.
- Lost clients this quarter.

Each tile clicks through to a filtered list.

## 4. Client profitability visibility

A first-class report.

### Inputs
- Total hours per client. From job time spent.
- Total revenue placeholder per client. From payments.
- Cost-per-hour placeholder. Configurable.

### Output
- Margin per client per month.
- Trend line over last 6 months.
- Threshold to flag underpriced.

### Use
- Renegotiation triggers.
- Plan upsell suggestions.
- "Fire the client" conversations.

## 5. Employee workload visibility

Two views.

### Real-time view
- Live count of active jobs per employee.
- Hours started this week.
- Delayed jobs per employee.

### Historical view
- 8-week rolling hours per employee.
- Average completion time.
- Reopened-job rate.

The page must include the dual framing.
Statistics as operational, not punitive.

## 6. Unpaid and late payment visibility

Two surfaces.

### Dashboard widget
- Total unpaid. Total overdue.
- Worst-aged client name.

### Dedicated page
- Filter by aging bucket.
- Filter by client.
- Quick actions:
  - Send reminder placeholder.
  - Mark a payment Paid.
  - Convert to hourly-bank top-up offer.

Reminder send is manual at MVP.
Automation belongs in the agent module.

## 7. Growth and bottleneck indicators

### Growth
- New clients per quarter.
- Net new MRR per quarter.
- Hourly-bank top-ups per quarter.
- Conversion of proforma to receipt.

### Bottlenecks
- Hub take latency by department.
- Reviewed-job backlog. Jobs in `done`, waiting for admin review.
- Approval-pending count. Phase 2.
- Department with longest median completion.

## 8. CEO-only views worth considering

These do not require new roles.
They are admin-only views with CEO labels.

- "Money board." A dedicated page that compiles the above.
- "Renewal radar." Monthly plans nearing end_date.
- "Top 5 at risk." A weekly summary email or in-app card.

## 9. Decisions the CEO should be able to make in the portal

Not just see numbers. Act.

- Approve a quote.
- Pause a monthly plan.
- Mark a client as priority handling.
- Reassign a job.
- Set a client SLA tier.
- Write an internal note on a client.

The Communication module already supports the note part.
Other actions are admin already. Surface them on the relevant page.

## 10. Out of scope for the CEO view

- Editing tax invoices line by line.
- Manual numbering of receipts.
- Detailed time entries.

Those are CTO or office-admin tasks.
The CEO view should aggregate, not edit.

## 11. CEO-perspective additions classified

| Idea | Verdict |
|------|---------|
| Cash aging buckets widget | Add to MVP |
| Workload distribution widget | Add to MVP |
| Underpriced client flag | Add to Phase 2 |
| Renewal radar for monthly plans | Add to Phase 2 |
| Quote and proposal pipeline | Add later |
| "Money board" consolidated page | Add to Phase 2 |
| Approval workflow for quotes | Add to Phase 2 |
| Lost-client tracking | Add to Phase 2 |
| Reminder send automation | Reject for now |
| Real general-ledger features | Reject for now |
