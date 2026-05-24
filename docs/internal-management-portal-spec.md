# Skyware Internal Management Portal — Product Specification

Version: 0.1 (planning draft)
Date: 2026-05-15
Status: Specification only. No implementation yet.

Company context extracted from existing public site (`/Users/jeries/Desktop/projects/skyware-com/skyware-site/`):
- Legal entity: Skyware IT LTD
- Location: Haifa, Israel and Remote
- Public contact: info@skyware-it.com, +972 (0)54 550 7095
- Public service pillars: Infrastructure and Platforms, Security and Continuity, Advisory and Enablement
- Service categories observed: Managed IT Operations, Cybersecurity and Hardening, Cloud and Infrastructure, Data Center Management, Systems Engineering, Network Infrastructure, Business Continuity, Proactive Maintenance and Smart IT, Consulting and CIO as a Service, Training and Bootcamps
- Brand voice: engineering-driven, clarity, accountability, no vendor lock-in, security-first, senior execution, no fluff
- Existing stack hints: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, lucide-react

The internal portal is a separate codebase from the public site, but should reuse the visual language.

---

## 1. Product Overview

An internal operations portal for Skyware IT employees and admins. The portal centralizes job assignment, work execution, internal communication, client management, billing tracking, and Israeli payment-document workflows. It is also designed as the foundation for two future modules: financial-email ingestion and an internal automation agent.

The portal is not a CRM, not a customer support tool, and not a public-facing system. It is the internal source of truth for "who is doing what, for which client, for how much money, and where it stands."

### Primary actors
- Helpdesk employees
- IT employees
- R&D employees
- CEO (admin)
- CTO (admin)

### Non-goals (for now)
- Customer-facing self-service.
- Public ticket submission.
- Accounting general-ledger replacement.
- Time tracking as a punch clock; time tracking is per-job only.

---

## 2. Main Goals

1. Every employee opens one place to see their assigned jobs and available tasks.
2. Admins assign work explicitly or push it to a shared hub and let employees pull.
3. Every job has a complete timestamped lifecycle, so admins can answer "what happened, when, by whom."
4. Every job that produces revenue is connected to a billing record and, when paid, to an Israeli payment document.
5. Internal communication lives next to the work, scoped by department.
6. Admins get operational insight, not just employee surveillance, from the statistics page.
7. The data model is shaped so future automation (email ingestion, agent suggestions) plugs in without rewrite.

---

## 3. User Roles and Permissions

### Roles

| Role | Type | Scope |
|------|------|-------|
| Helpdesk Employee | Employee | Helpdesk department |
| IT Employee | Employee | IT department |
| R&D Employee | Employee | R&D department |
| CEO | Admin | Full system |
| CTO | Admin | Full system |

CEO and CTO have identical default permissions. They are separated as named roles so future divergence (e.g., CTO-only Agent controls, CEO-only financial overrides) is trivial.

### Permission matrix

| Capability | Employee (own dept) | CEO | CTO |
|---|---|---|---|
| Log in | Yes | Yes | Yes |
| View own jobs | Yes | Yes | Yes |
| View department jobs | Yes (own dept only) | Yes (all) | Yes (all) |
| View global jobs | Yes | Yes | Yes |
| Take a task from department hub | Yes (own dept) | Yes | Yes |
| Take a task from global hub | Yes | Yes | Yes |
| Update status on own job | Yes | Yes | Yes |
| Update status on any job | No | Yes | Yes |
| Add work summary / time spent | Yes (on own jobs) | Yes | Yes |
| Mark "Reviewed" | No | Yes | Yes |
| Create job | No | Yes | Yes |
| Assign job to employee or department | No | Yes | Yes |
| Post in department channel | Yes (own dept) | Yes (all) | Yes (all) |
| Post in global channel | Yes | Yes | Yes |
| Manage clients | No | Yes | Yes |
| Manage billing records | No | Yes | Yes |
| Mark payment as Paid | No | Yes | Yes |
| Trigger receipt/tax-document creation | No | Yes | Yes |
| View employee statistics | View own only | Yes | Yes |
| Access Financial Documents page | No | Yes | Yes |
| Access Agent Control Center | No | Yes | Yes (primary owner) |
| Access Admin Panel | No | Yes | Yes |

Permission enforcement happens at the API layer, not only the UI. UI hides what the API would refuse.

---

## 4. Navigation and Sidebar Structure

The portal uses a persistent left sidebar. Items are gated by role.

### Sidebar (employee view)
1. Dashboard
2. My Jobs
3. Department Jobs
4. Global Jobs
5. Task Hub
   - Global
   - (Own department)
6. Communication
   - Global
   - (Own department)
7. Settings

