# Skyware Internal Management Portal — MVP Plan

Version: 0.1 (planning draft)
Date: 2026-05-15
Status: Specification only.

This document is the build order, the risk register, and the validation checklist for the internal management portal. It pairs with `internal-management-portal-spec.md` and `internal-management-portal-data-model.md`.

---

## 1. Recommended MVP

The MVP is the smallest version that lets Skyware actually run real client jobs through the portal and produce internal-only payment-document drafts. It deliberately stops short of issuing real Israeli tax documents to clients.

### MVP includes
- Authenticated portal for the five canonical user types (Helpdesk, IT, R&D, CEO, CTO).
- Job lifecycle with full status history and time tracking.
- Task Hub for all four scopes (Global, Helpdesk, IT, R&D).
- My Jobs, Department Jobs, Global Jobs pages.
- Communication: four channels, posts, replies, tags, attachments, search.
- Clients: CRUD with overview, jobs, billing, notes tabs.
- Billing: MonthlyBillingItem, HourlyBank, OneTimeJobCharge, and Payment with status workflow.
- Paid-payment workflow with the "Create receipt / tax document" handoff.
- Receipts / Tax Documents: draft and finalize flow with HTML view only. At minimum these types: Tax Invoice / Receipt (חשבונית מס קבלה) and Receipt (קבלה). Drafts can be created but NOT sent to real clients until accountant verification.
- Employee Statistics page (admin) plus self-stats widgets on Dashboard.
- Audit log writing on every critical mutation.
- Bilingual UI scaffold (English + Hebrew) with RTL support for Hebrew.

### MVP explicitly excludes
- Real outbound PDF documents to clients.
- Israel Tax Authority allocation number integration.
- Digital signature integration.
- Financial Documents ingestion module (page is shipped as a placeholder only).
- Agent Control Center (page is shipped as a placeholder only).
- In-app notifications and @mentions.
- Email, calendar, or accounting integrations.
- Recurring job auto-generation.

---

## 2. What to Build First

Sequenced by dependency, not by glamour. Each step is intended to be its own merge.

1. Repository, stack, CI, lint, format, environment management.
2. Database connection, migrations tooling, seed loader.
3. Auth: login, password hashing, sessions, password reset (admin-triggered for MVP is acceptable).
4. User, Department, Role, seed data.
5. Sidebar layout, role-gated navigation, language toggle, theme.
6. Client CRUD (admin-only).
7. BillingAccount auto-create on client create.
8. Job entity, JobStatusEvent, WorkReport.
9. Job creation (admin), assignment, status transitions, take-from-hub flow.
10. My Jobs, Department Jobs, Global Jobs, Task Hub pages.
11. Communication channels, posts, replies, tags, search.
12. MonthlyBillingItem, HourlyBank, OneTimeJobCharge.
13. Payment with full status workflow, mark-paid modal.
14. Receipts page, draft creation, finalize with numbering sequence, HTML view.
15. Employee Statistics page (admin) and Dashboard self-stat widgets.
16. Audit log middleware on every mutating endpoint.
17. Placeholder pages: Financial Documents and Agent Control Center.
18. Admin Panel (user management, tag management, audit log viewer).
19. Settings.
20. Production hardening (rate limiting, security headers, backups).

---

## 3. What to Postpone

Anything that blocks shipping or that depends on legal verification.

- Real tax-document issuance to real clients. Drafts only until accountant signs off on templates, numbering, and any Tax Authority API integration.
- PDF rendering with proper Hebrew typography. HTML view first; PDF when the template is finalized and the accountant approves.
- Allocation number (מספרי הקצאה) integration. Build the data fields now, integration later.
- Digital signature integration. Same reasoning.
- @mentions and in-app notifications. Pleasant but not critical. Phase 2.
- Calendar view of jobs. Phase 2.
- SLA alerting. Phase 2.
- Recurring job auto-generation tied to MonthlyBillingItem. Phase 2.
- Financial Documents ingestion. Phase 3+. Page stays as a placeholder.
- Agent Control Center activation. Phase 4+. Page stays as a placeholder.
- Israel Tax Authority API integrations. Phase 5+ pending legal direction.

---

## 4. Suggested Implementation Order

