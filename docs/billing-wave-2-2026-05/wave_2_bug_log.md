# Wave 2 Bug Log

Owner: Project Manager
Date: 2026-05-28

Bugs found during the implementation cycle, prioritized, fixed, retested.

## Resolved during the cycle

| # | Severity | Bug | Where | Resolution |
|---|---|---|---|---|
| 1 | Blocker | Wave 2 schema built in wrong git worktree; not on canonical team1 | worktree mixup | Byte-identical delta copied to team1, verified (5 enums + 4 models, no other change), committed |
| 2 | High | lucide-react vite resolution broke 3 test files (pre-existing, surfaced again) | `tests/component/review-decision-dialog.test.tsx` + 2 integration files | Root cause: lucide-react@0.469.0 has no `exports` field AND a corrupt ESM build (`dist/esm/icons/gavel.js` missing). Fixed via `resolve.alias` to an auto-generated stub in `tests/stubs/lucide-react.ts`. All 3 now pass. |
| 3 | Medium | Payment has no public-number column; templates reference `{{payment_public_number}}` | schema | Email handle resolves to `reference || PMT-<id8>`; documented. Template variable kept by name. |
| 4 | Medium | Client has no language column; client emails need a language | schema | Client emails default Hebrew; admin emails use admin `languagePref`. Per-client language deferred to a follow-up. |
| 5 | Low | `.gitignore` migration-swallow bug could have dropped the new migration | `.gitignore` | Already fixed on team1 in the prior debug sprint; verified the new migration is tracked. |

## Found and confirmed NOT a bug

- QA ran 61 tests against the Wave 2 routes + lib. No functional defects found in the Wave 2 code. The routes behaved exactly as specified.

## Watch items (not bugs, monitored)

- The email transport throws `provider_not_wired` on the real-send path. This is intentional - V2 cannot send. When the real provider lands, the QA suite must add a transmit-path test with a mocked provider.
- The manual-contact billing-list surface passes `hasEmail` optimistically because the list query selects only `client.{id,companyName}`. The no-email guard relies on the backend 422 there. On client-detail and bank surfaces the real email is threaded and the guard works upfront.

## Regression check (Knowledge functionality)

- Full suite run includes all Knowledge P1 tests. 867 pass, 0 fail. No Knowledge regression introduced by Wave 2.
- Manual smoke recommended on `/knowledge` after enabling its flag, since Wave 2 touched shared infra (notifications, audit, cron registry, i18n). No code path overlaps that would change Knowledge behavior.