### Sidebar (admin view)
1. Dashboard
2. My Jobs (admin can also have personal queue)
3. Department Jobs (all four department views)
4. Global Jobs
5. Task Hub (Global, Helpdesk, IT, R&D)
6. Communication (Global, Helpdesk, IT, R&D)
7. Clients
8. Billing
9. Receipts / Tax Documents
10. Financial Documents
11. Employee Statistics
12. Agent Control Center
13. Admin Panel
14. Settings

### Header (all users)
- Global search (jobs, clients, posts)
- Notifications bell
- Current user menu (profile, language, logout)
- Language toggle: English / Hebrew (RTL aware)

---

## 5. Page-by-Page Specification

### 5.1 Dashboard
Purpose: a single landing screen tailored to the viewer.

Employee dashboard sections:
- "Working on it" jobs (top, sticky cards)
- Assigned but not started
- Department tasks available to take (max 5 with "view all")
- Recent communication highlights (last 24h, own department + global)
- Personal quick stats (jobs done this week, hours reported this week)

Admin dashboard sections:
- New jobs awaiting assignment
- Jobs flagged "Waiting for admin"
- Overdue jobs (no progress beyond SLA target)
- Payments waiting for receipt creation
- Recent client activity
- System-level KPIs (active jobs, hours billed this month, unpaid balance placeholder)

### 5.2 My Jobs
- Default view: all jobs where `assigned_employee = current user` and status not in (Done with Reviewed, Cancelled).
- Filters: status, priority, client, department, date range.
- Sort: priority desc, then created date.
- Actions per row: open detail, mark "Working on it," mark "Done," add note.
- "Closed" toggle reveals Done/Reviewed/Cancelled history.

### 5.3 Department Jobs
- One page per department (Helpdesk, IT, R&D) plus a unified Department Jobs page for admins.
- Employee sees only their own department (server-enforced).
- Columns: title, client, assignee, status, priority, age, last update.
- Filters: same as My Jobs.

### 5.4 Global Jobs
- Jobs with `department = Global` or jobs that span multiple departments.
- Same column structure.
- "Global" department exists as a real department record for FK simplicity.

### 5.5 Task Hub
- Four hubs: Global, Helpdesk, IT, R&D.
- Shows jobs whose status is `Available` and whose department matches the hub.
- Card view, not table. Each card: title, client, priority, posted-at, "Take task" button.
- Taking a task transitions status `Available → Taken`, sets `assigned_employee = current user`, records event.
- After taking, the task moves out of the hub and into the taker's My Jobs.
- Hub auto-refreshes every 30 seconds. Conflict on simultaneous take returns "already taken" and refreshes.

### 5.6 Communication
- Four channels: Global, Helpdesk, IT, R&D.
- Behavior: threaded forum/group chat hybrid.
  - Top-level posts have title, body, tags, attachments.
  - Replies are flat under each post.
- Employees can post in Global and in their own department.
- Admins can post in all.
- Posts support tags: Urgent, Client issue, Technical note, Internal update, Needs admin, Solved, Follow-up required.
- Search by text, tag, author, date.
- Mention syntax `@username` triggers notification (later phase).
- Optional: link a post to a Job (`related_job_id`).

### 5.7 Clients
- Admin-only.
- List view: company name, contact person, active status, monthly billing status, hourly bank status, last activity.
- Filters: active/inactive, has-monthly, has-hourly-bank, has-overdue-payment.
- Detail view (tabs):
  - Overview
  - Jobs (all jobs for this client)
  - Billing (monthly, hourly bank, one-time charges)
  - Payments and statuses
  - Receipts / Tax Documents
  - Notes
- Create / edit client form fields per Section 9.

### 5.8 Billing
- Admin-only.
- Master view of all billing items across clients.
- Filter by category: Monthly, Hourly Bank, One-Time Job.
- Filter by payment status: Draft, Sent to client, Waiting for payment, Partially paid, Paid, Cancelled, Overdue.
- Bulk-mark "Sent to client" (later phase).
- Marking a payment Paid opens an inline confirmation panel:
  - Date paid
  - Payment method (Bank transfer, Bit, Cheque, Cash, Credit card, Other)
  - Reference / asmachta number (Israeli payment reference)
  - Checkbox: "Create receipt / tax document"
  - On confirm, if checkbox is set, redirects to Receipts page in create mode pre-filled.

### 5.9 Receipts / Tax Documents
- Admin-only.
- List of all generated documents with filter by type, client, date, document number.
- Document types supported (see Section 11):
  - Invoice (חשבון עסקה)
  - Receipt (קבלה)
  - Tax Invoice (חשבונית מס)
  - Tax Invoice / Receipt (חשבונית מס קבלה)
  - Credit Note (חשבונית זיכוי)
  - Proforma Invoice (חשבון עסקה / הצעת מחיר)
