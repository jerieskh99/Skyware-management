# Phase 1 Deferred Items

Date: 2026-05-27
Owner: Project Manager

These items were explicitly NOT in V1. They are tracked here so V2 and
V3 can pick them up cleanly.

## Deferred to V2 (post-pilot)

1. **Auto-fetch external page title** behind SSRF guard. Flag
   `knowledge_external_autofetch_enabled`.
2. **Senior-employee reviewer role**. Adds a User flag to let non-admin
   senior employees review `external_reference` and `how_to_guide`
   articles.
3. **Real LLM call**. Vendor selection plus redaction pre-pass review;
   the 3 gates flip to true.
4. **LLM-grader against the editorial rubric**. Warn-only on submit.
5. **Per-author monthly LLM-cost quota**.
6. **Saved searches** in the Knowledge list (matches the existing
   saved-views pattern on Jobs/Clients/Billing).
7. **Attachments on knowledge articles**. Reuse the S3 layer; per-
   article ACL via visibility.
8. **`department_only` visibility** value plus a `primaryDepartmentId`
   FK. Default for `internal_task_lesson` until approved, then promote.
9. **`/global-jobs/[id]` route** for the article -> source-job link
   variant when the article's source job is no longer the viewer's
   assignment.
10. **Structured error codes** on the few routes where V1 still returns
    a generic 403 (e.g. PATCH reliability tier).
11. **`aws_secret` regex** in the secrets scanner. Removed in V1 for
    false-positive rate; revisit with a smarter context-aware
    detector.
12. **Reviewer-queue grouping by week** on the Closed tab when scale
    demands it.

## Deferred to V3 (longer term)

1. **Multi-language bodies** (he / en / ar) with a side-by-side editor.
2. **Semantic search via embeddings** alongside FTS. Plus
   auto-suggest related articles.
3. **Article analytics** (read count, time-on-page, search-rank
   position). Privacy-aware (per-article, not per-reader).
4. **Customer-facing knowledge subset**. Selected articles published
   to a separate portal. Requires a separate compliance review.

## Explicitly out of scope forever

- Real-time collaborative editing.
- Personal note-taking app features.
- A CRM-style "notes about people" feature.
- A vendor product catalog or marketing CMS.

## Items product wants discussed before V2 starts

- LLM vendor decision (OpenAI / Anthropic / Azure / Google).
- Annual cost cap per author and per organization.
- Whether to add a public read-only knowledge portal at all (no
  commitment from V1 implies no obligation in V2).
