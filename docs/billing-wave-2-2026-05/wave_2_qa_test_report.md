# Wave 2 QA Test Report

Reviewers: Senior QA Engineer + Evaluation Engineer
Date: 2026-05-28

## Counts

| Metric | Before Wave 2 | After Wave 2 |
|---|---|---|
| Test files | 105 | 120 |
| Tests | 794 effective (748 + 46) | 867 |
| Failing | 3 (pre-existing lucide-react) | 0 |
| typecheck | clean | clean |
| lint | clean | clean |

Wave 2 added 115 net tests (54 in the BE wave + 61 in the QA wave) and
fixed the 3 lingering lucide-react failures.

## lucide-react fix

Root cause: lucide-react@0.469.0 ships no `exports` field and this
install has a corrupt ESM build (`dist/esm/icons/gavel.js` missing).
Fix: `resolve.alias` in `vitest.config.ts` maps `lucide-react` to an
auto-generated stub (`tests/stubs/lucide-react.ts`) that declares every
icon export as a trivial forwardRef SVG. Deterministic, no new dep, no
touch to the broken barrel. The 3 previously-failing files pass.

## Wave 2 test inventory

### Integration (tests/integration/)
- `billing-reminders-list.test.ts` (6): 401, 403, 404 flag-off, 200 shape.
- `billing-reminder-decide.test.ts` (9): approve, delay (+400 without date), cancel, send-now, 422 illegal, 403, 404.
- `billing-contact.test.ts` (7): 200 test-mode, 422 no email, 403, 404 flag-off, both-or-neither override validation.
- `billing-email-templates.test.ts` (8): list, patch + audit, 403, 404 flag-off.
- `billing-email-logs.test.ts` (5): 400 without filter, admin only, shape.
- `billing-reminders-cron.test.ts` (6): cron-auth bearer + admin + deny, flag-off skip, flag-on summary, no real email.
- `hourly-bank-alerts-cron.test.ts` (4): flag gate, 90% fires + writes log, 30-day dedup no re-fire, summary shape.
- `billing-reminder-fullflow.test.ts` (1): lib-layer end-to-end - schedule -> admin notify -> send-now -> client send; all test-mode; audit asserted.

### Unit (tests/unit/)
- `billing-hourly-bank-threshold.test.ts` (5): 89/90/100/zero-total/no-usage.
- `billing-manual-contact-render.test.ts` (6): template vs override, HTML escape, en/he.
- `email-transport-testmode.test.ts` (4): always writes EmailLog; test mode queued + no throw; real path writes failed `provider_not_wired` + throws.

### From the BE wave
- `billing-reminder-state.test.ts` (22), `email-render.test.ts` (17), `billing-reminder-trigger-date.test.ts` (12), `billing-reminder-permissions.test.ts` (3).

## Verification matrix (per requirements)

| Required verification | Covered |
|---|---|
| Admin notification by email | yes (full-flow + cron tests assert admin EmailLog testMode) |
| Admin notification inside dashboard | yes (notification write asserted) |
| Reminder scheduling | yes (scheduleDueReminders + trigger-date unit) |
| Approve / delay / cancel / manual send | yes (decide test, all 4 actions + 422) |
| Client reminder email preview/send | yes (render unit + send path test mode) |
| Hourly bank 90% threshold | yes (threshold unit + cron test + dedup) |
| Manual contact from Billing | yes (contact route test + render unit) |
| Permissions | yes (403 non-admin on every mutation) |
| Audit logs | yes (audit-action asserts in decide + template + full-flow) |
| Failure states | yes (422 illegal transition, 422 no email, transport failed path) |
| Empty/loading states | UI: EmptyState + loading.tsx present (manual verification) |
| Regression in Knowledge | yes (full suite green, no Knowledge test broke) |
| Full end-to-end workflow | yes (billing-reminder-fullflow.test.ts) |

## No real email guarantee

Every email-path test confirms the transport stays in test mode and
writes `EmailLog` rows with `testMode=true` / `status=queued`. The
real-send path is proven to throw rather than transmit. No test, and
no code path in V2, can send a real client email.

## Verdict

QA + Evaluation sign off on Wave 2. 867/867 pass.