- Create flow: pick type, pick client, pick source payment (optional), confirm fields, save as draft, finalize (assigns document number, locks edits).
- All numerical values and templates are placeholders until accountant verification.

### 5.10 Financial Documents (future module placeholder)
- Admin-only.
- See Section 13.
- For MVP: ship the page with empty-state copy and a "coming soon" panel that explains the planned ingestion behavior.

### 5.11 Employee Statistics
- Admin-only for cross-employee view.
- Employees see only their own statistics in Dashboard widgets.
- See Section 15.

### 5.12 Agent Control Center (placeholder)
- Admin-only.
- See Section 14.

### 5.13 Admin Panel
- Manage users (create, deactivate, reset password, change role and department).
- Manage departments (rename, but the four canonical departments are fixed).
- Manage tags used in communication.
- View Audit Log (cross-system event log).
- Feature flags for unreleased modules (Financial Documents, Agent Control Center).

### 5.14 Settings
- Per-user: display name, password, email, language (English / Hebrew), timezone (default Asia/Jerusalem), notification preferences.

---

## 6. Job Lifecycle

### 6.1 Statuses
- `New` — created, not yet assigned and not yet pushed to hub.
- `Assigned` — admin assigned to a specific employee. Employee has not opened.
- `Available` — pushed to a task hub. Anyone in scope can take it.
- `Taken` — pulled from hub by an employee, work not started.
- `Working on it` — employee actively working.
- `Waiting for client` — paused, blocked on client.
- `Waiting for admin` — paused, blocked on admin decision.
- `Done` — employee says work is complete.
- `Reviewed` — admin reviewed and accepted. Terminal success.
- `Cancelled` — terminal failure or no longer needed.

### 6.2 Allowed transitions

```
New           -> Assigned | Available | Cancelled
Assigned      -> Working on it | Waiting for client | Waiting for admin | Cancelled
Available     -> Taken | Cancelled
Taken         -> Working on it | Waiting for client | Waiting for admin | Cancelled
Working on it -> Done | Waiting for client | Waiting for admin | Cancelled
Waiting for client -> Working on it | Cancelled
Waiting for admin  -> Working on it | Cancelled
Done          -> Reviewed | Working on it (reopened) | Cancelled
Reviewed      -> Working on it (reopened, admin only)
Cancelled     -> (terminal)
```

Reopening from `Done` or `Reviewed` to `Working on it` creates a `reopened = true` event for statistics.

### 6.3 Required fields per status change
Every change writes a `JobStatusEvent` with:
- job_id
- from_status
- to_status
- changed_by (user_id)
- changed_at (timestamp, UTC stored, Asia/Jerusalem displayed)
- note (optional)
- time_spent_minutes (required when entering `Done`)

### 6.4 Required fields when marking Done
- Final summary text (free text, required).
- Time spent in minutes (required).
- Optional attachments.
- Optional flag: "Billable" (yes/no, defaults yes for clients with hourly bank).

### 6.5 SLA and aging
- Each job has a `priority` enum: Low, Normal, High, Urgent.
- SLA target hours per priority are configurable in Admin Panel (suggested defaults: Urgent 4h, High 24h, Normal 72h, Low 168h).
- A job is "delayed" if elapsed time since `Assigned` or `Taken` exceeds its SLA target and status is not in a terminal state.

---

## 7. Task Hub Lifecycle

### 7.1 Hubs
- Global Task Hub
- Helpdesk Task Hub
- IT Task Hub
- R&D Task Hub

### 7.2 Lifecycle
- Admin creates a job with no `assigned_employee` and selects "Send to hub" with a department choice.
- Job status becomes `Available` and `department` matches the hub.
- Eligible employees see it. They can "Take task."
- Taking writes a `JobStatusEvent` (Available → Taken), sets `assigned_employee`, sets `assigned_timestamp` and `taken_timestamp`.
- Subsequent flow follows Section 6.

### 7.3 Concurrency
- Take action uses optimistic concurrency. The DB write is conditional on `status = 'Available'`. If two employees click at the same time, the loser sees "Already taken."

### 7.4 Visibility rules
- Global hub: everyone.
- Helpdesk hub: Helpdesk employees and admins only.
- IT hub: IT employees and admins only.
- R&D hub: R&D employees and admins only.

---

## 8. Communication System Design

### 8.1 Channels
Four canonical channels. Channel and Department share a 1:1 mapping where applicable, plus the Global channel.

### 8.2 Posts and Replies
- `CommunicationPost`: id, channel_id, author_id, title, body (markdown allowed), tags, related_job_id (nullable), related_client_id (nullable), attachments, created_at, updated_at, pinned (admin only), resolved (boolean, set when the conversation is closed).
- `CommunicationReply`: id, post_id, author_id, body, attachments, created_at.

