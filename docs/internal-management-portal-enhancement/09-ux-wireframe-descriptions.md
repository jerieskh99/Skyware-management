# UX Wireframe Descriptions

Text-only wireframes. No images. No code.
Each wireframe describes a single page.

Notation:

- `[ Header ]` for header strip.
- `[ Sidebar ]` for left nav.
- `( Tile )` for KPI tile.
- `+--+` boxes for content regions.
- `|` separators for vertical splits.

Hebrew is RTL. Mirror the layout when language is Hebrew.

---

## 1. Admin Dashboard

```
+---------------------------------------------------------------------------+
| [ Sidebar ]   Skyware Internal Portal                  [ Search ] [Bell] [User] |
|             ----------------------------------------------------------------|
| Dashboard   | KPI strip                                                    |
| My Jobs     |  ( Active Jobs )  ( Delayed )  ( Hours MTD )  ( Unpaid )    |
| Hub         |                                                              |
| Dept Jobs   | Needs attention                                              |
| Global Jobs |  +--------------------+   +--------------------------------+ |
| Communicat. |  | Waiting for admin  |   | SLA breaches (last 7 days)     | |
| Clients     |  | 4 jobs             |   | 2 breaches                     | |
| Billing     |  +--------------------+   +--------------------------------+ |
| Receipts    |                                                              |
| Statistics  | Money board                                                  |
| Agent       |  +--------------------+   +--------------------------------+ |
| Admin       |  | Aging buckets      |   | Banks at risk                  | |
| Settings    |  | 0-30 31-60 61-90 + |   | Client A 22% remaining         | |
|             |  +--------------------+   +--------------------------------+ |
|             |                                                              |
|             | Reviews pending                                              |
|             |  +-----------------------------------------------------+    |
|             |  | 6 jobs in Done waiting for Review                   |    |
|             |  +-----------------------------------------------------+    |
|             |                                                              |
|             | Recent client activity                                       |
|             |  +-----------------------------------------------------+    |
|             |  | Client A: 3 jobs closed, last 7 days                |    |
|             |  | Client B: monthly plan ends in 14 days              |    |
|             |  +-----------------------------------------------------+    |
+---------------------------------------------------------------------------+
```

Notes:

- KPI tiles click into filtered lists.
- "Banks at risk" sorts by lowest remaining percent.
- "Aging buckets" links into Billing with the bucket filter applied.
- Hebrew mode flips the layout. Sidebar moves to the right.

---

## 2. Employee Dashboard

```
+---------------------------------------------------------------------------+
| [ Sidebar ]                                       [ Search ] [Bell] [User]|
|             ----------------------------------------------------------------|
| Dashboard   | Status strip                                                 |
| My Jobs     |  ( Active 3 )  ( Delayed 1 )  ( Hours this week 14 )        |
| Hub         |                                                              |
| Dept Jobs   | Resume work                                                  |
| Global Jobs |  +-----------------------------------------------------+    |
| Communicat. |  | Timer paused on "Email outage at Client A"          |    |
| Settings    |  | [ Resume ]  [ Open job ]                            |    |
|             |  +-----------------------------------------------------+    |
|             |                                                              |
|             | Working on it                                                |
|             |  +---------+  +---------+  +---------+                       |
|             |  | Card    |  | Card    |  | Card    |                       |
|             |  +---------+  +---------+  +---------+                       |
|             |                                                              |
|             | Assigned, not started                                        |
|             |  - Job 1 ... [ Mark working ]                                |
|             |  - Job 2 ... [ Mark working ]                                |
|             |                                                              |
|             | Available in your hub                                        |
|             |  - Job 3 ... [ Take task ]                                   |
|             |  - Job 4 ... [ Take task ]                                   |
|             |  [ View full hub ]                                           |
|             |                                                              |
|             | Communication highlights (24h)                               |
|             |  - "Backup failed at Client A" - by IT.demo                  |
|             |  - "Maintenance window Friday" - pinned                      |
+---------------------------------------------------------------------------+
```

Notes:

- "Resume work" only appears if a paused timer exists.
- The "Available in your hub" list is scoped to the employee's department.
- Status strip is the same shape as admin. Different metrics.

