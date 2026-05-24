# UX and UI Review

The spec is comprehensive.
The interaction patterns need detail.

## 1. Design principles

These guide every page.

1. Show the next action above the fold.
2. Keep counts and badges meaningful, not decorative.
3. Use one density default. Compact and comfortable both okay.
4. Hebrew RTL must be tested per page, not added later.
5. Forms commit on submit, not on blur.
6. Destructive actions confirm. Reversible actions do not.
7. Every list has filter, sort, search, save view.
8. Every detail page has timeline, related items, actions.

## 2. Sidebar and navigation

### 2.1 Order

Employees see fewer items.
Admins see all.

Employee order: Dashboard, My Jobs, Hub, Department Jobs, Global Jobs, Communication, Settings.

Admin order: Dashboard, My Jobs, Hub, Department Jobs, Global Jobs, Communication, Clients, Billing, Receipts, Financial Documents, Statistics, Agent, Admin, Settings.

### 2.2 Visual hierarchy

- Operational items at the top.
- Money items in the middle.
- System items at the bottom.

### 2.3 Counters on items

- My Jobs shows active count.
- Hub shows available count for own scope.
- Communication shows unread or unresolved count.
- Billing shows overdue count for admins.

Counters update in real time or every 30 seconds.

### 2.4 Department channel link

Sidebar Communication expands inline.
Global pinned at top. Own dept below.
Admins see all four.

## 3. Header

### 3.1 Global search

- One input. Scoped chips on the right.
- Scope chips: Jobs, Clients, Posts, Documents, KB.
- Recent results show as the user types.
- Keyboard shortcut: slash key or cmd+K.

### 3.2 Notifications bell

- Unread count badge.
- Drop-down with last 10 items.
- "Mark all read" action.
- Phase 2 ships real items. MVP scaffold only.

### 3.3 Language toggle

- English and Hebrew.
- Persists per user.
- Triggers RTL on body element for Hebrew.

### 3.4 User menu

- Display name.
- Profile, Settings, Logout.

## 4. Dashboard layout

### 4.1 Employee dashboard

Top to bottom.

1. Status strip. Active jobs count. Overdue count. Hours this week.
2. "Working on it" cards. Pinned. Top.
3. "Assigned, not started" list.
4. "Available in your hub" cards. Max 5. Link to full hub.
5. "Communication highlights." Last 24 hours.
6. "Your week." Mini stats. Hours, jobs, reopened rate.

### 4.2 Admin dashboard

Top to bottom.

1. KPI strip. Active jobs. Delayed. Hours this month. Unpaid total.
2. "Needs attention." Jobs in `waiting_for_admin`.
3. "Aging payments." Buckets 0-30, 31-60, 61-90, 90+.
4. "Reviews pending." Jobs in `done` not yet `reviewed`.
5. "Hourly banks low." Clients near burnout.
6. "Recent client activity." Last 7 days.
7. "Risk this week." SLA breaches. Delayed urgents.
8. "Renewals next 60 days." Phase 2.

### 4.3 CEO vs CTO layout

Same dashboard for now.
Personalization via saved view in Phase 2.

## 5. Employee home screen

### 5.1 First three seconds

- The employee sees what to do next.
- A "Resume work" card if a timer is paused.
- A "Take next available" button when hub has work.

### 5.2 Below the fold

- All "Working on it" jobs.
- Communication highlights.

### 5.3 No surprises

- No unread tickets from other departments.
- No client billing data.

## 6. Admin home screen

### 6.1 First three seconds

- The admin sees what is at risk.
- One row of red and yellow flags.

### 6.2 Below the fold

- Money. Then ops. Then reviews.

### 6.3 Quick actions

- "Create job." Always visible.
- "Create client." Less prominent.
- "Mark a payment paid." Less prominent.

## 7. Job card layout

Used in lists and hubs.

### 7.1 Fields visible

- Title.
- Client. Logo placeholder if added later.
- Priority chip. Severity chip if added.
- Status chip with color.
- Age. Last update relative time.
- Assignee avatar.
- Tags. Max 3 shown. "+ more" overflow.
- SLA bar. Green to red gradient.
- Quick actions on hover: open, take, mark working, mark done.

### 7.2 Visual states

- Default.
- Mine. Subtle left-border accent.
- Delayed. Yellow background tint.
- Breached. Red border.
- Urgent. Red priority chip.
- Reopened. Tag visible.

### 7.3 Click target

- Whole card opens detail. Quick actions on hover only.

## 8. Job detail page

### 8.1 Layout

Two columns.

Left column. Main content.

- Title and breadcrumbs.
- Status chip and priority and severity chips.
- Tabs. Overview, Timeline, Related, Files.
- Overview: description, work summary, time spent, billable.
- Timeline: full status events with notes.
- Related: client, billing item, environment links, knowledge articles.
- Files: attachments.

Right column. Actions and meta.

- Buttons: Take, Mark working, Pause, Mark done, Mark reviewed.
- Active timer panel.
- Assignee with reassign control.
- Priority. Severity. Tags.
- SLA target and breach state.
- Client snapshot with shortcut to client page.
- Communication snippet linked to this job.

### 8.2 Mark done flow

A side sheet.

