# Knowledge System: Security and Permissions Audit

Authored by: Senior Security Engineer
Sprint: knowledge-sprint-2026-05
Status: planning artifact, no code changes in this document

This plan governs the Knowledge System expansion from the current two-state
(internal, admin_only) admin-only CRUD that exists in `lib/knowledge/queries.ts`,
`app/api/knowledge/route.ts`, and the `[slug]` subroutes, to the six-article-type,
six-status, employee-authored model defined in the product strategy. It is the
canonical security plan for the rest of the sprint. Engineering, QA, and PM
should refer to it. If a behavior is not described here, default to deny.

## Reference points in the current codebase

- Roles and admin gate: `lib/permissions.ts` (`isAdmin`, `isEmployee`,
  `canAccessDepartment`, `canReadJob`, `canPostInChannel`,
  `ADMIN_ONLY_PAGES`).
- Visibility filter as it exists today: `lib/knowledge/queries.ts`
  `listArticles` and `getArticleBySlug`.
- API surface and current admin-only gates:
  `app/api/knowledge/route.ts`, `app/api/knowledge/[slug]/route.ts`,
  `app/api/knowledge/[slug]/archive/route.ts`,
  `app/api/knowledge/[slug]/publish/route.ts`,
  `app/api/knowledge/[slug]/tags/route.ts`.
- Standard 401/403/400/404/422 shape: `lib/api-utils.ts`.
- Audit trail and the existing `redact()` list: `lib/audit.ts`.
- Rate-limiter store and helpers: `lib/rate-limit.ts`.
- Attachment storage layer to reuse: `app/api/attachments/route.ts`,
  `lib/storage/upload-policy.ts`, `lib/storage/s3.ts`,
  `lib/storage/attachments.ts`.
- Notification triggers used for state-change fanout:
  `lib/notifications/triggers.ts`.
- Three-gate production pattern to mirror: `lib/compliance/gates.ts`
  (`isCleanProductionIssuance`, `WATERMARK_TEXT_BILINGUAL`).
- Feature flags helper: `lib/feature-flags.ts`.
- Prisma model and enums (current shape):
  `prisma/schema.prisma` lines 1029-1085
  (`KnowledgeArticleStatus`, `KnowledgeArticleVisibility`,
  `KnowledgeArticle`, `KnowledgeArticleTag`).

The schema today only carries `status in {draft, published, archived}` and
`visibility in {internal, admin_only}`. The expansion (six article types,
six statuses, departmental scoping, external references) requires schema
work, but every gate in this plan is defined in terms of attributes the
schema team is adding. Where a gate depends on a yet-to-be-added column,
the column name is stated so the schema task can pick it up.

## 1. Threat model

Each row: attacker, asset, impact, mitigation. Twelve threats covering the
content pipeline, the LLM step, the URL surface, and the audit chain.

### T1. Prompt injection via worker writeup

- Attacker: a regular employee, an external user whose words end up in a
  worker writeup (forum reply pasted into a job, vendor email pasted into
  notes), or a compromised vendor account whose ticket text was copied
  verbatim by an employee.
- Asset: the LLM structuring step that turns raw writeups into draft
  knowledge bodies. The LLM will obey instructions inside that text by
  default.
- Impact: the LLM could emit text the author never wrote, including
  fake step lists, fake commands, leaked system-prompt fragments, or
  text that bypasses our redaction list. Worst case: the LLM
  hallucinates a "fix" that includes a destructive command and the
  reviewer skims it.
- Mitigation: send writeups inside a clearly delimited user-data block,
  with a static system prompt that instructs the model to never execute,
  imitate, or echo instructions appearing inside that block. Reject
  responses that contain new section headers, code-fences, or external
  URLs that did not appear in the source. The LLM output is always a
  draft; status stays `draft` until an admin reviews it. The LLM call
  is gated by the three gates in section 11.

### T2. Credential leak in a published article

- Attacker: the article author themselves, accidentally; or anyone who
  edits a draft and pastes a real password or token thinking the article
  was internal-only.
- Asset: the body of any article that reaches `published`.
- Impact: a credential is now visible to every authenticated user (and
  to LLM training pipelines if scraped). For an Israeli client this
  also runs into Privacy Protection Law concerns.
- Mitigation: run a secrets scanner over the body and over the
  external-references list at three points: on save (draft warning),
  on submit-for-review (blocking unless author explicitly confirms),
  and on publish (blocking unless an admin explicitly confirms).
  Patterns: AWS keys (`AKIA`, `ASIA`), private-key headers, JWT
  tokens, Slack tokens, GitHub `ghp_`, generic high-entropy strings
  near the words "password" / "secret" / "סיסמה" / "סוד". Findings
  are written to `audit_log.diff_json` under the redacted field name
  only, never the value.

### T3. Link-borne XSS via external URL

- Attacker: any user with create or edit rights on an article.
- Asset: the rendered article view in every other user's browser.
- Impact: stored XSS. With session cookies in browser scope, this is
  account takeover for anyone who opens the article.