### 8.3 Tags
Initial closed list (editable in Admin Panel):
- Urgent
- Client issue
- Technical note
- Internal update
- Needs admin
- Solved
- Follow-up required

### 8.4 Search
- Full-text on title and body.
- Filter by tag, author, channel, date range, related client, related job, resolved/unresolved.

### 8.5 Notifications (later phase)
- @mention triggers in-app notification.
- "Needs admin" tag triggers admin notification.
- Job-linked post change can notify the job assignee.

---

## 9. Client Management Model

### 9.1 Client fields
- client_id (UUID)
- company_name (string, required)
- contact_person (string)
- email (string)
- phone (string)
- address (string, multi-line)
- israeli_tax_id (string, 9 digits typically; treated as a placeholder until verified). See Section 12 note.
- status: Active / Inactive
- notes (long text, admin-private)
- created_at, updated_at, created_by

### 9.2 Linked records (read sides on the Client detail view)
- linked_jobs (1:N to Job)
- linked_payments (1:N to Payment)
- linked_receipts (1:N to ReceiptDocument)
- monthly_billing (0..N MonthlyBillingItem)
- hourly_banks (0..N HourlyBank)
- one_time_charges (0..N OneTimeJobCharge)

### 9.3 Client list
Status: "Needs user-provided client list." Production data should not be invented. Seed data can use placeholder names (Client A, Client B, Client C) until the user supplies the real list.

---

## 10. Billing Model

A client has a `BillingAccount` (1:1). Under it, three independent categories.

### 10.1 Monthly payment
Fields:
- service_name (e.g., "Managed IT Operations")
- price_amount_placeholder (number, currency)
- currency (default ILS)
- billing_cycle (Monthly only for MVP; Quarterly and Yearly later)
- start_date
- end_date (nullable)
- status: Active, Paused, Cancelled, None
- last_billed_period (YYYY-MM)
- next_due_date
- For each billed period, a `Payment` record is generated with `status` workflow per Section 10.5.

If a client has no monthly plan, the section shows "None."

### 10.2 Hourly bank
Fields:
- total_hours_purchased_placeholder
- price_per_hour_placeholder
- total_payment_placeholder (computed or stored)
- hours_used (derived from completed jobs marked billable against this bank)
- hours_remaining (computed)
- purchase_date
- expiry_date (nullable)
- status: Active, Used up, None
- A `HourlyBankUsage` row is written each time a job marks time against the bank.

If a client has no hourly bank, the section shows "None."

### 10.3 One-time job payment
Fields:
- linked_job_id
- job_name (snapshot)
- price_amount_placeholder
- currency
- payment_status (see 10.5)
- date_created
- date_paid (nullable)
- linked_receipt_id (nullable)

A job can have at most one OneTimeJobCharge.

### 10.4 Payment record
Unified `Payment` entity that all three categories reference. Why: simplifies the receipt and tax-document linkage.

Fields:
- payment_id
- client_id
- source_type: Monthly, HourlyBank, OneTime
- source_id (FK depends on source_type)
- amount_placeholder
- currency
- issued_date
- due_date
- paid_date (nullable)
- status (see 10.5)
- method (Bank transfer, Bit, Cheque, Cash, Credit card, Other) when paid
- reference (asmachta number when paid)
- linked_receipt_id (nullable)
- notes

### 10.5 Payment status enum
- Draft
- Sent to client
- Waiting for payment
- Partially paid
- Paid
- Cancelled
- Overdue

`Overdue` is derived where possible: `due_date < today AND status NOT IN (Paid, Cancelled)`. It can also be set manually.

### 10.6 Paid-payment workflow
1. Admin opens Payment row.
2. Clicks "Mark as Paid."
3. Modal asks for paid_date, method, reference, optional note.
4. Modal shows checkbox: "Create receipt / tax document."
5. On submit:
   - Payment is updated to Paid.
   - `JobStatusEvent`-style audit row is written into AuditLog.
   - If checkbox is set, navigate to Receipts create flow with payment pre-loaded.

---

## 11. Receipt / Invoice / Tax Document Workflow

### 11.1 Supported types

| Type | Hebrew name (likely) | When used (informal) |
|---|---|---|
| Invoice | חשבון עסקה | Demand for payment before payment is received |
| Receipt | קבלה | Confirmation of payment received |
| Tax Invoice | חשבונית מס | VAT document, often paired with receipt |
| Tax Invoice / Receipt | חשבונית מס קבלה | Combined VAT-and-receipt, common for SMB IT services |
| Credit Note | חשבונית זיכוי | Refund or correction |
| Proforma Invoice | חשבון עסקה (פרופורמה) / הצעת מחיר | Quote before commitment |

All terminology and usage rules are tentative. Confirm with the company accountant before launch.