---

## 3. Job Detail Page

```
+---------------------------------------------------------------------------+
| [ Sidebar ]                                       [ Search ] [Bell] [User]|
|             ----------------------------------------------------------------|
| Job #2026-0037   "Email outage at Client A office"                         |
| [ Chips: Helpdesk | High | Severity Major | Working on it | Mine ]         |
| SLA bar:  [################----------]  62%  amber                         |
|                                                                            |
| +-----------------------------------+  +-------------------------------+   |
| | Tabs: Overview | Timeline | Files |  | Actions                       |   |
| |                                   |  |  [ Mark done ]                |   |
| | Overview                          |  |  [ Pause ]  [ Reassign ]      |   |
| |                                   |  |                               |   |
| | Description                       |  | Timer                         |   |
| |  Users report intermittent...     |  |  Running: 00:42:15            |   |
| |                                   |  |  [ Pause ]  [ Stop ]          |   |
| | Tags: [outage] [email] [client-a] |  |                               |   |
| |                                   |  | Meta                          |   |
| | Linked environment                |  |  Client: Client A             |   |
| |  - On-prem relay (server)         |  |  Priority: High               |   |
| |                                   |  |  Severity: Major              |   |
| | Knowledge base suggestions        |  |  Created by: admin.cto        |   |
| |  - "Relay certificate rotation"   |  |  Created: 2 days ago          |   |
| |                                   |  |  SLA target: 24h              |   |
| | Communication                     |  |  Breached: no                 |   |
| |  - Linked post: "Mail issues..."  |  |                               |   |
| |                                   |  | Billing                       |   |
| |                                   |  |  Hourly bank: Client A        |   |
| |                                   |  |  Remaining: 18h               |   |
| +-----------------------------------+  +-------------------------------+   |
+---------------------------------------------------------------------------+
```

Notes:

- The right column is sticky on scroll.
- SLA bar shows derived state in color and percent.
- "Knowledge base suggestions" is Phase 2.
- "Linked environment" is MVP via free-text note linkage. Asset linkage Phase 2.
- Mobile collapses to single column. Right column becomes the bottom sheet.

---

## 4. Client Detail Page

```
+---------------------------------------------------------------------------+
| Client A Ltd      Status: Active      Tax ID: 000000001                    |
| Account owner: -                                                           |
|                                                                            |
| Tabs: Overview | Jobs | Billing | Payments | Receipts | Environment | Notes|
|                                                                            |
| Overview                                                                   |
|  +---------------------+  +---------------------+  +-----------------+    |
|  | Monthly plan        |  | Hourly bank         |  | One-time charges |   |
|  | Managed IT Ops      |  | 18 of 80 hrs left   |  | 2 outstanding   |   |
|  | Active              |  | [#####-----] burn   |  | 1 paid          |   |
|  +---------------------+  +---------------------+  +-----------------+    |
|                                                                            |
|  Contacts                                                                  |
|   Contact A   contact@client-a.example   +972-50-0000001                   |
|                                                                            |
|  Latest activity                                                           |
|   - Job #2026-0037 working_on_it                                           |
|   - Payment #2026-0123 paid 2 days ago                                     |
|   - Communication post pinned                                              |
|                                                                            |
|  Effort vs revenue (Phase 2)                                               |
|   Sparkline placeholder                                                    |
+---------------------------------------------------------------------------+
```

Notes:

- The burn-rate bar shows green, amber, red.
- Tooltip on hover: projected runout date.
- "Environment" tab Phase 2 for assets. MVP for free-text sections.

---

## 5. Billing Page

```
+---------------------------------------------------------------------------+
| Billing                                                                    |
| ( Invoiced this month )  ( Unpaid )  ( Overdue )                          |
| Aging:  [0-30: 4]  [31-60: 2]  [61-90: 1]  [90+: 0]                       |
|                                                                            |
| Tabs: All payments | Monthly | Hourly banks | One-time | Drafts            |
| Filters: client | status | source | date range                            |
| Actions: [ Save view ]  [ Export CSV ]                                     |
|                                                                            |
| Row layout                                                                 |
|  Client    Source    Amount   Currency  Issued   Due     Status            |
|  Client A  Monthly   ----     ILS       05-01    05-15   Waiting           |
|  Client B  One-time  ----     ILS       05-12    05-22   Paid              |
|  Client C  Hourly    ----     ILS       05-08    05-22   Overdue           |
|                                                                            |
| Quick action on row hover: [ Mark sent ] [ Mark paid ] [ Open ]            |
+---------------------------------------------------------------------------+
```

