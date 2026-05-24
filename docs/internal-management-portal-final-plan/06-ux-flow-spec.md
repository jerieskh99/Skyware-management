# UX Flow Spec

Step-by-step user flows.
One flow per section.

## 1. Admin dashboard flow

1. Admin logs in.
2. Lands on Dashboard.
3. Sees KPI strip at top.
4. Scans "Needs attention." Clicks a job.
5. Job detail opens. Admin reviews, may reassign or mark Reviewed.
6. Goes back. Scans "Aging payments."
7. Clicks an aging bucket. Billing page opens filtered to that bucket.
8. Marks the worst-aged payment Paid. Drawer opens.
9. Fills paid_date, method, reference, optional note.
10. Checks "Create receipt or tax document."
11. Saves. Routed to receipt draft with payment pre-filled.

## 2. Employee dashboard flow

1. Employee logs in.
2. Lands on Dashboard.
3. If a timer is paused, sees "Resume work" card. Clicks Resume. Timer ticks. Returns to dashboard.
4. Scans "Working on it." Clicks the top card.
5. Job detail opens. Reads comments. Adds a note. Clicks "Mark working" if not already.
6. Goes back. Scans "Available in your hub."
7. Clicks "Take task" on a card. Card moves out of hub into My Jobs.
8. Continues to "Communication highlights." Clicks a pinned post.
9. Reads, leaves a reply.

## 3. Job creation flow

### 3.1 Standard create (admin)

1. Admin clicks "Create job" anywhere it appears.
2. Form opens with fields: title, client (search), department, priority, severity, description, tags, billable, due_date optional.
3. Admin fills the form.
4. Admin chooses one of:
   - Assign to employee. Picks user.
   - Send to hub. Confirms scope.
5. Submits.
6. Job is created with status `assigned` or `available`.
7. JobStatusEvent written. AuditLog written.
8. Toast: "Job 2026-0037 created."
9. Optional follow-up: "Open job" link.

### 3.2 Create from email (admin)

1. Admin clicks "Create job from email" in the create-job menu.
2. Form has two large inputs: subject, body.
3. Admin pastes. Title prefills from subject. Description prefills from body.
4. Admin picks client and department.
5. Admin reviews and submits.
6. Job source is `email_manual`.

## 4. Job update flow

### 4.1 Mark working

1. Employee opens a job in `assigned` or `taken`.
2. Clicks "Mark working."
3. Optional timer prompt: "Start timer?" Default yes.
4. Status transitions to `working_on_it`. Timer starts if accepted.
5. JobStatusEvent written.

### 4.2 Pause and resume

1. Employee clicks "Pause."
2. Timer pauses.
3. The system does not transition the job's status unless the user chooses `waiting_for_client` or `waiting_for_admin`.

### 4.3 Add note

1. Employee opens a job.
2. Types a note in the inline note input.
3. Submits.
4. Note is recorded as a JobStatusEvent with the same `to_status` and a non-empty `note`.

### 4.4 Mark done

1. Employee clicks "Mark done."
2. Side sheet opens with:
   - Final summary text, required.
   - Total time spent, prefilled from timer sum.
   - Billable, yes by default.
   - Optional attachments.
3. Employee submits.
4. WorkReport written. Job status transitions to `done`. Timer stops.
5. AuditLog written.

### 4.5 Mark reviewed (admin)

1. Admin opens a job in `done`.
2. Clicks "Mark reviewed."
3. Small dialog. Optional admin note.
4. Confirms.
5. Job transitions to `reviewed`. AuditLog written.

### 4.6 Reopen

1. Admin or assignee opens a job in `done`.
2. Clicks "Reopen."
3. Status transitions to `working_on_it`. Event has `reopened = true`.

## 5. Task claiming flow

1. Employee opens the Hub.
2. Picks scope chip (Global or own department).
3. Scans cards.
4. Clicks "Take task" on a card.
5. The action sends a conditional update on status equals `available`.
6. On success, card animates out. Toast: "Task taken."
7. On loss to race, card disappears. Toast: "Already taken."

## 6. Communication flow

1. User opens Communication.
2. Picks a channel chip.
3. Scans recent posts.
4. Clicks a post.
5. Reads body and replies.
6. Types a reply. Optionally attaches a file.
7. Submits. Reply appears immediately.
8. The post author may click "Mark resolved" on their own post. Admins can do the same.
9. Optional: relate the post to a job via the related-job picker.

## 7. Client billing flow

1. Admin opens Clients.
2. Picks a client.
3. Opens the Billing tab.
4. Sees Monthly, Hourly Bank, One-time charges.
5. To set up a monthly plan: clicks "Add monthly plan." Fills fields. Saves.
6. To set up an hourly bank: clicks "Add hourly bank." Fills fields. Saves.
7. To record one-time charge: opens the Job, links a one-time charge to it.
8. Confirms.
9. Each setup creates a Payment row in the right state (e.g., draft or sent_to_client).

## 8. Mark paid to receipt placeholder flow

1. Admin opens Billing.
2. Filters by status or aging bucket.
3. Clicks a payment row to open the drawer.
4. Or clicks "Mark paid" in the row action.
5. Drawer opens with fields:
   - Paid date.
   - Method.
   - Reference (asmachta).
   - Optional note.
   - Checkbox: "Create receipt or tax document."
