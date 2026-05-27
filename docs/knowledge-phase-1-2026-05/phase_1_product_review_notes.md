# Phase 1 Product Review Notes

Reviewers: Product Manager, Product Designer, Knowledge Management Specialist
Date: 2026-05-27

## Reviewed surfaces

### Pages
- `/knowledge` list with filters, kind chip, status chip, reliability tier badge, verified freshness pill, two add-article buttons.
- `/knowledge/new` internal-article form.
- `/knowledge/new/external` external-reference form.
- `/knowledge/[slug]` two-column detail view with sidebar metadata + sanitized Markdown body + action bar.
- `/knowledge/[slug]/edit` kind-aware edit form.
- `/knowledge/[slug]/revisions` newest-first version list.
- `/knowledge/[slug]/ai` side-by-side raw vs structured.
- `/knowledge/review` inbox queue with 4 tabs.

### Components
22 new components plus an extended ArticleEditor.

### Flows verified
- Create internal article from scratch.
- Create internal article from a reviewed job (button + checkbox).
- Create external reference; URL canonical hash dedup blocks duplicates with 409.
- Run AI structuring (dry-run); accept or reject side-by-side output.
- Submit for review; reviewer queue receives it; approve, request_changes, reject.
- Approve and Publish are distinct actions.
- Archive and rescind preserve the article; never delete published rows.
- Re-verify external_reference resets `last_verified_at` and lets the reviewer update reliability tier.
- Cross-link from article -> source job (via `sourceJobId`).
- Cross-link from job -> article (in the job detail's related panel; covered via the existing pattern).

## What product asked to change in Wave 3

All 7 items landed.

1. Pending-review-count endpoint added so the sidebar badge stops 404'ing.
2. List rows now render kind + reliability + freshness chips natively (list select widened).
3. Reviewer queue "Unassigned" tab filters server-side instead of approximating.
4. PATCH schema widened with kind/reliabilityTier/externalUrl/externalSource plus state-machine guards.
5. Default reliability tier per kind resolved server-side when client omits it.
6. AI structuring ineligible kinds return structured 422 with code.
7. Article -> source-job link uses the correct route variant.

## What product still wants but accepts deferring

- Auto-fetch external page title (V2 with SSRF guard).
- Senior-employee reviewer role.
- Real LLM call after vendor sign-off.
- Saved searches.
- Embedding-based related-article suggestions (V3).
- Multi-language bodies (V3).

## UX nits accepted as-is for V1

- The action bar uses one button per action. A dropdown menu in V2 could compress the visual surface.
- The reviewer queue's "Closed" tab is a flat list ordered by updated date. A grouping by week would help at scale.
- Source job link goes to `/my-jobs/[id]` for both audiences with a `from=` query param. A split route in V2 for global-jobs would feel more correct.

## Verdict

The product reviewers (PdM + PdD + KM) sign off on V1.