- Final summary text. Required.
- Time spent. Required. Prefilled from timer.
- Billable. Yes by default.
- Optional attachments.
- "Promote to KB" checkbox. Phase 2.

### 8.3 Mark reviewed flow

A small dialog.

- Admin note optional.
- CSAT placeholder. Phase 2.

## 9. Client detail page

### 9.1 Tabs

- Overview.
- Jobs.
- Billing.
- Payments.
- Receipts.
- Environment. Phase 2.
- Notes.

### 9.2 Overview content

- Header. Company name. Tax ID. Status chip.
- Contacts. Person, email, phone, address.
- Active monthly plan card.
- Hourly bank card with burn-rate bar.
- One-time charges summary.
- CSAT mini-trend. Phase 2.
- Last contact date.
- Effort vs revenue mini chart. Phase 2.

### 9.3 Burn-rate bar

- Visual. Green, yellow, red zones.
- Tooltip: hours remaining, projected runout date.
- Click jumps to Billing tab.

### 9.4 Environment tab

- Card list. One card per environment item.
- Each card: label, type, hosting, last touched.
- Credential reference link out to vault. No secrets.

## 10. Billing page

### 10.1 Top strip

- Total invoiced this month placeholder.
- Total unpaid placeholder.
- Total overdue placeholder.
- Aging buckets pill.

### 10.2 Tabs

- All payments.
- Monthly items.
- Hourly banks.
- One-time charges.
- Drafts.

### 10.3 Row layout

- Client. Source type. Amount placeholder. Currency.
- Issued date. Due date. Status chip.
- Quick actions: Mark sent, Mark paid, Open detail.

### 10.4 Mark-paid drawer

A side sheet, not a modal.

- Paid date. Method. Reference.
- Optional note.
- Checkbox: Create receipt or tax document.
- Save and continue.

## 11. Receipts page

### 11.1 Layout

- Tabs by type.
- Filters: client, date, status.
- Verification banner across the page until accountant sign-off.

### 11.2 Draft view

- Editable line items.
- Live total with VAT.
- "Finalize" button locked behind a confirm dialog.

### 11.3 Finalized view

- Read-only.
- Document number visible.
- "Download HTML" until PDF is ready.
- "Issue credit note" link for corrections.

## 12. Communication UX

### 12.1 Channel page

- Channel header. Members count. Pinned posts.
- Filter strip. Tags, author, date, related client, related job, resolved.
- Compose at top. Title plus body plus tags plus attachments.

### 12.2 Post card

- Title.
- Body excerpt.
- Author and timestamp.
- Tags.
- Replies count.
- Related-job badge.
- Resolved chip if applicable.

### 12.3 Post detail

- Full body markdown.
- Replies thread.
- Reply box at the bottom.
- "Mark resolved" action for admins and the original poster.
- "Convert to job" action. Phase 2.

### 12.4 Search

- Same scope chips as the global search.
- Persistent in URL.

## 13. Agent Control Center

### 13.1 Header

- Status badge. Offline by default.
- Quick description of purpose.

### 13.2 Sections

- Capabilities. Read-only list.
- Permissions. Matrix.
- Tasks handled. Empty.
- Logs. Empty.
- Controls. Disabled.
- Notes panel. Editable.

### 13.3 Visual cue

- Page is gray-tinted to make "not live" obvious.

## 14. Mobile and responsive

The Helpdesk uses phones in the field.
This is not optional.

### 14.1 MVP responsive behavior

- Sidebar collapses to a bottom drawer.
- Job cards stack.
- All list rows become cards.
- Mark working, mark done, take task are reachable with thumb.
- Active timer floats as a sticky bottom bar.

### 14.2 Phase 2 mobile work

- Quick-add job from phone.
- Push notification for SLA breach.
- Speech-to-text into job summary.

### 14.3 Not native

- No native app at MVP.
- A PWA install prompt is enough.

## 15. Empty states

Every list has a meaningful empty state.

- "No jobs assigned to you. Check the hub."
- "No clients yet. Add your first."
- "No tax documents drafted yet."
- "No agent activity yet. The agent is offline."

Empty states link to the next action.

## 16. Loading and error states

- Skeleton loaders for lists.
- Inline error banners with a "Retry" button.
- 403 returns the same empty-state UI to avoid leaking entity names.

## 17. Color, typography, density

- Match the public site palette.
- Inter or system font.
- Two density modes. Default comfortable.
- Status chip colors fixed across the app.
- Avoid color-only signals. Pair with text or icon.

## 18. Accessibility

- Tab order documented per page.
- Visible focus rings.
- ARIA labels on every icon button.
- WCAG AA target.
- Hebrew screen-reader pass before launch.

## 19. UX additions classified

| Idea | Verdict |
|------|---------|
| Global search bar with scope chips | Add to MVP |
| Saved filter views | Add to MVP |
| Active timer floating bar | Add to MVP |
| Burn-rate bar on client card | Add to MVP |
| SLA bar on job card | Add to MVP |
| Severity chip on job card | Add to MVP |
| "Resume work" prompt on dashboard | Add to MVP |
| Job side-sheet for mark done | Add to MVP |
| Side-sheet for mark paid | Add to MVP |
| Convert post to job action | Add to Phase 2 |
| Push notifications on mobile | Add later |
| Native app | Reject for now |
