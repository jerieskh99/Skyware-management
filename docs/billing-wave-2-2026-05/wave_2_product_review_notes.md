# Wave 2 Product Review Notes

Reviewers: Product Manager, Product Designer
Date: 2026-05-28

## Reviewed flows

1. Set a lateness rule on a payment (days/weeks + admin-first + optional auto-send).
2. Reminder appears in the admin queue once the trigger date passes.
3. Admin reviews: approve / delay / cancel / send now.
4. Client reminder email rendered from an editable template (test mode).
5. Hourly-bank 90% alert: dashboard strip + admin email + client email.
6. Manual contact from billing / payment / hourly-bank rows: pick reason, language, edit subject+body, preview, send.
7. Email template editor (5 templates, en + he).
8. Email history on the client detail billing tab.

## What product asked for and got

- Admin-first notification before any client email: yes (dashboard notification + admin email, then decide).
- Review/approve/delay/cancel/manual-send: yes, all four in the decision dialog.
- Show client, payment, amount, due date, lateness rule, planned reminder date: yes, in the dialog.
- Professional reminder email: yes, editable bilingual template.
- Hourly-bank 90% to client + admin: yes; 30-day dedup so it does not nag.
- Manual contact with reason/template/preview + logged to history: yes.

## Product-requested refinements (landed)

- Every send surface shows the test-mode state ("captured in test mode, not delivered"). PdD insisted; done.
- Manual-contact preview renders the {{variables}} so the admin sees the real text before sending.
- Lateness rule editor is a per-payment dialog (PATCH), not buried in create. Clear entry point.
- Dashboard "reminders pending review" count gives admins a single glance.

## Product-requested refinements (deferred with agreement)

- Open/click tracking: deferred (CRM scope, privacy review needed).
- In-app client reply: deferred (needs client auth).
- Per-client language preference: deferred (clients default Hebrew for now).
- Bulk "remind all overdue" action: deferred (V3; risky without per-client review).

## UX nits accepted for V2

- Manual contact on the billing list surface relies on a backend 422 for the no-email case (list query does not expose the email). Acceptable; the dialog shows the error clearly.
- The reminder queue "Closed" view is a flat list; grouping by week is a V3 nicety.

## Verdict

Product Manager and Product Designer sign off on Wave 2.