Mark-paid drawer (right side):

```
+--------------------------------------------+
| Mark payment paid                          |
| Client C  - Hourly bank top-up             |
|                                            |
| Paid date: 2026-05-15                      |
| Method:    [Bank transfer ▼]               |
| Reference: ASMACHTA-...                    |
| Note:      ...                             |
|                                            |
| [ x ] Create receipt or tax document       |
|                                            |
| [ Save ]                                   |
+--------------------------------------------+
```

Notes:

- The drawer slides in from the right. Page underneath remains visible.
- Saving with the checkbox routes to receipt draft.

---

## 6. Communication Page

```
+---------------------------------------------------------------------------+
| Channels:  [ Global ]  [ Helpdesk ]  [ IT ]  [ R&D ]                      |
| Active: Helpdesk                                                           |
|                                                                            |
| Filters: tag | author | related client | resolved/unresolved | date        |
|                                                                            |
| Compose                                                                    |
|  Title: ____________________________________________                       |
|  Body:  ____________________________________________                       |
|  Tags:  [Urgent] [Client issue] ...                                        |
|  Related: [job] [client]                                                   |
|  Attachments: [ + ]                                                        |
|  [ Post ]                                                                  |
|                                                                            |
| Posts                                                                      |
|  +-------------------------------------------------------------------+    |
|  | "VPN drops at Client A office"             tags: [client-issue]   |    |
|  | by helpdesk.demo  - 2 hours ago  - 3 replies                      |    |
|  | excerpt: started this morning around 09:00...                     |    |
|  | Related job: #2026-0037                                           |    |
|  +-------------------------------------------------------------------+    |
|  +-------------------------------------------------------------------+    |
|  | "Maintenance Friday night"   PINNED  tags: [internal-update]     |    |
|  | by admin.cto  - yesterday  - 1 reply                              |    |
|  +-------------------------------------------------------------------+    |
+---------------------------------------------------------------------------+
```

Post detail:

```
+----------------------------------------------------------------+
| "VPN drops at Client A office"                                 |
| tags [client-issue]  related job #2026-0037                    |
|                                                                |
| by helpdesk.demo - 2 hours ago                                 |
|                                                                |
| Full body markdown                                             |
|                                                                |
| Replies                                                        |
|  - it.demo: checked the router logs ...                        |
|  - admin.cto: escalating to on-site visit                      |
|                                                                |
| [ Reply box ]                                                  |
| [ Mark resolved ]   [ Convert to job ] (Phase 2)               |
+----------------------------------------------------------------+
```

---

## 7. Agent Control Center

```
+---------------------------------------------------------------------------+
| Agent Control Center        Status: [ Offline ]  (gray-tinted page)        |
|                                                                            |
| Description                                                                |
|  This page will host an internal automation agent.                         |
|  It is not active yet.                                                     |
|                                                                            |
| Capabilities (planned)                                                     |
|  - Monitor a dedicated mailbox                                             |
|  - Detect client payment confirmations                                     |
|  - Read supplier receipts                                                  |
|  - Create draft jobs from inbound emails                                   |
|  - Notify admins about urgent flags                                        |
|  - Suggest billing updates                                                 |
|  - Summarize internal activity                                             |
|  - Detect repeated technical issues                                        |
|  - Generate reports                                                        |
|                                                                            |
| Permissions (read-only matrix)                                             |
|  Capability                | Allowed | Mode       | Notes                  |
|  Read mailbox              | Planned | -          | Phase 3                |
|  Draft jobs from emails    | Planned | Propose    | Phase 3                |
|  Send messages             | No      | -          | Not planned            |
|                                                                            |
| Tasks handled by agent (empty)                                             |
|                                                                            |
| Logs (empty)                                                               |
|                                                                            |
| Admin controls                                                             |
|  [ Start (disabled) ]  [ Pause (disabled) ]  [ Stop (disabled) ]           |
|  Tooltip: Available when agent is provisioned.                             |
|                                                                            |
| Notes panel (editable)                                                     |
|  Design notes by CTO ...                                                   |
+---------------------------------------------------------------------------+
```

