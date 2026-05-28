# Wave 2 Scope Update - Billing Reminders + Client Contact

Project: Skyware Internal Management Portal
Wave: Billing Wave 2 (revised)
Date: 2026-05-28
Owner: Project Manager
Status: Implemented. Awaiting CEO review.

This revises the original Wave 2 (which was Receipts V1) to fold in the
new change request: automated billing reminders, hourly-bank usage
alerts, and manual client contact.

## 1. Change request (verbatim intent)

1. Late-payment reminder rules with admin-first notification + review.
2. Client reminder email (approved or policy-auto after admin notify).
3. Hourly-bank 90% usage alert.
4. Manual client-contact option from Billing.

## 2. What was in scope

- Per-payment lateness rule (days or weeks) + admin-first toggle + optional auto-send window.
- Reminder lifecycle: scheduled -> admin notified (dashboard + email) -> admin decides (approve / delay / cancel / send now) -> client email -> sent / failed.
- Admin reminder review queue.
- Client reminder email rendered from an editable bilingual template.
- Hourly-bank 90% scan: dashboard + optional email to admin; email to client. 30-day dedup per bank.
- Manual contact dialog (reason/template, language, editable subject/body, live preview, send) reused on billing, payment, and hourly-bank surfaces.
- Email templates: 5 editable bilingual templates with an admin editor.
- Email log: every email attempt recorded; client/payment history view.
- Audit on every reminder lifecycle event, email send, manual contact, template edit, lateness-rule set.
- Permissions: admins only for approve/cancel/send/template edit.
- Feature flags + email test mode (no real send in V2).

## 3. What was deliberately out of scope

- Real email provider integration (Resend/SendGrid/SES/SMTP). V2 ships a transport seam that never transmits. Real send is a separate reviewed follow-up behind a 3-gate model.
- Delivery/bounce webhooks (status enum reserves `bounced`; not wired).
- Client-facing login or portal (clients receive email only).
- Advanced CRM: segments, sequences, drip campaigns, open/click tracking.
- SMS or WhatsApp channels.
- Per-client language preference column (clients default to Hebrew emails; deferred).

## 4. Safety posture (hard rules honored)

- No real client emails. Transport stub records to `EmailLog` with `testMode=true` and never sends. Even with all 3 gates flipped, the real path throws `provider_not_wired`.
- 3-gate model for any future real send: flag `billing_email_real_send` + env `ALLOW_PRODUCTION_EMAIL` + env `EMAIL_PROVIDER`.
- All new surfaces flag-gated, default off: `billing_reminders_enabled`, `hourly_bank_alerts_enabled`, `manual_contact_enabled`, `email_templates_admin_ui`.
- Admin-only mutations. Audit everything.
- Templates editable from the admin UI; never hardcoded in routes.

## 5. Scope guardrails applied

The PM blocked two scope-creep attempts during the sprint:
- A request to add open/click tracking pixels. Deferred (CRM scope).
- A request to add an in-app client reply inbox. Deferred (needs client auth).

Both logged in `wave_2_deferred_items.md`.
