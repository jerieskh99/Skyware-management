# Final Recommendation

This file collapses every prior file into decisions.

## 1. Add now

The MVP gains 11 additions.
Each is small. Each pays back fast.

1. SLA tracking with breach detection.
2. Severity field on jobs. Separate from priority.
3. Hourly-bank burn-rate visual on client cards.
4. Overdue-payment aging buckets on admin dashboard.
5. Global search bar with scope chips.
6. Saved views on Jobs, Clients, Billing lists.
7. Active time timer on jobs.
8. Manual create-job-from-email form.
9. Notifications scaffold. Three triggers in MVP.
10. Job tags surfaced in UI and lists.
11. Client environment notes lite. Free-text per section.

Why these and not others.
They share three traits.

- Cheap to build.
- Visible to users on day one.
- Each unblocks larger Phase 2 modules.

## 2. Postpone

### 2.1 Phase 2

These are the heavyweight wins.
They require their own scoping.

- Client environment inventory. CMDB lite.
- Credential reference pointers. No secrets.
- Recurring job templates engine.
- Knowledge base from solved jobs.
- Escalation rules engine.
- Client health score.
- CSAT capture after `reviewed`.
- Underpriced-client report.
- Approval workflow.
- Project mode for R&D.
- PDF rendering of receipts.
- SLA pause on `waiting_for_client`.
- Per-client SLA tier overrides.
- 2FA for admins.
- Renewal radar for monthly plans.
- Hourly-bank top-up workflow.
- Discount tracking on payments.
- Burn-rate notifications via email or in-app.

### 2.2 Phase 3 or later

These need foundations that MVP and Phase 2 lay first.

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

## 3. Ignore for now

Saying no protects scope.

- Full client self-service portal.
- ITSM-grade workflow engine.
- Hardware POS asset tracking with serial numbers.
- Slack or Teams replacement.
- General-ledger accounting features.
- Native mobile app.
- Cross-sell recommendation engine before knowledge base exists.

Reject does not mean "never."
It means "not before the validated foundation."

## 4. Remaining questions for the user

The original spec lists 15 open questions.
This pass adds the following.

### 4.1 Operations

- What is the default SLA per priority and per severity at launch.
- Should the SLA pause logic for `waiting_for_client` ship in MVP or Phase 2.
- Should employees see the global statistics page or only their own.

### 4.2 Money and billing

- Default monthly plan tiers in real numbers.
- Default hourly-bank tiers in real numbers.
- Threshold for "low balance." Default 25 percent.
- Threshold for "underpriced." Default 0 percent margin.
- Currency. ILS only at launch, or multi-currency from day one.

### 4.3 Israeli compliance

- Confirm VAT rate at launch.
- Confirm allocation-number applicability and threshold for the launch year.
- Confirm digital signature requirement and provider.
- Confirm which document types Skyware actually issues today.

### 4.4 People and access

- Real list of employees and emails.
- Real list of clients and tax IDs.
- Whether CEO and CTO should diverge in any permission.
- Whether 2FA is mandatory or optional in MVP.

### 4.5 Tools and integrations

- Which vault Skyware uses today. 1Password. Bitwarden. Other.
- Which mailbox is the future ingestion target.
- Whether portal hosting must be in-Israel for data residency.
- Which email provider will the notification system use.

### 4.6 Communication and culture

- Whether the Communication module replaces all internal Slack or Teams chat about clients.
- Whether the "Reviewed by admin" step is hard-required or skippable for low-risk jobs.

### 4.7 Agent

- Will the agent be CTO-only or CEO and CTO.
- What is the autonomy default at activation. Propose-only or limited execute.

## 5. Next suggested Claude prompt

Use the following prompt to start the implementation phase.

```
Build the Skyware Internal Management Portal MVP.

Authoritative sources, in priority order:
- docs/internal-management-portal-spec.md (behavior)
- docs/internal-management-portal-data-model.md (schema)
- docs/internal-management-portal-mvp-plan.md (build order)
- docs/internal-management-portal-enhancement/ (refinements)

Specifically apply the additions in:
- docs/internal-management-portal-enhancement/07-mvp-and-roadmap.md
- docs/internal-management-portal-enhancement/08-data-model-additions.md
- docs/internal-management-portal-enhancement/05-ux-ui-review.md
- docs/internal-management-portal-enhancement/09-ux-wireframe-descriptions.md

Stack:
- Next.js App Router with TypeScript.
- Tailwind plus shadcn/ui to reuse the public site vocabulary.
- Postgres with Prisma or Drizzle.
- Auth via NextAuth or Lucia.
- S3-compatible object storage for attachments.
- Final stack to be confirmed before scaffolding.

Constraints:
- Do not finalize any Israeli tax document until accountant sign-off.
  Block the finalize endpoint behind a feature flag in production.
- Show "Not for issuance until verified" banner on every receipt page.
- Never store real passwords, vault items, or secrets in the portal.
  CredentialReference is a pointer only.
- Audit log every mutating route inside the same transaction.
- Bilingual Hebrew and English from day one. RTL pass each page.
- Asia/Jerusalem display timezone.
- Permission enforcement at the API layer, not only the UI.

MVP scope must include:
- All MVP items in docs/internal-management-portal-mvp-plan.md
- All MVP additions in
  docs/internal-management-portal-enhancement/07-mvp-and-roadmap.md Section 1.2

Out of MVP:
- PDF rendering of receipts.
- Allocation-number integration.
- Digital signature integration.
- Financial Documents activation.
- Agent Control Center activation.

Deliverables for this phase:
- A working dev environment.
- Seed scripts with placeholder clients and users.
- All MVP routes, pages, components, and tests.
- Storybook or page-level harness for the visual library.
- A QA matrix mapped to the validation checklists in
  docs/internal-management-portal-mvp-plan.md and
  docs/internal-management-portal-enhancement/07-mvp-and-roadmap.md.

Do not invent real money values.
Use placeholders. Mark them in UI as placeholder.

If a decision blocks progress, list it for the user.
Do not proceed past a blocking compliance question without sign-off.
```

This prompt is the suggested handoff.
Adjust before running. Confirm stack and start with Phase 0 from the roadmap.

## 6. One paragraph for the CEO

If you read only one paragraph, read this.

The original plan is solid. It captures the work, the money, and the audit trail. This pass adds the parts that make a services company actually run on the portal. Eleven small additions earn their place in the first release. They surface delays before clients see them. They surface running banks before clients run out. They make search and saved views the daily-driver experience. The bigger upgrades, recurring maintenance, knowledge base, CSAT, environment inventory, and client health, are deferred to Phase 2 with clear scoping. The agent is still propose-only. The Israeli tax compliance hold remains until the accountant signs off. None of this changes the original vision. It sharpens it.