Notes:

- Whole page has a desaturated tint to make "not live" obvious.
- Notes panel is the only editable region.

---

## 8. Mobile View. My Jobs

```
+----------------------------+
| Skyware Internal      [Bell]|
| [ Search ]                  |
+----------------------------+
| My Jobs                     |
| Filters: [ All ▼ ]          |
| -------------------------- |
| Email outage at Client A    |
| High | Major | Working      |
| SLA [#####-----]            |
| -------------------------- |
| VPN issue at Client B       |
| Normal | Moderate | Assigned|
| SLA [##--------]            |
| -------------------------- |
| Tap a card to open          |
|                            |
| (Sticky bottom)             |
| [▶ Timer: 00:42:15  || ▢]   |
| (Sticky bottom nav)         |
| [Home][Jobs][Hub][Chat][Me] |
+----------------------------+
```

Notes:

- Bottom nav replaces the sidebar.
- Timer is sticky above the bottom nav.
- Mark working and mark done are reachable with thumb.

---

## 9. Receipts Page

```
+---------------------------------------------------------------------------+
| Receipts / Tax Documents                                                   |
|                                                                            |
| BANNER: "Not for issuance until accountant verification. Draft only."      |
|                                                                            |
| Tabs by type: Invoice | Receipt | Tax Invoice | Tax Inv+Receipt | Credit  |
| Filters: client | date | status | document number                         |
|                                                                            |
| Rows                                                                       |
|  Type           Number     Client   Issued   Status      Total             |
|  Tax Inv+Rec    2026-0007  Client A 05-15    Finalized   ----              |
|  Receipt        2026-0014  Client B 05-12    Draft       ----              |
|                                                                            |
| Actions on row: [ Open ]  [ Download HTML ]                                |
+---------------------------------------------------------------------------+
```

Draft view:

```
+--------------------------------------------+
| Tax Invoice + Receipt (Draft)              |
| Client: Client A                           |
| Source payment: #2026-0123                 |
|                                            |
| Lines                                      |
|  Managed IT Ops May 2026   qty 1   ----    |
|  [ + Add line ]                            |
|                                            |
| Subtotal: ----                             |
| VAT (18% placeholder): ----                |
| Total: ----                                |
|                                            |
| Language: [ Hebrew ▼ ]                     |
|                                            |
| [ Save draft ]  [ Finalize (locked) ]      |
+--------------------------------------------+
```

Notes:

- Finalize is locked behind a feature flag in production until accountant sign-off.
- The verification banner stays on every receipt page.

---

## 10. Statistics Page

```
+---------------------------------------------------------------------------+
| Employee Statistics                                                        |
|                                                                            |
| Banner: "Operational insight, not surveillance. Read both halves."         |
|                                                                            |
| Filters: employee | department | client | date | status | tag             |
| Bucketing: [ Day | Week | Month ]                                          |
|                                                                            |
| Per-employee section                                                       |
|  - Jobs completed                                                          |
|  - Hours reported                                                          |
|  - Avg completion time per priority                                        |
|  - Active jobs                                                             |
|  - Delayed jobs                                                            |
|  - Reopened rate                                                           |
|  - Weekly activity sparkline                                               |
|                                                                            |
| Business section                                                           |
|  - Workload distribution (bar)                                             |
|  - High-effort clients (table)                                             |
|  - Recurring issue clusters (table) (Phase 2)                              |
|  - Departments under pressure (gauge)                                      |
|  - Hub vs assignment ratio (pie)                                           |
|  - Hub take latency (line)                                                 |
|                                                                            |
| Export: [ CSV ]                                                            |
+---------------------------------------------------------------------------+
```

Notes:

- Banner is mandatory. Reinforces dual framing.
- Filters persist to URL for sharing.