- Mitigation: external URLs go through a sanitizer that rejects
  `javascript:`, `data:`, `vbscript:`, `file:`, `chrome:`, `chrome-extension:`,
  any scheme not in the allow-list `{http, https, mailto}`, and rejects
  payloads where the host parses but the URL contains a `<` or `>` after
  normalization. The rendered anchor is `rel="noopener noreferrer
  nofollow ugc"` and `target="_blank"`. Markdown rendering uses an
  allowlist sanitizer (no inline HTML, no inline event handlers).
  Article body is rendered as markdown, never as raw HTML.

### T4. SSRF via auto-fetch of external URLs

- Attacker: any user who can paste a URL into the references section.
- Asset: the server-side URL preview fetcher (Open Graph thumbnail,
  title extraction, optional).
- Impact: the fetcher contacts internal addresses (`169.254.169.254`,
  `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`,
  `::1`, link-local IPv6) to read cloud metadata or internal services.
- Mitigation: the preview fetcher is opt-in per request, runs in a
  worker with a strict allow-list of public ranges only, resolves DNS
  before connecting, refuses if any A or AAAA record falls inside the
  blocked CIDRs, refuses redirects to such addresses on each hop,
  enforces a 5-second connect timeout and 10-second total timeout,
  and caps response body at 1 MB. If the deployment is single-region,
  the fetcher binds to a network namespace with egress rules; for
  pilot, the in-app guard is the only line, documented as such in the
  open questions.

### T5. Draft data exposure across departments

- Attacker: an `employee` in department A.
- Asset: a draft article authored by an employee in department B that
  contains client names, internal IP addresses, or work-in-progress
  troubleshooting.
- Impact: information disclosure across business unit boundaries.
- Mitigation: drafts are visible only to the author, the reviewer
  (an admin), and admins. The visibility filter in
  `lib/knowledge/queries.ts` is extended so non-admins see only
  `status=published` rows that match their `departmentScope`
  (section 3 default), plus their own drafts. Every list query and
  every slug fetch passes the viewer's `departmentKey` and `userId`
  into the visibility predicate; the existing `viewerIsAdmin` boolean
  becomes one of three inputs.

### T6. Privilege escalation through state-machine transitions

- Attacker: a regular employee.
- Asset: the state machine of an article (draft -> in_review -> approved
  -> published).
- Impact: an employee could try to call `/publish` directly on their own
  article and skip review.
- Mitigation: every state-transition endpoint checks role and the
  current article status before transitioning. The permitted edges are
  encoded in a single transition table (section 2 reflects them). An
  employee may only call `submit-for-review`. An admin may call
  `approve`, `request-changes`, `publish`, `archive`, `unpublish`,
  `restore`. The `[slug]/publish` route in
  `app/api/knowledge/[slug]/publish/route.ts` keeps the
  `if (!isAdmin(auth.user)) return forbidden()` check (line 19) and
  additionally rejects the transition if `existing.status !==
  "approved"` with a 422 from `unprocessable()` in `lib/api-utils.ts`.

### T7. Hard-delete used to erase incident history

- Attacker: an admin acting in bad faith, or an admin coerced by a
  client to scrub a published article that recorded a real outage.
- Asset: the article and its audit trail.
- Impact: the article row disappears (`deleteArticle` in
  `lib/knowledge/queries.ts` line 364) and only the audit row remains.
  Anything referenced from elsewhere (tags, attachments) becomes a
  dangling pointer.
- Mitigation: deprecate hard delete from the API. Replace with archive
  (already implemented) and a separate "purge" path that requires the
  three-gate model (section 11) and a second-admin confirmation (
  two-person rule). The audit row stays even after purge with the
  `diff_json` showing field nulls; the row in `knowledge_articles` is
  removed only after the purge ceremony. Open question: do we keep a
  tombstone row? See section 13.

### T8. Cross-tenant leak via search

- Attacker: a regular employee using the search box.
- Asset: the body of articles outside their department scope.
- Impact: even if a non-matching article does not appear in the list,
  a substring search could surface a snippet (the current
  `listArticles` does an `OR` over `title`, `body`, `summary`).
- Mitigation: search is performed inside the same predicate as list.
  Add a unit test asserting that an article in department B is never
  returned for a search by a user in department A regardless of the
  query string. The `OR` clause stays, but it is wrapped by the
  department-scope predicate so it cannot break out.

### T9. Audit log redaction bypass

- Attacker: any author who learns which fields the redaction list
  watches.
- Asset: the audit trail itself.
- Impact: a user puts a secret in a non-watched field (a "title" or a
  "summary") and it lands verbatim in `audit_log.diff_json`.
- Mitigation: `redact()` in `lib/audit.ts` lines 21-27 is keyed by
  field name. For knowledge, extend it with a body-aware sanitizer
  that scans the `new` and `old` values for the same secrets-scanning
  regexes as T2 and replaces matches with `[REDACTED]`. Apply on
  title, summary, body, external URL list. Keep the redaction simple
  enough that a unit test can assert each pattern survives a round-trip.

### T10. Stored XSS via tag label

- Attacker: an admin who creates a malicious tag.
- Asset: any UI surface that renders the tag label.
- Impact: stored XSS in the sidebar, in the article header, in the
  audit table that shows `tagId`.
