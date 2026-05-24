# Skyware Internal Management Portal: Final Plan

Version: 1.0 (reconciliation pass)
Date: 2026-05-15
Status: Implementation-ready specification. No code yet.

## Purpose

This folder is the single source of truth.
It reconciles `docs/internal-management-portal-*.md` with `docs/internal-management-portal-enhancement/`.
Conflicts are resolved here.
The original files remain untouched as historical reference.

## What this folder contains

| File | Subject |
|------|---------|
| `README.md` | This file. |
| `01-accepted-scope.md` | What was accepted, postponed, rejected. |
| `02-implementation-ready-spec.md` | Main source-of-truth spec. |
| `03-data-model-final.md` | Final entities, fields, enums. |
| `04-mvp-build-plan.md` | MVP scope, order, validation, fallbacks. |
| `05-file-by-file-implementation-plan.md` | Files to create and their roles. |
| `06-ux-flow-spec.md` | User flows step by step. |
| `07-next-implementation-prompt.md` | Copy-paste prompt for the build. |

## Main source of truth

`02-implementation-ready-spec.md` is the authoritative behavior spec.
`03-data-model-final.md` is the authoritative schema spec.
`04-mvp-build-plan.md` is the authoritative scope spec.
`05-file-by-file-implementation-plan.md` is the authoritative layout spec.

When in doubt, this folder wins over older docs.

## How to use these files

### To decide
Read `01-accepted-scope.md` and `04-mvp-build-plan.md`.

### To design
Read `02-implementation-ready-spec.md` and `06-ux-flow-spec.md`.

### To implement
Read `03-data-model-final.md` and `05-file-by-file-implementation-plan.md`.
Then run the prompt in `07-next-implementation-prompt.md`.

## Recommended next Claude prompt

The exact prompt is in `07-next-implementation-prompt.md`.
Copy it into a new Claude Code session.
Confirm stack choices before any code is generated.

## Implementation readiness status

Ready to implement: yes.
Blocked items before any real client data: yes.

Blocking items the user must resolve before pilot:

1. Real client list. Currently "Needs user input."
2. Real employee identities and emails.
3. Skyware IT LTD legal details for tax documents.
4. Israeli VAT rate at launch.
5. Allocation-number (מספרי הקצאה) status for launch year.
6. Digital signature requirement.
7. Default SLA hours per priority.
8. Hosting region for data residency.
9. Vault provider used by the team.
10. Stack confirmation. Suggested in `05-file-by-file-implementation-plan.md`.

None of these block scaffolding the MVP.
All of them block real document issuance and pilot.

## Reconciliation summary

From the enhancement pass, 10 small additions enter MVP.
Two earlier-proposed MVP additions were demoted to Phase 2.

Demoted to Phase 2:

- Notification scaffold. Matches original spec.
- SLA breach automation. Display-only SLA bar stays in MVP. Audit and trigger move to Phase 2.

Accepted into MVP. See `01-accepted-scope.md` for details.

Postponed to Phase 2 or later. See `01-accepted-scope.md`.

Rejected for now. See `01-accepted-scope.md`.

## Style and constraints

- No production code in this folder.
- No emoji. No em-dashes.
- Short, factual sentences.
- Placeholders for missing data. No invented prices or names.
- Israeli tax statements flagged "needs accountant verification."
- Credential references only. No password storage.