6. Admin fills the fields.
7. If checkbox is set, click Save routes to receipt draft with payment pre-filled.
8. Receipt draft page opens.
9. Verification banner is visible.
10. Admin selects a document type (e.g., Tax Invoice + Receipt).
11. Admin reviews description lines, VAT, total.
12. Admin selects the language (Hebrew, English, both).
13. Admin clicks Save as draft.
14. Admin clicks Finalize.
15. If `receipt_finalize_enabled` is false (production default), the click shows an info dialog: "Finalize is locked until accountant sign-off."
16. In a dev environment with the flag on, finalize allocates the next number and locks the document.
17. ReceiptDocument page now shows the finalized HTML view with the number.

## 9. Employee statistics flow

1. Admin opens Statistics.
2. Reads the dual-framing banner.
3. Applies filters: employee, department, client, tag, date range.
4. Picks bucketing: day, week, month.
5. Scans the per-employee section.
6. Scans the business section.
7. Optionally clicks Export CSV.
8. CSV downloads with the filtered data.

Employees see their own self-stats widgets on the Dashboard. The full Statistics page is admin-only at MVP.

## 10. Receipt draft to finalize flow (detailed)

1. Admin enters the Receipt draft.
2. Picks the document type.
3. Confirms client and source payment.
4. Edits description lines.
5. The system computes amount_before_vat, vat_amount, total_amount from the lines and `vat_rate_basis_points` field.
6. Admin picks the language.
7. Admin saves the draft.
8. Admin clicks Finalize.
9. The system checks the `receipt_finalize_enabled` feature flag.
10. If false in production, the request is refused with a friendly modal.
11. If true, the system opens a transaction:
    - SELECT FOR UPDATE on `ReceiptDocumentSequence(type, year)`.
    - Increment `next_number`.
    - Set `document_number` and `document_number_year` and `finalized_at` and `finalized_by_user_id` on the document.
    - Write an AuditLog entry `receipt.finalized`.
    - Commit.
12. The document becomes read-only.
13. The admin can download the HTML view.
14. The admin can navigate back to the source Payment, now linked to the receipt.

## 11. Search flow

1. User clicks the header search input or presses the keyboard shortcut.
2. Scope chips show: Jobs, Clients, Posts.
3. User types.
4. Results refresh per scope.
5. User picks a scope or presses Enter for all.
6. The system runs the full-text query scoped to user permissions.
7. Results render. Click navigates to the entity.

## 12. Saved view flow

1. User opens a list page.
2. Applies filters.
3. Clicks "Save view."
4. Dialog asks for a name.
5. Optional: admin checks "Share with team."
6. View saves.
7. Next visit, the dropdown shows the saved view.
8. URL reflects the filters when a view is loaded.

## 13. Responsive and mobile behavior

### 13.1 Layout adjustments
- Below tablet width, sidebar collapses into a bottom drawer.
- Tables become card lists.
- Right-side action panels become bottom sheets.

### 13.2 Key flows that must work on phone
- Login.
- See My Jobs.
- Take a task from the hub.
- Mark working, mark done.
- Add a note.
- Start, pause, stop timer.
- Read a post and reply.

### 13.3 Sticky elements on phone
- Bottom nav with Home, Jobs, Hub, Chat, Me.
- Timer bar pinned just above the bottom nav while a session is active.

### 13.4 Not required at MVP on phone
- Receipt drafting.
- Statistics page (admin uses desktop).
- Admin panel.
- Client environment tab.

## 14. Empty state copy guidance

- "No jobs assigned to you. Check the hub."
- "No tasks available in this hub right now."
- "No clients yet. Add your first."
- "No tax documents drafted yet."
- "No agent activity. The agent is offline."
- "No financial documents yet. Ingestion is not configured."

Empty states show the next action with a primary button.

## 15. Error state guidance

- 4xx response: inline banner. Suggest the fix.
- 5xx response: inline banner. "Something went wrong. Retry." plus a request id.
- Network offline: header banner. Hold writes until reconnect.

## 16. Toast and feedback conventions

- Success toast on every mutation: short, in past tense. "Job created." "Payment marked paid."
- Error toast on failure: short, with retry where possible.
- Idle warning when a timer runs without activity for the configured threshold.

## 17. Accessibility flows

- Keyboard navigation through sidebar, header, lists.
- Focus rings visible.
- Forms announce errors.
- Hebrew screen reader pass on each page before pilot.

## 18. RTL behavior

- Layout mirrors when language is Hebrew.
- Status bar, timer bar, drawers all flip side.
- Currency, numbers, percentages remain LTR-oriented inside RTL containers.
- Mixed Hebrew and English content uses `dir="auto"` on the container.

## 19. First-run experience (admin)

1. Admin logs in with seeded credentials.
2. Banner: "Welcome. Configure company details to enable receipts."
3. Routes through:
   - Company details.
   - SLA defaults.
   - Tags review.
   - Add first client (placeholder).
4. Admin invites teammates via Admin Panel.

## 20. First-run experience (employee)

1. Employee logs in.
2. Sees Dashboard with seeded help text.
3. Hub shows a "How tasks work" tip the first time.
4. Mark-done sheet shows tips on first save.
5. The settings page invites the user to pick language.

## 21. Long-running operations

- CSV exports stream and download immediately when small. Background job for large datasets is Phase 2.
- File uploads show progress.
- Search results stream as they arrive.

## 22. Notifications surface placeholder

At MVP there is no notification bell.
A status badge may appear on the sidebar for "Aging payments" once thresholds cross.
This is a visual cue, not a notification system.