### 11.2 Document fields (planned, placeholder template)
- company_details (Skyware IT LTD, address, Israeli company number, VAT number)
- client_details (snapshot at issue time)
- document_number (sequential per type, per year, immutable once finalized)
- issue_date
- payment_date (when applicable)
- description_lines (1..N): description, quantity, unit_price, subtotal
- amount_before_vat
- vat_rate (default placeholder, currently 18 percent in Israel as of 2026 but needs verification each fiscal year)
- vat_amount
- total_amount
- payment_method (when applicable)
- reference / asmachta (when applicable)
- currency
- notes
- signature_or_stamp_placeholder
- language: Hebrew, English, or both

### 11.3 Numbering
Each document type has its own sequence. Skipping or reusing numbers is not allowed once finalized. Drafts are not numbered.

### 11.4 Creation flow
1. Admin clicks "Create receipt / tax document" (from Billing flow or Receipts page).
2. Picks document type.
3. Picks client (auto-filled from source payment if available).
4. Picks source payment (optional but recommended).
5. Edits description lines (defaults from source).
6. Reviews VAT, total.
7. Picks language.
8. Save as Draft. Drafts are editable.
9. Click "Finalize." This:
   - Assigns the next document_number.
   - Locks the document for edit.
   - Generates a PDF placeholder (template can be added later; MVP can ship without a PDF and only render an HTML view).
10. Document is now linked back to the payment and visible on the client detail page.

### 11.5 Immutability and corrections
After finalize, the document cannot be edited. Corrections are issued via Credit Note plus a new corrected document. This matches standard Israeli accounting practice (verification needed).

---

## 12. Israeli Document Compliance Notes and Verification Needs

The following statements are research-level and require accountant or legal verification before production launch. Treat them as cautious working assumptions, not legal advice.