- Mitigation: tag labels (`labelEn`, `labelHe`, `colorHex` per the
  `Tag` select in `lib/knowledge/queries.ts` lines 24-26) go through
  the same allow-listed renderer as article body, plus a hex-only
  regex check on `colorHex` server-side. Server validates
  `^#[0-9a-fA-F]{6}$` before writing.

### T11. CSRF on state transitions

- Attacker: a third-party site that an authenticated admin happens to
  open in another tab.
- Asset: the publish/archive/approve endpoints.
- Impact: drive-by publication or archive.
- Mitigation: every mutating route requires `requireAuth()` plus
  same-origin CSRF protection. Today the routes rely on session
  cookies. Add a server-checked CSRF token or `SameSite=Lax`
  enforcement at the auth layer (verify with the auth team that
  cookies are `SameSite=Lax` or stricter). Knowledge mutating routes
  must not accept `GET` with side effects (today they correctly use
  `POST`, `PATCH`, `DELETE`).

### T12. Privacy regression on related-client linkage

- Attacker: an employee in a department that does not service Client X.
- Asset: the `relatedClientId` linkage on a published article.
- Impact: the article is published and visible internally; the
  related-client link reveals that Client X had an incident the
  employee was not entitled to know about. Combined with the article
  title, this is information leakage.
- Mitigation: when `visibility=internal` and `departmentScope=global`,
  do not render the related-client linkage to employees who cannot
  access that client (reuse the client-access check that powers
  the clients page in `ADMIN_ONLY_PAGES` of `lib/permissions.ts`).
  For employees outside the client's serving department, render the
  article but hide the `Client: X` chip and the
  `relatedClient.companyName` field.

## 2. Permissions matrix

Roles and abbreviations:

- `EMP_SAME` - employee whose `departmentKey` matches the article's
  `departmentScope`.
- `EMP_OTHER` - employee in a different department; for `global`
  scope this column always allows when the row would allow for any
  employee.
- `CEO` - admin role `ceo`.
- `CTO` - admin role `cto`.

Article statuses referenced: `draft`, `in_review`, `changes_requested`,
`approved`, `published`, `archived`. Article visibility levels:
`internal` (org-wide), `admin_only`, `department_only` (new value
proposed). Article-type-specific overrides are listed below the table.

Legend: `allow`, `deny`, `cond:<rule>` (conditional).