Mapped to working weeks. Indicative only. Real estimates depend on the chosen stack and team size.

### Phase 0 — Foundation (Week 0 to Week 1)
- Decide stack with the user. Default suggestion: Next.js App Router, TypeScript, Tailwind, shadcn/ui, Postgres, Prisma (or Drizzle), Auth.js (NextAuth) or Lucia, S3-compatible storage. The data model and routes assume this kind of stack but are framework-agnostic.
- New repository created (separate from `skyware-com`).
- Local Postgres or hosted dev DB.
- CI: lint, type-check, test, build.
- Decide hosting: in-Israel hosting may be desirable for client data residency. Open question.

### Phase 1 — Core MVP (Weeks 1 to 4)
- Auth, users, roles, departments.
- Job lifecycle and Task Hub.
- My Jobs, Department Jobs, Global Jobs.
- Minimal Dashboard.
- Audit log scaffold.

### Phase 2 — Communication (Week 5)
- Channels, posts, replies, tags, attachments, search.
- Linking posts to jobs and clients.

### Phase 3 — Clients and Billing (Weeks 6 to 7)
- Clients CRUD.
- BillingAccount, MonthlyBillingItem, HourlyBank, OneTimeJobCharge.
- Payment entity and status workflow.
- Mark-paid modal with "Create receipt" handoff.

### Phase 4 — Receipts / Tax Documents (Week 8)
- ReceiptDocument with all six types.
- Draft and finalize flow.
- HTML view of finalized documents.
- Numbering sequences (per type, per year).
- Compliance hold-points clearly labeled in the UI.

### Phase 5 — Statistics and polish (Week 9)
- Statistics page with metrics from spec Section 15.
- Filters, CSV export.
- Performance tuning, pagination.

### Phase 6 — Placeholder pages and Admin Panel (Week 10)
- Financial Documents placeholder.
- Agent Control Center placeholder.
- Admin Panel: user management, tag management, audit log viewer.
- Settings page.

### Phase 7 — Hardening and pilot (Week 11)
- Rate limiting.
- Security headers (CSP, HSTS).
- Backup and restore drill.
- Internal pilot with the actual Skyware team.

### Phase 8 onward — see spec Sections 19 and 21.

---

## 5. Risks

### 5.1 Compliance risks (high)
- Issuing Israeli tax documents without accountant sign-off can produce legally invalid documents.
  - Mitigation: ship as drafts only. Add a banner on every document: "Not for issuance until verified." Block the finalize flow with a feature flag until accountant approves.
- VAT rate hard-coded incorrectly.
  - Mitigation: store the VAT rate per document. Admin Panel field for current default. Re-verify each fiscal year.
- Allocation-number requirement may apply at launch.
  - Mitigation: data fields exist from day one. Block finalize if `allocation_status = pending` once integration is built.
- Tax document numbering gaps.
  - Mitigation: use SELECT FOR UPDATE on the numbering sequence row. Drafts are not numbered.

### 5.2 Operational risks (medium)
- Concurrent "Take task" race conditions.
  - Mitigation: conditional update `WHERE status = 'available'`.
- Over-eager status changes by employees on someone else's job.
  - Mitigation: API checks `assigned_employee_id = current_user_id` for non-admin actions.
- Audit log growth.
  - Mitigation: append-only table with monthly partitioning if Postgres; cold-storage archival after 1 year.

### 5.3 Product risks (medium)
- Statistics page misread as surveillance.
  - Mitigation: dual framing in the UI header (per spec Section 15). Include business-side metrics in the same view, not as a separate page.
- Communication channels turning into noise.
  - Mitigation: tag taxonomy is small and curated. Pinned posts. Search-first design. Resolved-state on posts.
- Hub abandonment (no one takes tasks).
  - Mitigation: Dashboard shows hub items prominently. Admin can revert a hub item back to direct assignment.

### 5.4 Technical risks (low to medium)
- Hebrew RTL bugs in mixed content.
  - Mitigation: use `dir="auto"` on user-generated content blocks. QA pass with Hebrew-only and bilingual inputs before release.
- Attachment storage cost growth.
  - Mitigation: max upload size per file, total per job, total per post. Configurable in Admin Panel.
