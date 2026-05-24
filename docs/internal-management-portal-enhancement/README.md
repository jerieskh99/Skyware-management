# Internal Management Portal Enhancement Folder

This folder is a strategic enhancement pass.
It supplements the original plan in `docs/`.
It does not replace any file in `docs/`.

## What this folder contains

Twelve Markdown files.
Each file is useful standalone.
Numeric order is the recommended reading order.

| File | Subject |
|------|---------|
| `00-index.md` | Folder map and short summary. |
| `01-current-plan-review.md` | System map and gap analysis. |
| `02-ceo-perspective.md` | CEO views and money board. |
| `03-cto-perspective.md` | Tech ops, automation, risk. |
| `04-it-business-advisor-perspective.md` | Revenue, retention, pricing. |
| `05-ux-ui-review.md` | UX patterns and layout guidance. |
| `06-recommended-new-modules.md` | Module specs with verdicts. |
| `07-mvp-and-roadmap.md` | Revised MVP and phases. |
| `08-data-model-additions.md` | New entities and field changes. |
| `09-ux-wireframe-descriptions.md` | Text-only wireframes per page. |
| `10-final-recommendation.md` | Shortlist and the next prompt. |
| `README.md` | This file. |

## How to use these files

### For decision making
Read in this order.

1. `00-index.md`.
2. `02-ceo-perspective.md`.
3. `04-it-business-advisor-perspective.md`.
4. `10-final-recommendation.md`.

### For implementation prep
Read in this order.

1. `00-index.md`.
2. `01-current-plan-review.md`.
3. `06-recommended-new-modules.md`.
4. `07-mvp-and-roadmap.md`.
5. `08-data-model-additions.md`.
6. `09-ux-wireframe-descriptions.md`.

### For design review
Read in this order.

1. `05-ux-ui-review.md`.
2. `09-ux-wireframe-descriptions.md`.

## Which sections to merge into the main spec later

When the original plan is updated, fold in these additions.

### Into `internal-management-portal-spec.md`

- Section 1.2 of `07-mvp-and-roadmap.md`. The 11 MVP additions.
- Section 1.4 of `05-ux-ui-review.md`. The dashboard layout updates.
- Section 7 and 8 of `05-ux-ui-review.md`. Job card and detail layout.
- Section 11 of `05-ux-ui-review.md`. Receipts page layout and banner.
- Section 14 of `05-ux-ui-review.md`. Mobile and responsive behavior.

### Into `internal-management-portal-data-model.md`

- Section 1 of `08-data-model-additions.md`. Additions to existing entities.
- Sections 2 through 18 of `08-data-model-additions.md`. New entities.
- Section 21 of `08-data-model-additions.md`. New permission rules.
- Section 22 of `08-data-model-additions.md`. New audit log actions.

### Into `internal-management-portal-mvp-plan.md`

- Section 1 of `07-mvp-and-roadmap.md`. Revised MVP.
- Section 4 of `07-mvp-and-roadmap.md`. Phase roadmap.
- Section 6 of `07-mvp-and-roadmap.md`. Validation checklist additions.
- Section 7 of `07-mvp-and-roadmap.md`. Future expansion additions.

## What the next step should be

1. Review `10-final-recommendation.md` with the user.
2. Resolve open questions in `10-final-recommendation.md` Section 4.
3. Lock the revised MVP using `07-mvp-and-roadmap.md` Section 1.
4. Optionally merge enhancement bullets into the three main docs.
5. Start Phase 0. Stack confirmation and repo setup.
6. Use the prompt in `10-final-recommendation.md` Section 5 to start implementation.

## Continuation notes

All 12 files are complete.
If a future pass needs to continue here, candidate areas.

- Concrete cron rules for `RecurringJobTemplate`.
- DSL examples for `EscalationRule.condition_json`.
- Per-page accessibility audit checklist.
- Hebrew-language UI strings catalog.
- Production deployment checklist.
- Backup and restore drill plan.
- Threat model document.
- Data retention policy aligned with Israeli accounting requirements.
- Performance budget per page.
- Test plan with seeded scenarios.

These are not blockers for MVP build.
They are useful before pilot launch.

## Rules followed during this pass

- Did not write production code.
- Did not modify original spec files.
- Did not invent real client names or real prices.
- Did not claim Israeli compliance certainty.
- Flagged accountant and legal items consistently.
- Kept the original vision intact.
- Kept the folder modular.
