# Wave 2 Deferred Items

Date: 2026-05-28
Owner: Project Manager

## Deferred to a follow-up (next)

1. **Real email provider integration.** Wire Resend / SendGrid / SES / SMTP behind the existing 3-gate model. Add a transmit-path test with a mocked provider. Security review required.
2. **Delivery + bounce webhooks.** `EmailDeliveryStatus.bounced` is reserved; wire the provider webhook with HMAC verification. Update `EmailLog.status` on delivery events.
3. **Per-client language preference.** Add a `language` column to `Client`; client emails currently default Hebrew.
4. **Rate-limit on reminder-decide.** Low risk (admin-only) but add for completeness.

## Deferred to V3

1. **Open/click tracking.** CRM scope; needs a privacy review and a tracking-pixel/redirect service.
2. **In-app client reply inbox.** Needs client authentication / a client portal.
3. **Bulk "remind all overdue" action.** Risky without per-client review; revisit with safeguards.
4. **Reminder queue grouping by week** on the Closed tab.
5. **SMS / WhatsApp channels.**
6. **Template version history** (audit currently records the editor + timestamp; full diff history is a nicety).

## Explicitly out of scope forever (unless re-chartered)

- Marketing campaign sequences / drip automation.
- Lead scoring or pipeline management.
- Customer-facing self-service billing portal.

## Watch items carried forward

- The manual-contact billing-list surface passes `hasEmail` optimistically (list query selects only id + companyName). The no-email guard relies on the backend 422 there. If the list query is ever widened, surface the guard upfront.
- When the real email provider lands, EmailLog body retention needs a policy.