- Single-tenant database growing.
  - Mitigation: standard Postgres indexes per spec Section 8. No multi-tenant complications, the portal is internal to Skyware.

### 5.5 Privacy and security risks (high)
- Financial Documents may contain bank statements, supplier invoices, sensitive PII.
  - Mitigation: admin-only access. Audit log every open. Encrypted at rest.
- Email mailbox ingestion will require a service account or OAuth token.
  - Mitigation: store credentials in a secret manager, never in DB. CTO-only access to credential rotation.
- Receipt documents are legally sensitive.
  - Mitigation: finalized documents are immutable. Corrections via Credit Note only. Cancellation of a paid Payment is allowed only with an admin-with-reason flow recorded in AuditLog.

---

## 6. Validation Checklist

Before declaring MVP complete, every item below must pass.

### 6.1 Functional
- [ ] An employee can log in with username and password.
- [ ] An employee sees only their department's jobs plus their own plus Global.
- [ ] An employee cannot read another department's jobs via direct URL or API.
- [ ] An admin can create a job, assign to an employee, and the employee sees it.
- [ ] An admin can push a job to a hub and an eligible employee can take it.
- [ ] Concurrent take attempts produce one winner and one "already taken" message.
- [ ] An employee can transition: Assigned → Working on it → Done with WorkReport.
- [ ] An admin can mark Done → Reviewed.
- [ ] Status timeline reflects all transitions with correct actor and timestamp.
- [ ] An employee can post in Global and in their own department channel.
- [ ] An employee cannot post in another department channel.
- [ ] Communication search returns expected results across title, body, and tags.
- [ ] Admin can create a Client with monthly, hourly bank, and one-time charge configurations.
- [ ] Admin can mark a Payment as Paid with method and reference.
- [ ] Marking Paid with "Create receipt" checked navigates to draft creation pre-filled.
- [ ] Admin can finalize a ReceiptDocument and receives a monotonic number per type per year.
- [ ] Finalized ReceiptDocuments are not editable.
- [ ] Statistics page returns correct counts for a known seeded scenario.
- [ ] Audit log records actor, action, entity, diff for every critical mutation.

### 6.2 Permission and security
- [ ] Every non-admin API endpoint enforces department or assignee scope server-side.
- [ ] Admin-only routes return 403 to employees, not 404 leaks.
- [ ] Passwords are hashed with a vetted algorithm (bcrypt or argon2).
- [ ] Sessions invalidate on logout and on password reset.
- [ ] Rate limit on login and on password reset endpoints.
- [ ] Security headers configured: CSP, HSTS, X-Content-Type-Options, X-Frame-Options or frame-ancestors.
- [ ] HTTPS enforced.

### 6.3 Compliance (MVP-level hold)
- [ ] Every ReceiptDocument view shows the "Not for issuance until verified" banner until accountant sign-off.
- [ ] Numbering sequence guarantees uniqueness and no gaps after finalize.
- [ ] VAT rate stored per document, not hard-coded.
- [ ] Hebrew document title appears in Hebrew on Hebrew-language documents.
- [ ] Israeli company number and VAT number fields present (filled by admin in Settings).
- [ ] Audit log retains records for at least the configured retention period.

### 6.4 UX
- [ ] Hebrew UI renders RTL correctly across all pages.
- [ ] Bilingual labels appear where seeded.
- [ ] Timezone shown is Asia/Jerusalem regardless of viewer location.
- [ ] Dashboard widgets load in under 1 second on seeded data.
- [ ] Empty states have meaningful copy, not blank panels.
- [ ] Job detail page renders the full timeline.

### 6.5 Operational
- [ ] Database backups are automated and a restore drill has been completed.
- [ ] Logs capture errors with request IDs.
- [ ] An error in one mutation does not corrupt the audit log; audit writes are part of the same transaction or saga.
- [ ] CSV export works for the Statistics page.

---

## 7. Future Expansion Checklist

This is the running list of things to revisit after MVP, organized to make later prompts and PRs easy to scope.

### 7.1 Compliance and documents
- [ ] Accountant sign-off on document templates per type.
- [ ] Hebrew PDF rendering for finalized documents.
- [ ] Israel Tax Authority allocation number integration.
- [ ] Digital signature integration where required.
- [ ] Credit Note workflow with full UX and linkage to the original document.
- [ ] Foreign-currency document support.