### 12.1 Likely-required elements on tax documents
- The exact Hebrew document title (e.g., חשבונית מס, קבלה, חשבונית מס קבלה).
- The Israeli company number (ח.פ. for limited companies) of Skyware IT LTD.
- The VAT registration number (עוסק מורשה / חברה בע"מ — likely same as company number for a Ltd., needs verification).
- A unique sequential document number per type.
- Issue date in DD/MM/YYYY format (typical in Israel).
- Client name and Israeli tax ID if the client is a business.
- Description of goods/services.
- Amount before VAT, VAT amount, VAT rate, total amount.
- Currency (ILS by default; foreign-currency invoices have additional rules).
- For receipts: payment method and reference/asmachta number.
- For digital signing (חתימה דיגיטלית): if Skyware uses Israel Tax Authority digital signature requirements, signed documents must be produced through a certified mechanism. Needs accountant/legal verification.

### 12.2 VAT rate
- As of 2026, Israeli VAT rate is widely cited as 18 percent. This is a placeholder and must be re-verified at issuance time. The system stores `vat_rate` as a field per document so historical documents remain correct if the rate changes.

### 12.3 Allocation numbers (מספרי הקצאה)
- The Israel Tax Authority has been rolling out an "allocation number" requirement for tax invoices above a certain amount (the threshold has been decreasing year over year). Tax invoices above the threshold may be invalid for VAT deduction by the recipient without an allocation number obtained from the Tax Authority API. Status as of 2026: needs accountant verification and an integration plan if applicable.
- The data model leaves room: `ReceiptDocument.allocation_number` (nullable string), `allocation_status` enum (Not required, Pending, Issued, Failed), `allocation_obtained_at` (nullable timestamp).

### 12.4 Hebrew and bilingual formatting
- Hebrew is RTL. The document template must support RTL layout.
- Bilingual mode (Hebrew above, English below, or side by side) is acceptable in many cases. The accountant should confirm whether the Hebrew version is the legally binding one and whether the English version needs a disclaimer.

### 12.5 Storage and retention
- Israeli tax law commonly requires retention of accounting documents for several years (often 7 years; needs accountant verification). The Financial Documents module is designed with long-term retention in mind. Hard-delete is disallowed for finalized documents; only logical archival is permitted.

### 12.6 Disclaimer for the MVP
The MVP can ship the data model and the "draft" view of these documents. Final templates, numbering, and any required integration with Israel Tax Authority APIs (allocation numbers, digital signing) must be designed with an Israeli accountant before any document is issued to a real client.

---

## 13. Future Financial Document Ingestion Design

### 13.1 Purpose
Read inbound business emails, classify them, extract structured data, and link them to clients, jobs, and payments inside the portal.

### 13.2 Sources to ingest
- Client payment confirmations (bank notifications, payment provider receipts)
- Bank transfer confirmations
- Supplier invoices
- Supplier receipts
- Company expense receipts
- Subscription invoices
- Tax documents from authorities
- Generic attachments (PDF, image) attached to inbound mail

### 13.3 Pipeline (planned)
1. Email connector reads a dedicated mailbox (e.g., `inbox@skyware-it.com` or a forwarder).
2. Each message becomes a `RawEmail` record with headers, body, attachments stored in object storage.
3. Classifier (LLM-assisted, deterministic fallback) tags the message with a `FinancialDocument.type` candidate.
4. Extractor produces structured fields (date, amount, currency, vendor, document number, VAT amount if present).
5. Linker proposes matches against existing Client, Job, and Payment records by name, amount, and date heuristics.
6. The document lands in the Financial Documents page with status `Needs review`.
7. Admin reviews, accepts or corrects links, marks as `Reviewed`.

### 13.4 Page design (admin-only)
- Filters: client, supplier, date range, payment status, document type, source mailbox, reviewed/unreviewed.
- Search across extracted fields and OCR text.
- Row actions:
  - Open original email (raw view).
  - Open extracted document (PDF/image preview).
  - Link to client.
  - Link to job.
  - Link to payment.
  - Mark as reviewed.
  - Mark as not relevant (archive).
- Bulk actions: archive, mark reviewed, reassign client.

### 13.5 Data model notes
- `FinancialDocument` is independent from `ReceiptDocument`. ReceiptDocument is something Skyware issues. FinancialDocument is something Skyware receives or imports.
- They can reference each other via `linked_receipt_id` for cases where an inbound payment confirmation matches a Skyware-issued receipt.

### 13.6 Privacy and access
- Mailbox content can contain sensitive financial data.
- Only CEO and CTO see the Financial Documents page.
- Audit log records every open, link, and edit.

---

## 14. Agent Control Center Placeholder Design

### 14.1 Page purpose
Admins see a single page that, in the future, will host an internal automation agent. For MVP, this is a structured placeholder with no live actions.

### 14.2 Sections on the placeholder page
- Header: "Agent Control Center" with status badge.
- Status field: Offline / Testing / Active. Default: Offline.
- Planned capabilities (read-only list, sourced from this spec).
- Permissions placeholder: a read-only matrix that lists what the agent will be allowed to do (e.g., "Read mailbox: planned," "Draft jobs from emails: planned," "Send messages: not planned").
- Tasks handled by agent: empty table with columns (timestamp, action, target, outcome).
- Logs placeholder: empty list view with filter controls grayed out.
- Admin controls placeholder: Start, Pause, Stop buttons disabled with tooltip "Available when agent is provisioned."
- Future integration notes: free-text panel that admins can edit (so the CTO can keep design notes here).

### 14.3 Planned capabilities (forward-looking, not promised)
- Monitor a dedicated mailbox.
- Detect client payment confirmations and propose payment-paid updates.
- Read supplier receipts and produce draft FinancialDocument rows.
- Create draft jobs from inbound client emails (subject and body summarization).
- Notify admins about urgent flags (e.g., emails containing "outage," "critical," "down").
- Suggest billing updates (e.g., "Client X has had 8 jobs this month without a monthly plan").
- Summarize internal activity (weekly digest).
- Detect repeated technical issues across clients (signal for productization).
- Generate operational reports (weekly, monthly).

### 14.4 Trust boundary
Default agent behavior is propose-only. Every agent action lands as a draft for admin review unless an explicit autonomy setting is enabled per capability.

---

## 15. Employee Statistics Design

### 15.1 Framing
This page is dual-purpose. Half the metrics evaluate individuals. The other half evaluate the business. Admins should be encouraged to read both together. The page header includes a short paragraph that names this explicitly so the page is not perceived as pure employee surveillance.

### 15.2 Per-employee metrics
- Total jobs completed
- Total hours reported
- Average completion time per priority
- Jobs by department breakdown (relevant when an employee handles cross-department work)
- Jobs by client breakdown
- Currently active jobs
- Delayed jobs (count past SLA)
- Median response time (assigned → first status change)
- Tasks taken from hub
- Tasks assigned by admin
- Reopened jobs (count and percent of completed)
- Weekly activity sparkline
- Monthly activity bar chart

### 15.3 Business / operational metrics
- Workload distribution: hours per employee, jobs per employee. Identifies overloaded employees.
- High-effort clients: clients ranked by hours consumed vs. revenue placeholder. Identifies underpriced clients.
- Recurring issue clusters: jobs with similar titles or tags repeated. Signals automation opportunities and productization candidates.
- Departments under pressure: jobs per department vs. capacity. Signals staffing needs.
- Hub vs. assignment ratio: how much work flowed through hub self-take vs. admin assignment. Signals process maturity.
- Average time-to-take in hubs. Long times suggest scope ambiguity or wrong department routing.

### 15.4 Filters
- Employee (multi-select)
- Department (multi-select)
- Client (multi-select)
- Job type / tag (multi-select)
- Date range (custom)
- Status (multi-select)
- Week or Month bucketing

### 15.5 Export
- CSV export of any filtered view (admin only).

---

## 16. Suggested Database Entities

High-level list. Full field definitions in `internal-management-portal-data-model.md`.

- User
- Department
- Role
- Client
- Job
- JobStatusEvent
- WorkReport
- TaskHubItem (logical view; can be a query over Job rather than a table)
- CommunicationChannel
- CommunicationPost
- CommunicationReply
- BillingAccount
- MonthlyBillingItem
- HourlyBank
- HourlyBankUsage
- OneTimeJobCharge
- Payment
- ReceiptDocument
- FinancialDocument (future)
- AgentLog (future)
- AuditLog
- Attachment (generic)
- Tag (for communication and jobs)
- Notification (later phase)

---

## 17. Suggested Relationships

- User belongs_to Department, has Role.
- Client has_one BillingAccount.
- BillingAccount has_many MonthlyBillingItem, HourlyBank, OneTimeJobCharge.
- Job belongs_to Client (nullable for internal jobs), belongs_to Department, optionally assigned_to User.
- Job has_many JobStatusEvent.
- Job has_one WorkReport (the final summary).
- Job optionally has_one OneTimeJobCharge.
- Job optionally has_many HourlyBankUsage rows (per work segment).
- Payment belongs_to Client, optionally references MonthlyBillingItem, HourlyBank, OneTimeJobCharge (one of).
- ReceiptDocument belongs_to Client, optionally belongs_to Payment.
- FinancialDocument optionally belongs_to Client, optionally belongs_to Job, optionally belongs_to Payment.
- CommunicationPost belongs_to CommunicationChannel, has_many CommunicationReply, optionally belongs_to Job, optionally belongs_to Client.
- AuditLog references any entity polymorphically (entity_type, entity_id).
- AgentLog references the proposed entity action target polymorphically.

---

## 18. MVP Scope

MVP is the smallest version that lets Skyware actually run jobs through the portal.

In scope for MVP:
- Auth and user management (admin can create users, assign role and department).
- Departments fixed at Helpdesk, IT, R&D, plus the Global pseudo-department.
- Jobs: full lifecycle, statuses, status events, time spent, final summary.
- Task Hub for all four scopes.
- My Jobs, Department Jobs, Global Jobs pages.
- Communication: posts, replies, tags, attachments, search.
- Clients: CRUD, tabs for overview, jobs, billing, notes.
- Billing: Monthly, HourlyBank, OneTimeJob, Payment with status workflow.
- Paid-payment workflow with the "create receipt" checkbox.
- Receipts / Tax Documents: draft and finalize flow for at least Tax Invoice / Receipt (חשבונית מס קבלה) and Receipt (קבלה). Real templates and PDF rendering can be placeholder.
- Employee Statistics page (admin) plus self-stats widgets on employee Dashboard.
- Audit log writing on all critical mutations.
- Hebrew/English UI scaffold and timezone handling (Asia/Jerusalem display).

Out of MVP scope (clearly stubbed in nav):
- Financial Documents ingestion module (page exists with empty state).
- Agent Control Center (placeholder page only).
- PDF rendering of receipts (HTML view is sufficient for MVP if the accountant agrees).
- Israel Tax Authority allocation number integration.
- In-app notifications and @mentions.
- External integrations (email, calendar, accounting).

---

## 19. Later-Phase Features

Phase 2 (after MVP stabilization):
- PDF templates for all six document types, in Hebrew and bilingual.
- @mentions and in-app notifications.
- Calendar view of jobs.
- SLA alerting.
- Recurring jobs (e.g., monthly maintenance jobs auto-generated for clients with monthly plans).

Phase 3:
- Financial Documents ingestion.
- Integration with email provider (Gmail or Microsoft Graph).
- OCR pipeline for PDFs and images.
- Heuristic linker between FinancialDocument and existing Client/Job/Payment records.

Phase 4:
- Agent Control Center is activated.
- Initial agent capabilities: payment-confirmation detection, supplier-receipt drafts, urgent-email alerts.
- Propose-only mode. No autonomous writes to client-visible records.

Phase 5:
- Israel Tax Authority allocation number integration (subject to legal requirement and accountant guidance).
- Digital signature on finalized tax documents.
- Cross-client trend analytics and productization signals.

---

## 20. Open Questions for the User

The following information is required before MVP build can start. Each gap is also flagged inline in the spec.

1. Client list: real client names, contact details, current monthly plans, and current hourly banks. Currently "Needs user-provided client list."
2. Employee list: names, emails, departments, who is admin (CEO and CTO confirmed by role list; need actual user identities).
3. Default SLA values per priority (Urgent / High / Normal / Low).
4. Default monthly plan price tiers (placeholder for now).
5. Default hourly bank tiers (placeholder for now).
6. Confirm Skyware IT LTD legal details: full Hebrew name, company number (ח.פ.), VAT number, registered address.
7. Confirm which Israeli document types Skyware actually issues today. Some companies skip Invoice and use Tax Invoice / Receipt only.
8. Confirm current Israeli VAT rate at launch date and how the company wants to handle future rate changes.
9. Confirm allocation-number (מספרי הקצאה) status and threshold for the launch year.
10. Confirm digital signature requirement and whether a certified provider is already in use.
11. Confirm preferred language defaults per role (Hebrew or English) and whether all employees are bilingual.
12. Confirm whether the portal should be hosted in-Israel for data residency reasons.
13. Confirm whether existing Skyware mailbox (info@skyware-it.com) or a dedicated mailbox is the ingestion target for the future Financial Documents module.
14. Confirm whether the Agent Control Center will be CTO-only or shared with CEO.
15. Decide: should employees see their own statistics page (read-only), or only see widgets on the Dashboard?

---

## 21. Implementation Phases

### Phase 0 — Foundation (1 to 2 weeks of design and setup)
- Set up the new repository (separate from `skyware-com`).
- Decide stack. Suggested: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui to match the existing site's vocabulary; Postgres for storage; Prisma or Drizzle for ORM; NextAuth or a similar adapter for auth; S3-compatible object storage for attachments. Final stack must be confirmed before coding.
- Define environment, secrets, CI.
- Lock the data model from `internal-management-portal-data-model.md`.

### Phase 1 — Core MVP (jobs and people)
- Auth, users, roles, departments.
- Jobs full lifecycle.
- Task Hub.
- My Jobs, Department Jobs, Global Jobs.
- Dashboard (employee + admin variants, minimal).
- Audit log infrastructure.

### Phase 2 — Communication
- Channels, posts, replies, tags, attachments, search.
- Linking posts to jobs and clients.

### Phase 3 — Clients and Billing
- Clients CRUD.
- BillingAccount, MonthlyBillingItem, HourlyBank, OneTimeJobCharge.
- Payment entity and status workflow.
- Paid-payment modal with "Create receipt" handoff.

### Phase 4 — Receipts / Tax Documents (draft level)
- ReceiptDocument entity with all types.
- Draft and finalize flow.
- HTML view of finalized documents.
- Numbering sequences.
- Verified Israeli compliance hold-points (do not issue real documents without accountant sign-off).

### Phase 5 — Statistics and polish
- Employee Statistics page with all metrics in Section 15.
- Filters, CSV export.
- Performance and pagination.

### Phase 6 — Financial Documents (placeholder page only in MVP)
- Empty-state page with the planned-feature copy.
- Implementation deferred to Phase 7 or later.

### Phase 7 — Financial Documents (real)
- Email connector.
- RawEmail storage.
- Classifier and extractor.
- Linker.
- Review UI.

### Phase 8 — Agent Control Center (real)
- Activate from placeholder.
- Initial capabilities in propose-only mode.
- Logging and admin controls.

### Phase 9 — Compliance hardening
- PDF generation with proper Hebrew templates.
- Allocation number integration if required.
- Digital signature if required.
- Long-term retention policy.

---

## Appendix A — Terminology

- Job: a single unit of work for an employee. Bound to a client where relevant.
- Task Hub: the queue of `Available` jobs in a given department.
- Department: one of Helpdesk, IT, R&D, or Global.
- Billing item: a MonthlyBillingItem, HourlyBank, or OneTimeJobCharge.
- Payment: the realized money movement, tied to a billing item.
- Receipt / Tax Document: an outbound document Skyware issues.
- Financial Document: an inbound document Skyware receives.
- Asmachta: Hebrew term for the payment reference number on bank transfers.
- ח.פ.: Hebrew abbreviation for "חברה פרטית" company number.
- חשבונית מס: tax invoice. Common Israeli document.
- חשבונית מס קבלה: combined tax-invoice-and-receipt. Common for SMB IT services.
- קבלה: receipt confirming payment.
- חשבון עסקה: invoice or business invoice (pre-payment, no VAT-deduction power on its own).
- חשבונית זיכוי: credit note.

---

## Appendix B — Sources and Provenance

Information derived from this repository:
- None. The `Skyware-management` repository is currently empty other than this docs folder and `.claude` configuration.

Information derived from the sibling `skyware-com` repository (`/Users/jeries/Desktop/projects/skyware-com/skyware-site/`):
- Company name: Skyware IT LTD.
- Brand tagline and voice from `src/app/page.tsx` and `src/app/layout.tsx`.
- Service taxonomy from `src/lib/skyware-services.ts`.
- Contact details from `src/app/layout.tsx`.
- Stack hints from `package.json` and Next.js layout.

All Israeli compliance statements are research-level and explicitly flagged "Needs accountant/legal verification."