| Action                                            | EMP_SAME                          | EMP_OTHER                          | CEO   | CTO   |
| ------------------------------------------------- | --------------------------------- | ---------------------------------- | ----- | ----- |
| create (article in own department scope)          | allow                             | deny                               | allow | allow |
| create (article in `global` scope)                | deny                              | deny                               | allow | allow |
| create (article in another department scope)      | deny                              | deny                               | allow | allow |
| list (published, internal, in scope)              | allow                             | cond:scope=global or visible-everywhere | allow | allow |
| list (drafts in own dept)                         | cond:author=self                  | deny                               | allow | allow |
| list (drafts in other dept)                       | deny                              | deny                               | allow | allow |
| list (archived)                                   | deny                              | deny                               | allow | allow |
| read (published, internal, in scope)              | allow                             | cond:scope=global                  | allow | allow |
| read (own draft)                                  | cond:author=self                  | deny                               | allow | allow |
| read (other author's draft, same dept)            | deny                              | deny                               | allow | allow |
| read (admin_only)                                 | deny                              | deny                               | allow | allow |
| edit own draft                                    | cond:author=self and status in {draft, changes_requested} | deny | allow | allow |
| edit any draft                                    | deny                              | deny                               | allow | allow |
| edit published                                    | deny                              | deny                               | allow | allow |
| submit for review (own draft)                     | cond:author=self and status in {draft, changes_requested} | deny | allow | allow |
| approve                                           | deny                              | deny                               | allow | allow |
| request changes                                   | deny                              | deny                               | allow | allow |
| publish                                           | deny                              | deny                               | allow | allow |
| unpublish (back to draft)                         | deny                              | deny                               | allow | allow |
| archive                                           | deny                              | deny                               | allow | allow |
| restore from archive                              | deny                              | deny                               | allow | allow |
| view archived                                     | deny                              | deny                               | allow | allow |
| view draft of someone else                        | deny                              | deny                               | allow | allow |
| send to AI structuring                            | cond:author=self and feature_flag | deny                               | allow | allow |
| mark external reference as verified               | deny                              | deny                               | allow | allow |
| attach tag                                        | cond:author=self and status in {draft, changes_requested} | deny | allow | allow |
| detach tag                                        | cond:author=self and status in {draft, changes_requested} | deny | allow | allow |
| upload attachment to draft                        | cond:author=self                  | deny                               | allow | allow |
| download attachment                               | cond:can-read-article             | cond:can-read-article              | allow | allow |
| hard delete                                       | deny                              | deny                               | cond:two-person | cond:two-person |

Notes on conditionals:

- `scope=global` means the article's `departmentScope` field equals
  `global`. Employees outside the source department can read any
  global-scope published article.
- `author=self` means `article.authorUserId === user.id`. Today this is
  not enforced in the API; section 2 of the schema plan adds the
  `authorUserId`-based predicate.
- `two-person`: hard delete requires a request from one admin and an
  approval from a different admin. Implementation idea: a soft-delete
  + delayed purge with a confirmation token, never a direct destructive
  call.
- `feature_flag`: AI structuring requires the three-gate model
  (section 11). For employees, also requires `ai_structuring_employee_self_serve`.

Article-type overrides (six types). The base row of the matrix applies
to all types; overrides only tighten:

- `internal_task_lesson`: defaults to `departmentScope=author's_dept`
  and `visibility=department_only` until approved. Promotion to
  `visibility=internal` happens at approval time, default-deny across
  departments before that. See section 3 for the rationale.
- `client_specific_runbook`: defaults to `departmentScope=author's_dept`
  but requires a `relatedClientId` and limits read to employees who
  can access that client (reuse the client-access check). Admin always.
- `vendor_advisory`: defaults to `departmentScope=global` because
  upstream advisories affect everyone. Always `visibility=internal`
  once approved.
- `process_doc`: defaults to `departmentScope=global` and
  `visibility=internal`. Authoring is admin-only (CEO/CTO); employees
  may suggest changes but cannot create the type.
- `troubleshooting_guide`: same as `internal_task_lesson` for scope;
  promotion to `global` requires CEO or CTO explicit override.
- `incident_postmortem`: defaults to `visibility=admin_only` until an
  admin promotes it. The promotion is a separate audit event.

## 3. Visibility rules

The current visibility model in `lib/knowledge/queries.ts` lines 70-77
has only two states: `internal` (anyone signed in) and `admin_only`
(admins only). It also collapses department scope into the global
namespace. The expansion adds two orthogonal dimensions:

- `visibility` (enum): `admin_only`, `internal`, `department_only`,
  `client_serving_only`.
- `departmentScope` (enum, mirroring `DepartmentKey`): `global`,
  `helpdesk`, `it`, `rnd`, with `global` meaning "any department can
  see it once published".

Per-row visibility default by article type at create time:

| Type                    | Default departmentScope | Default visibility   | Promotion at approve                |
| ----------------------- | ----------------------- | -------------------- | ------------------------------------ |
| `internal_task_lesson`  | author's department     | `department_only`    | promotes to `internal` if approver opts in |
| `client_specific_runbook` | author's department   | `client_serving_only`| stays `client_serving_only`; admin override only |
| `vendor_advisory`       | `global`                | `admin_only` (draft) | promotes to `internal` at publish    |
| `process_doc`           | `global`                | `internal`           | stays `internal`                     |
| `troubleshooting_guide` | author's department     | `department_only`    | promotes to `internal` only if approver opts in; promotion to `global` is a second step |
| `incident_postmortem`   | `global`                | `admin_only`         | promotes to `internal` only by explicit admin action; stays `admin_only` by default |

The "promotion at approve" column states the proposed default action when
the approver clicks `Approve`. The approver always sees the current
scope and visibility and can override. Overrides write a separate
audit event so the trail records who chose to broaden access.

Visibility predicate (proposed pseudocode; this lives next to the
existing `where.visibility = "internal"` block in
`lib/knowledge/queries.ts` line 71):

```
if viewerIsAdmin:
  no extra filter on visibility
else:
  visibility in {
    "internal",
    "department_only" if article.departmentScope == viewer.departmentKey,
    "client_serving_only" if viewer can access article.relatedClient,
  }
  status == "published"
```

Drafts skip this predicate entirely; see section 4.

## 4. Draft data handling

Drafts may contain unreviewed text including client names, IP addresses,
secrets, and free worker writeups copied verbatim from a job. The
current code has no special handling beyond the `viewerIsAdmin` gate.

Rules:

- Read access: author only, plus admins. Other employees in the same
  department do not see other people's drafts. This matches T5.
- Edit access: author only (when `status in {draft, changes_requested}`)
  plus admins. After the author has submitted for review, the article
  freezes for the author until the reviewer either approves or sends
  it back with `changes_requested`.
- Retention: drafts live for 90 days from last edit (`updatedAt`). A
  scheduled job warns the author at day 75 and again at day 85, and
  archives the row at day 90. Archived rows are not deleted, only
  hidden, so the audit trail and the schema team's revision history
  remain intact. Open question: do CEO/CTO want a different retention
  window for `incident_postmortem` drafts? See section 13.
- Author leaves the company: the user row is not deleted (we use soft
  deletes elsewhere for the same reason). On offboarding, the
  scheduled offboarding job reassigns ownership of the user's drafts
  to a designated knowledge-base reviewer (default: the CTO). The
  audit row records the reassignment with action
  `knowledge.ownership_transferred`. Drafts in `draft` or
  `changes_requested` are not auto-published.
- Author leaves and content has secrets: the reassignment step runs
  the secrets scanner on every draft owned by the departing user and
  flags any hits for admin review before completing the transfer.
- Concurrent edits: the existing route in
  `app/api/knowledge/[slug]/route.ts` does an unconditional
  `prisma.knowledgeArticle.update`. To prevent lost-update across two
  editors, add an `updatedAt` token to the patch payload and reject
  with 409 (a new helper alongside `unprocessable` in
  `lib/api-utils.ts`) if the token does not match. Mostly a quality
  concern, but a relevant access-control concern when one of the two
  editors is malicious.

## 5. URL hygiene

External references include vendor URLs, vendor knowledge base links,
manufacturer advisories. Users paste freely. The default assumption is
hostile.

Acceptance rules at write time:

- Scheme allow-list: `http`, `https`, `mailto`. No `javascript:`,
  `data:`, `vbscript:`, `file:`, `chrome:`, `chrome-extension:`,
  `intent:`, `tel:`.
- Hostname required. Reject URLs that resolve to bare IPs unless the
  IP is in a public range. The host check is purely syntactic at write
  time; SSRF protection lives in section 5b below.
- No control characters, no whitespace, no `<`, no `>`, no backticks
  in the URL string after normalization.
- Length cap: 2048 characters. Reject longer.
- Each URL stored alongside an `originalText` field that preserves what
  the user pasted (audited). The rendered text is sanitized
  separately; the original is for audit only.

Rendering rules:

- Markdown body: rendered through an allowlist sanitizer with the
  schemes listed above. No inline HTML. No `style` attributes.
- Every external link is rendered as
  `<a href="..." rel="noopener noreferrer nofollow ugc" target="_blank">`.
- The full URL is shown on hover (title attribute) and is also visible
  in a small grey print under the link on desktop. This forestalls the
  "the visible text says one thing, the destination is something
  else" attack class. The hover text is `escapeHtml`-applied.
- For long URLs, truncate the visible part to 60 characters with an
  ellipsis but keep the full URL in the title attribute and in the
  `href`.

### 5b. Server-side URL preview (optional feature, SSRF-guarded)

If the team enables URL previews:

- The preview endpoint is admin-only and is feature-flag gated
  (`knowledge_url_preview_enabled`).
- Pre-fetch: parse the URL, resolve DNS A and AAAA records, refuse if
  any record falls inside the blocked CIDR list (see T4). Refuse
  redirects to those addresses on each hop, with a hop limit of 3.
- Use a separate egress identity (a network namespace or a dedicated
  outbound IP) if available; document otherwise.
- Hard timeouts: 5-second TCP connect, 10-second total wall clock.
- Body cap: 1 MB. Stop reading on cap.
- Content-Type allow-list for preview: `text/html`, `application/xhtml+xml`.
  Reject everything else.
- Strip everything except the `<title>` and `<meta name="description">`
  / `og:description` content. Sanitize per the rendering rules above.
- Cache the preview for 24 hours keyed by URL, so a malicious payload
  does not get refetched every render.

## 6. LLM structuring threat model

What the LLM call may include:

- Job title (already client-facing-but-internal data).
- Job description (may contain client names, IPs, free text).
- Work report text (may contain commands, error logs, IPs, hostnames).
- Free worker writeup (may contain anything from the worker's keyboard,
  including secrets pasted in mid-debug).

What the LLM call must never include unredacted:

- Passwords, API keys, tokens. Run the secrets scanner from T2 before
  building the prompt. Replace matches with `[REDACTED <kind>]`. The
  redaction map (which keys / values were redacted) is kept locally
  so the rendered draft can re-insert a placeholder reminder for the
  author, but the LLM never sees the cleartext.
- Government identifiers: `Teudat Zehut` (Israeli national ID, 9
  digits with checksum), client `taxId` (already a known field on the
  Client model). Pattern-match and redact.
- Email addresses other than the author's. The author may want to
  reference an internal address; everything else is replaced with
  `[email]`.
- Phone numbers in E.164 or local Israeli format (05x).
- Credit-card numbers (BIN + Luhn check). Should not appear, but if
  someone pastes one in error, redact it.
- IP addresses in private ranges (`10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`) are kept but flagged in the draft for the
  author to review; the LLM sees them so it can write coherent
  troubleshooting steps, but the audit log notes that private IPs
  were included.

Redaction policy:

- Apply redaction before assembling the prompt, not after the LLM
  responds. The redacted text is what is sent.
- Persist the unredacted source separately for the author's own
  reference, never for the LLM. The unredacted source row uses the
  same `visibility=admin_only` and `departmentScope=author's_dept`
  rules.
- The LLM output is treated as untrusted user input on the way back.
  Re-run sanitization and re-run the secrets scanner on the response
  before writing the draft.

Provider posture:

- The LLM provider must be configured for no training on customer data.
  This is an external setting in the provider console and must be
  verified before the feature flag is flipped. See section 11.
- The LLM call is logged: provider, model id, prompt length,
  response length, redaction count, latency. The body of the prompt is
  not logged. The audit row records action
  `knowledge.ai_structured`, entityId=articleId, diff_json showing
  `{ provider, model, redaction_counts }` only.
- A per-request id is generated client-side and returned in the
  response. Same id is added to the audit row, the LLM provider call
  log (if available), and the resulting draft, so a forensic event
  can be traced end to end.

Failure modes:

- The model returns nothing useful: status stays unchanged, the
  author edits manually, audit records `knowledge.ai_no_change`.
- The model emits suspect content (new URLs, code-fences, hostnames
  the source did not contain): the output is shown to the author with
  a per-line warning. Status stays `draft`. The author must click
  through a confirmation that says "this content was generated and
  has not been reviewed".
- The provider call fails or times out: the request returns 502 and
  the author keeps the unredacted source. No partial drafts.

## 7. Audit log requirements

Every state change writes a row. The existing `writeAudit` helper in
`lib/audit.ts` lines 40-58 is the right surface, called inside the
same `prisma.$transaction` so the audit row commits with the data
change.

Required audit actions for the knowledge module:

- `knowledge.created` (already exists in `lib/knowledge/queries.ts`
  line 173).
- `knowledge.updated` (already exists, line 269; extend `diff` to
  include `body` length only, never the body).
- `knowledge.published` (already exists, line 300).
- `knowledge.archived` (already exists, line 327).
- `knowledge.unpublished` (already exists, line 356).
- `knowledge.deleted` (already exists, line 376; rename to
  `knowledge.purged` after section 7 in the schema plan).
- `knowledge.tag_attached` (already exists, line 396).
- `knowledge.tag_detached` (already exists, line 412).
- New: `knowledge.submitted_for_review`.
- New: `knowledge.approved`.
- New: `knowledge.changes_requested`.
- New: `knowledge.visibility_changed`.
- New: `knowledge.scope_changed`.
- New: `knowledge.ai_structured`.
- New: `knowledge.ai_no_change`.
- New: `knowledge.ownership_transferred`.
- New: `knowledge.attachment_attached`.
- New: `knowledge.attachment_detached`.
- New: `knowledge.external_reference_added`.
- New: `knowledge.external_reference_verified`.
- New: `knowledge.purge_requested`.
- New: `knowledge.purge_confirmed`.

Diff redaction:

- The existing `REDACTED_FIELDS` set in `lib/audit.ts` lines 4-18 has
  passwords and tokens. Extend with `body`, `summary`, `externalUrl`,
  but only to mask the value. Length and field presence stay visible.
- For `knowledge.updated`, the diff entry for `body` is the literal
  `{ old: "(omitted, length=NNN)", new: "(updated, length=NNN)" }`
  (matches the existing pattern at `queries.ts` line 235). Same for
  `summary`.
- For external URLs added or changed, store the host only and the
  scheme, not the full path. Path could contain secrets.
- The action name is never redacted. Searching the audit log for
  `knowledge.published` must always work.

Immutability:

- The audit log table is append-only at the application layer. The
  database layer should also revoke `UPDATE` and `DELETE` from the
  application role on `audit_log`. Confirm with the DBA. If a row
  must be redacted for compliance reasons, the redaction is itself a
  new row.

## 8. Attachments

Knowledge articles will carry file attachments (screenshots, PDFs,
configuration snippets). Reuse the existing S3 layer.

Reuse:

- The attachments API at `app/api/attachments/route.ts` allocates an
  `Attachment` row, computes a storage key via `objectKeyFor` from
  `lib/storage/s3.ts` lines 150-156, signs a PUT URL (300-second TTL,
  line 107) and returns it. Knowledge uses the same call.
- Upload policy is in `lib/storage/upload-policy.ts`. MAX_BYTES is 50
  MB (line 7), allowed MIME prefixes include images, PDF, Office,
  text (lines 10-16). This is appropriate for knowledge attachments.
  No change needed.
- Visibility logic is in `lib/storage/attachments.ts`. The function
  `canReadAttachmentVisibility` (lines 11-17) gates `admin_only` to
  admins. The function `canDeleteAttachment` (lines 23-27) lets the
  uploader or any admin delete. We need a new link between an
  `Attachment` row and a `KnowledgeArticle` row, and a per-article
  ACL check before signing a GET URL.

Per-article ACL:

- When a download URL is requested, first run the same visibility
  predicate as `getArticleBySlug` (section 3) against the article that
  owns the attachment. If the article is not readable, return 404, not
  403, to avoid leaking the existence of the attachment.
- If the article is readable but the attachment row's own
  `visibility` is `admin_only`, fall through to the admin check.
- Use `presignDownload` from `lib/storage/s3.ts` lines 124-135 with a
  300-second TTL. Do not lengthen this. The shorter the TTL, the
  narrower the window where a leaked URL is usable.

Upload flow:

- Authoring an article and adding an attachment is one user action,
  two server calls. First the author POSTs to `/api/attachments`
  (which currently does not require article context, line 25) and
  receives a presigned URL. The browser uploads to S3. Then the
  author POSTs to a new `/api/knowledge/[slug]/attachments` route
  with the attachment id, which writes a join row and audits with
  `knowledge.attachment_attached`. Until the join row exists, the
  attachment is orphaned and not exposed via knowledge endpoints.
- Orphaned attachments older than 24 hours are reaped by a scheduled
  job. The reaper checks that no join row exists (knowledge, jobs,
  posts) before deleting from S3 and the `attachment` row. Audited.

Quotas:

- Max 25 attachments per article. Beyond that the route returns 409.
  Stops a runaway draft from filling S3.

## 9. Rate-limit posture

Reuse `lib/rate-limit.ts` (`checkRateLimit`, `getClientIp`,
`tooManyRequests`, `LIMITS`).

Knowledge-specific limits. Each is enforced per-user and per-IP, with
the tighter of the two windows winning:

| Route                                    | Per-user limit       | Per-IP limit          |
| ---------------------------------------- | -------------------- | --------------------- |
| `POST /api/knowledge` (create)           | 30 per hour          | 60 per hour           |
| `PATCH /api/knowledge/[slug]` (edit)     | 240 per hour (4/min) | 600 per hour          |
| `POST /api/knowledge/[slug]/submit`      | 30 per hour          | 60 per hour           |
| `POST /api/knowledge/[slug]/approve`     | 60 per hour (admin)  | 120 per hour          |
| `POST /api/knowledge/[slug]/publish`     | 30 per hour (admin)  | 60 per hour           |
| `POST /api/knowledge/[slug]/archive`     | 30 per hour (admin)  | 60 per hour           |
| `POST /api/knowledge/[slug]/ai-structure`| 5 per hour           | 20 per hour           |
| `POST /api/knowledge/url-preview`        | 30 per hour          | 60 per hour           |
| `POST /api/knowledge/[slug]/attachments` | 60 per hour          | 120 per hour          |

The AI-structure limit is the tightest because each call costs real
money and is the highest-impact for prompt-injection. The 5-per-hour
per-user cap is the headline; the IP cap (20) handles small offices
where four people share a NAT but does not turn into a free-for-all.

Implementation pattern matches the existing receipts module: the
route wraps its work in `checkRateLimit(key, opts)` early, before any
expensive logic, and returns `tooManyRequests()` on rejection. Keys
are namespaced: `knowledge:create:user:<id>`,
`knowledge:create:ip:<ip>`. Keys are independent so a normal user is
not burned by an IP-mate's burst, but a single user spinning up
multiple sessions on the same IP cannot get more total than the IP
cap allows.

The in-memory limiter described at `lib/rate-limit.ts` lines 5-10 is
fine for the pilot. The module note about replacing it with Redis for
multi-instance deployment is the right answer when we scale.

## 10. Privacy and GDPR-style considerations

Even though Israel's privacy regime is Privacy Protection Law (PPL)
rather than GDPR, the same patterns apply, and PPL Amendment 13
(2024-25) tightens the operational requirements. Personal data in
knowledge bodies will mainly take three forms:

- Client names, addresses, contact details (already in the Client
  model elsewhere; pasting them into a knowledge body duplicates).
- Employee names, sometimes contact details, in process docs.
- Free-form text from job descriptions and worker writeups, including
  whatever the worker felt was relevant.

Rules:

- Treat the article body as personal-data-bearing until proven
  otherwise. Apply retention rules accordingly.
- Right to be informed: the privacy notice for employees needs to say
  that internal documentation may contain their work activity for
  training purposes. Coordinate with HR for the wording.
- Right of access / right to correction: implementation is
  case-by-case for the pilot. Admins can search audit log and article
  bodies by employee name; if a request comes in, admins handle
  manually.
- Right to be forgotten interaction with immutable revision history:
  the revision history (proposed by the schema team) is part of the
  audit trail. PPL allows retention for legitimate purposes
  (operational integrity, security incident analysis) even after a
  deletion request. The policy is:
  - The latest version of a published article can be redacted (the
    employee's name replaced with `[name redacted]`).
  - Past revisions are not modified. They live in the revision table
    and are admin-only.
  - Audit log entries are not modified. The audit identifier (a UUID)
    is what survives; the diff entries are already redacted.
  - If a stronger claim is made (the subject is a former employee
    asserting their right), the admin runs the
    `knowledge.ownership_transferred` flow and an additional
    `knowledge.subject_redacted` ceremony that walks the revision
    table replacing only the named identifier in each row, leaving
    structure intact. This is documented as a manual procedure for
    the pilot.

- Cross-border transfer: the LLM provider may host the model outside
  Israel. PPL requires either (a) the destination jurisdiction
  provides adequate protection or (b) the data subject consents or
  (c) one of the statutory exemptions applies. Document the provider
  jurisdiction and the legal basis before flipping the gate in
  section 11.

- Minimization: the LLM redaction list above (section 6) is the
  practical implementation of data minimization. Do not send anything
  the model does not need.

## 11. Production gates for AI structuring

Mirror the receipts module's three-gate pattern, conceptually. The
receipts gate function `isCleanProductionIssuance` is at
`lib/compliance/gates.ts` lines 26-33, with the three checks
`envAllowsProductionIssuance`, `receipt_finalize_enabled`,
`pdf_watermark_disabled`. We need a parallel function for the LLM
call. Until all three are true, the LLM is not invoked against the
real provider.

Three gates for knowledge AI:

1. Env: `ALLOW_KNOWLEDGE_AI=true`. Set per-environment. Production
   only, never staging by accident. The env is read on each call
   (not cached at module-load) so flipping it does not require a
   restart.
2. Feature flag: `knowledge_ai_structuring_enabled = true` in the
   `feature_flags` table (`lib/feature-flags.ts`). The CTO flips it.
3. Feature flag: `knowledge_ai_provider_verified = true`. Distinct
   from the previous flag; this one requires a one-time human
   verification that:
   - The configured provider has training-on-user-data turned off in
     the provider console.
   - The provider's terms permit our use case.
   - The provider endpoint URL is in the env and points to the
     production endpoint, not staging.
   - The redaction list above (section 6) is current.
   The CEO and CTO both sign off in the provider audit doc before
   flipping this flag.

Until all three are true, calls to `/api/knowledge/[slug]/ai-structure`
return one of:

- 503 with `error: "AI structuring is not configured for production"`
  if env or `knowledge_ai_provider_verified` is false. The route does
  not call the provider.
- 200 with a stub draft and `metadata.mode = "dry-run"` if the
  `knowledge_ai_dry_run_enabled` flag is true; the stub copies the
  input verbatim and prepends a notice that the system is in dry-run
  mode. The audit row records action `knowledge.ai_dry_run`.

The dry-run mode is the parallel to the receipts watermark: a visible
in-content marker that the system is not in production mode. Every
draft produced in dry-run mode is stamped at the top with
`DRAFT (AI dry-run) - לא טיוטה מלאה`. The marker is added by the
draft writer, not the LLM, so an injected prompt cannot remove it.

Companion limits while gated:

- The route is admin-only until gate 1 and gate 3 are true.
  Self-serve for employees (matrix row "send to AI structuring,
  EMP_SAME") requires an additional flag `knowledge_ai_employee_self_serve = true`.
- The route emits a sentinel header `X-Knowledge-AI-Mode:
  dry-run|production|disabled` for the QA team to assert on.

## 12. Compliance gates for Israel

Concerns specific to operating from Israel and operating on Israeli
client data:

- Client tax IDs: under no circumstances may a `taxId` or
  `Teudat Zehut` field appear in a published article body. The
  secrets scanner catches generic patterns (T2). Add an Israeli ID
  pattern: 9-digit string with the legal Luhn-style checksum used by
  the Population Registry. Treat as personal data, redact at all
  three checkpoints (save, submit, publish).
- Client banking details: bank-account numbers, IBANs, SWIFT/BIC. Pattern
  match and redact; never publish.
- VAT numbers: a 9-digit Israeli VAT number is not personal data per
  se, but it is identifying for an osek-murshe. Allowed if the article
  is a `client_specific_runbook` and the related client is the
  subject; otherwise redact.
- Cross-border transfer: per section 10, the LLM provider needs to be
  cleared.
- Privacy Protection Law Amendment 13 (in force 2025-26): broadens
  enforcement powers and requires data minimization documentation.
  Two practical effects:
  - Document the data inventory: which fields the knowledge module
    handles, retention period, legal basis. The retention rules in
    section 4 cover this.
  - Document the access controls: this audit document is part of that
    record. Cite it in the privacy notice.
- Records retention for tax purposes: if an article is referenced as
  context for a billing decision, the tax-records retention rule
  (seven years for some categories) applies to the referenced
  article. Section 4's 90-day draft retention is fine; it is the
  published article and its revision history that may need long
  retention. Confirm with the accountant; placeholder open question
  in section 13.
- Right to interact in Hebrew: tag labels, status names, and error
  messages must be available in Hebrew. The schema already supports
  `labelHe` (Tag model). Wherever an error message is shown to an
  employee, it must have a Hebrew translation. Security errors (403,
  404 we use as 403, 429) are translated through the same i18n
  mechanism as the rest of the portal.

## 13. Open questions

1. Hard delete or purge-only? Section 7 (T7) argues for purge-only
   plus a tombstone, but the existing `DELETE` route in
   `app/api/knowledge/[slug]/route.ts` lines 79-103 is admin
   hard-delete. Confirm with CEO/CTO before deprecating.
2. CSRF posture: are cookies `SameSite=Lax` or stricter at the auth
   layer? Confirm with the auth team and add a CSRF token if not.
3. Two-person rule for purge: is a separate-admin requirement
   acceptable given the small admin pool (CEO + CTO)? If the CEO is
   on leave, who is the second admin? Document the fallback (e.g.
   any "delegate-admin" account is also acceptable).
4. SSRF egress isolation: do we have a separate egress IP or network
   namespace available for the URL-preview fetcher? If not, the
   pilot relies on application-layer DNS resolution + block-list,
   which is good but not bullet-proof. Decide before flipping the
   `knowledge_url_preview_enabled` flag.
5. LLM provider jurisdiction: which provider is the system targeting
   (Anthropic via AWS Bedrock in `eu-central-1`? Vertex AI in
   `europe-west`? Azure OpenAI in `swedencentral`?). Document the
   jurisdiction and the legal basis for transfer.
6. Retention for `incident_postmortem` drafts: longer than the
   default 90 days? CEO/CTO call.
7. Tax-records retention applied to knowledge: does an article that
   was cited in a billing decision need 7-year retention? Defer to
   the accountant; placeholder in section 12.
8. `published` to `published` edits: are admin edits to a published
   article re-published immediately (matrix row "edit published" is
   "allow" for admin), or do they always cycle through review? If
   the latter, add a `published_unpublished_temporarily` interim
   state and adjust the matrix.
