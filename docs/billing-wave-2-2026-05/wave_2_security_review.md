# Wave 2 Security Review

Reviewer: Security Engineer
Date: 2026-05-28

## Threat model

| # | Threat | Mitigation in V2 |
|---|---|---|
| 1 | Accidental real client email | Transport is test-mode by default; writes `EmailLog testMode=true` and never transmits. The real-send path throws `provider_not_wired`. Three independent gates (`billing_email_real_send` flag + `ALLOW_PRODUCTION_EMAIL` env + `EMAIL_PROVIDER` env) all default off, and even all-true cannot send in V2. |
| 2 | Non-admin sends or approves a billing email | Every mutation route runs `requireAuth` then `isAdmin` via `lib/billing/permissions.ts`. 403 for non-admins, verified by tests. |
| 3 | HTML injection via template variables | `lib/email/render.ts` HTML-escapes every interpolated value before insertion into the HTML body. Unit-tested. |
| 4 | Reminder spam to a client | Admin-first flow: client email only after admin notification + decision (or an explicit per-payment auto-send window). Hourly-bank alert has a 30-day per-bank dedup. |
| 5 | Unauthorized cron invocation | Both cron routes use `requireCronAuth` (bearer secret OR admin session). Deny otherwise. |
| 6 | Secrets in EmailLog | EmailLog stores recipient, subject, body, status. It does NOT store auth headers, provider keys, or passwords. |
| 7 | Tampering with reminder lifecycle | Server-side state machine (`reminder-state.ts`) rejects illegal transitions with 422. Audit row on every transition. |
| 8 | Template tampering | Template edits are admin-only and audited (`billing.email_template.updated`). |
| 9 | Cross-client data leak in manual contact | The contact route resolves the client + optional payment/bank by id and validates ownership before rendering. Email goes only to the resolved client's address. |
| 10 | Replay / double-send | Reminder state machine prevents re-sending a `sent` reminder. Hourly-bank dedup prevents repeat alerts. |

## Email gating posture (mirrors receipts module)

Clean (real) send requires ALL of:
1. Feature flag `billing_email_real_send = true`
2. Env `ALLOW_PRODUCTION_EMAIL = "true"`
3. Env `EMAIL_PROVIDER` set to a known provider

In V2 even with all three set, `transport.ts` throws `provider_not_wired`
and records the attempt as a failed `EmailLog`. The provider integration
is a separate, security-reviewed follow-up. This is intentional and
prevents a misconfiguration from leaking a real email.

## Audit coverage

Every one of these writes an audit row inside the mutation transaction:
- reminder scheduled, admin_notified, approved, delayed, cancelled, sent, send_failed, auto_sent
- manual_contact.sent
- hourly_bank.alert_fired
- email_template.updated
- payment.lateness_rule_set

## Permissions matrix

| Action | employee | admin |
|---|---|---|
| Set lateness rule | no | yes |
| View reminder queue | no | yes |
| Approve / delay / cancel / send reminder | no | yes |
| Send manual contact | no | yes |
| Edit email templates | no | yes |
| View email logs | no | yes |
| Trigger cron manually | no | yes (or bearer secret) |

## Deferred (with rationale)

- Real provider integration + DKIM/SPF/return-path hardening: separate follow-up.
- Delivery/bounce webhook verification (HMAC signature check): when webhooks land.
- Rate-limit on the reminder-decide route: low risk (admin-only); manual-contact route already rate-limited 30/15min/IP.
- PII retention policy for EmailLog bodies: revisit if real sending is enabled.

## Verdict

Security signs off on Wave 2. The default-off, test-mode, admin-only,
fully-audited posture is conservative and safe to ship internally.