### 7.2 Communication
- [ ] @mentions and in-app notifications.
- [ ] Email notifications for "Needs admin" or "Urgent" tagged posts.
- [ ] Pinned-posts management UI.
- [ ] Tag management UI with usage stats.

### 7.3 Jobs and billing
- [ ] Recurring jobs tied to MonthlyBillingItem.
- [ ] SLA alerts (in-app and email).
- [ ] Calendar view of jobs.
- [ ] Partial payments with `PaymentInstallment` child table.
- [ ] Multi-currency on a single client.
- [ ] Time clock: optional per-segment timer attached to a job (so time is recorded continuously, not estimated at Done).

### 7.4 Financial Documents ingestion (Phase 7)
- [ ] Email connector (Gmail or Microsoft Graph).
- [ ] RawEmail storage with attachment indexing.
- [ ] Classifier and extractor pipeline.
- [ ] Linker UI for review and acceptance.
- [ ] OCR for image attachments.
- [ ] Search and filter UI per spec Section 13.4.
- [ ] Privacy controls: admin-only, audit log, encrypted storage.

### 7.5 Agent Control Center (Phase 8)
- [ ] Capability registry with per-capability autonomy setting (propose / execute).
- [ ] Agent log viewer with filters.
- [ ] Capability: payment-confirmation detection.
- [ ] Capability: supplier-receipt draft creation.
- [ ] Capability: draft jobs from inbound client emails.
- [ ] Capability: urgent-email alerting.
- [ ] Capability: billing suggestions ("client X used Y hours, no plan").
- [ ] Capability: weekly internal-activity summary.
- [ ] Capability: repeated-issue detection across clients.
- [ ] Capability: operational report generation (weekly, monthly).

### 7.6 Analytics and operations
- [ ] Cross-client productization signals (recurring incident clusters).
- [ ] Pricing review report: hours consumed vs revenue per client.
- [ ] Hub health metrics: take latency, abandonment, manual-assignment fallback rate.
- [ ] Employee fairness metrics: hub-vs-assignment ratio, total hours distribution.

### 7.7 Platform
- [ ] In-app notifications system.
- [ ] Email notifications system (transactional).
- [ ] Mobile-friendly polish (the MVP should be responsive but not native-app-polished).
- [ ] Accessibility audit (WCAG AA target).

---

## 8. Open Questions Linked Back

The following items from the spec block decisions in the MVP plan. Listed here for tracking.

1. Real client list (`Needs user-provided client list.`).
2. Real employee list and email addresses.
3. Skyware IT LTD official Hebrew name, company number, VAT number, registered address.
4. Confirmed Israeli VAT rate at launch.
5. Allocation-number requirement status for the launch year.
6. Digital signature provider (if any) and certificate ownership.
7. Hosting region preference for data residency.
8. Mailbox to ingest for the future Financial Documents module.
9. Default SLA values per priority.
10. Whether CEO and CTO should diverge in any permission (the data model supports it; the MVP treats them identically).

Resolving items 3 to 6 unblocks any real document issuance. Resolving items 1 and 2 unblocks pilot deployment. Other items unblock specific later phases.

---

## 9. Notes for the Implementing Agent

When this spec is later handed to an implementation prompt, the agent should:
- Treat `internal-management-portal-spec.md` as authoritative for behavior.
- Treat `internal-management-portal-data-model.md` as authoritative for schema.
- Treat this file as authoritative for build order and MVP scope.
- Not invent values for any field marked "placeholder" or "Needs user input." Use placeholder values clearly labeled in the UI and seed data.
- Not finalize any ReceiptDocument template as legally valid. Ship the draft view with the verification banner.
- Reuse the visual vocabulary of `skyware-com/skyware-site` (Tailwind plus shadcn/ui, Inter font, the same restrained tone). The internal portal does not need to look like a separate brand.
- Keep modules behind feature flags where the spec marks them placeholder (Financial Documents, Agent Control Center).
- Write audit log entries inside the same transaction as the mutation they describe.

The spec is intentionally larger than the MVP. That is the point. The MVP is the floor; the spec is the long-term shape.
