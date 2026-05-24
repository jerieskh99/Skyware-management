# Internal Pilot Launch Checklist — Skyware Internal Management Portal

**Type:** Internal pilot only. Not a public production launch.
**Audience:** Admin who deploys and first employees who test.

---

## Pilot Readiness Summary

The portal covers: job management, task hub, team communication, client registry, billing, statistics, admin panel. It has security headers, audit logging, rate limiting on password endpoints, user management, and a full production readiness guide.

**What is NOT ready for real use yet:**
- Receipt/tax document finalization (compliance hold; feature flag is off by default).
- Company legal details storage (placeholder UI only; no DB table yet).
- Multi-instance rate limiting (in-memory only; one server process required).
- Phase 7 Receipts module (stub page).

**Pilot scope:** Internal employees test job workflows, communication, hub, and time tracking. Admins test user management, billing entry, and statistics. No real client financial documents are finalized during the pilot.

---

## 1. Required Pre-Launch Blockers

All six items below are **mandatory before any real employee data enters the system**.

- [ ] All demo passwords changed (see Section 4)
- [ ] `NEXTAUTH_SECRET` set to a strong random value
- [ ] Seeded placeholder data removed or replaced
- [ ] `receipt_finalize_enabled` confirmed as `false`
- [ ] Production database configured with backups
- [ ] HTTPS configured and verified on the deployment URL

---

## 2. Environment Variables

Set these in the server environment or `.env` file on the deployment host. Never commit them to version control.

| Variable | Required | Action |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Point to production PostgreSQL. Format: `postgresql://USER:PASS@HOST:PORT/DB` |
| `NEXTAUTH_SECRET` | Yes | Generate: `openssl rand -base64 32` — must be at least 32 bytes |
| `NEXTAUTH_URL` | Yes | Set to the exact public URL, e.g. `https://portal.skyware.example.com` |

**Verify:**
```bash
# On the server, confirm the values are set:
printenv DATABASE_URL | head -c 30   # should show postgres://...
printenv NEXTAUTH_SECRET | wc -c     # should be > 40
printenv NEXTAUTH_URL                # should start with https://
```

- [ ] `DATABASE_URL` points to production PostgreSQL (not `localhost:5433`)
- [ ] `NEXTAUTH_SECRET` is 32+ bytes and random (not the development default)
- [ ] `NEXTAUTH_URL` uses `https://` and matches the actual URL exactly
- [ ] `.env` file is not committed to version control

---

## 3. Database Setup

### 3.1 Apply migrations
```bash
pnpm db:migrate:prod     # applies migrations without interactive prompt
```
- [ ] Migration ran successfully with no errors
- [ ] `pnpm exec prisma migrate status` shows "Database schema is up to date"

### 3.2 Seed reference data (roles, departments, channels, tags, feature flags)
```bash
pnpm db:seed
```
- [ ] Seed ran without errors
- [ ] Feature flags seeded — specifically `receipt_finalize_enabled` = false

### 3.3 Verify database connectivity
```bash
curl https://your-domain/api/health
# Expected: {"status":"ok","ts":"..."}
```
- [ ] Health endpoint returns `{"status":"ok"}` over HTTPS

---

## 4. Demo Data Cleanup

### 4.1 Remove or replace seeded placeholder clients
The seed inserts no real clients by default, but if any placeholder clients were added during development, remove them via Admin Panel → Clients, or via Prisma Studio (`pnpm db:studio`).

- [ ] No placeholder client records remain (or they are explicitly marked as test data)
- [ ] No placeholder billing items or payments remain
- [ ] No placeholder invoices or receipts remain

### 4.2 Remove development job/communication data
- [ ] Development test jobs deleted or archived
- [ ] Development communication posts deleted or clearly marked

---

## 5. User and Password Setup

### 5.1 Create real user accounts
Use Admin Panel → Users → Add user for each pilot participant.

Required fields: username, email, display name, temporary password, role, department.

- [ ] CEO/admin account created with a strong password
- [ ] CTO/admin account created with a strong password (if applicable)
- [ ] One account per pilot employee created
- [ ] Each account assigned the correct role (admin vs. employee) and department

### 5.2 Delete or deactivate demo accounts
The seeded demo accounts are: `admin.ceo`, `admin.cto`, `emp.helpdesk.1`, `emp.it.1`, `emp.rnd.1`.

Options:
- Deactivate them via Admin Panel → Users → Edit → uncheck Active.
- Or reset their passwords to something strong and only share with the appropriate person.

- [ ] All seeded demo accounts are deactivated OR their passwords are changed to something strong and private
- [ ] No account uses the password `changeme123`
- [ ] Each pilot user has received their credentials via a secure channel (not plaintext email)

### 5.3 Communicate the "change your password" requirement
Each user should change their password via Settings → Change password on first login.

- [ ] Pilot users briefed to change password on first login

---

## 6. Receipt Safety

This is the most important compliance item.

- [ ] Confirmed: `receipt_finalize_enabled` is `false` in Admin Panel → Feature Flags
- [ ] Confirmed: no one has enabled this flag
- [ ] Pilot users briefed: do not attempt to finalize receipts or tax documents during the pilot
- [ ] Accountant or legal review of receipt templates is **not yet done** — this is intentional for the pilot

**If any admin accidentally enables this flag during the pilot:**
1. Immediately disable it again via Admin Panel → Feature Flags.
2. Do not finalize any receipt that was drafted while the flag was on.
3. Contact an Israeli accountant before re-enabling.

- [ ] The above recovery procedure is known to all admins

---

## 7. HTTPS and Deployment

- [ ] The portal is served over HTTPS at the deployment URL
- [ ] SSL/TLS certificate is valid and not expired
- [ ] Navigating to the HTTP URL redirects to HTTPS (reverse proxy or host setting)
- [ ] `NEXTAUTH_URL` matches the HTTPS URL exactly (including trailing slash or lack thereof)
- [ ] `X-Frame-Options: DENY` header is visible in browser dev tools (verify one page)

**Quick header check:**
```bash
curl -I https://your-domain/api/health | grep -E "X-Frame|X-Content|Strict-Transport"
```

---

## 8. Backup and Restore

### 8.1 Take a baseline backup before users start
```bash
docker exec skyware_postgres pg_dump -U skyware skyware_management \
  > skyware_baseline_$(date +%Y%m%d_%H%M%S).sql
```

- [ ] Baseline backup taken and stored securely (off the server)
- [ ] Backup file is not zero bytes: `ls -lh skyware_baseline_*.sql`

### 8.2 Test the restore procedure
Before going live, test that you can restore from the backup on a separate server or local environment.

```bash
# On a test server or locally:
docker exec -i skyware_postgres psql -U skyware skyware_management < skyware_baseline_YYYYMMDD.sql
```

- [ ] Restore test completed successfully at least once
- [ ] Restore procedure is documented and known to at least one admin

### 8.3 Schedule ongoing backups
- [ ] Daily automated backup scheduled (cron, managed service, or CI job)
- [ ] Backup retention policy defined (recommended: 30 days minimum)
- [ ] Backup destination is off-server (S3, NAS, cloud storage)

---

## 9. Post-Deployment Smoke Tests

Run these manually after deployment, before inviting pilot users.

### 9.1 Auth and access
- [ ] `/login` loads and accepts `admin.ceo` login (or your new admin account)
- [ ] After login, redirected to `/dashboard`
- [ ] Logging out clears the session and redirects to `/login`
- [ ] An employee account cannot reach `/admin` (should redirect to `/dashboard`)
- [ ] An unauthenticated browser cannot reach `/dashboard` (should redirect to `/login`)

### 9.2 Core job flows
- [ ] Admin can create a job and assign it to an employee
- [ ] Employee can see their assigned job in My Jobs
- [ ] Employee can start a timer on a job
- [ ] Employee can transition job to Working On It → Done (with a work report)
- [ ] Admin can mark a completed job as Reviewed

### 9.3 Task hub
- [ ] Admin can create a job and send it to hub
- [ ] Employee can see it in the Task Hub for their department
- [ ] Employee can take the job

### 9.4 Communication
- [ ] Employee can post in the Global channel
- [ ] Employee cannot see or post in another department's channel (manual check)

### 9.5 Admin panel
- [ ] Admin can create a new user via Admin Panel → Users
- [ ] Admin can view the audit log
- [ ] Admin can see feature flags — `receipt_finalize_enabled` shows as Disabled
- [ ] Admin cannot enable `receipt_finalize_enabled` accidentally (confirmation dialog appears)

### 9.6 Billing (data entry only — no finalization)
- [ ] Admin can create a client
- [ ] Admin can add a monthly billing item to a client
- [ ] Admin can create a payment draft for a client
- [ ] Admin can mark a payment as Sent to Client

### 9.7 Health check
- [ ] `GET /api/health` returns `{"status":"ok"}` (can test in browser or curl)

---

## 10. Who Should Test First

**Phase 1 (admin only, 1–2 people, first 2 days):**
- One admin (CEO or CTO) runs through all the smoke tests above.
- Verify user creation, billing entry, audit log, and job management end-to-end.
- Identify any configuration issues before other employees log in.

**Phase 2 (small group, 3–5 people, days 3–7):**
- 1–2 admins + 2–3 employees from different departments.
- Employees test job assignment, hub take, timer, mark-done flow.
- Admins test creating and assigning jobs, reviewing completed jobs, communication.

**Phase 3 (all planned pilot users, week 2+):**
- Expand to full pilot group only after Phase 2 confirms no blocking issues.

---

## 11. What Feedback to Collect

Ask pilot users to record feedback on:

| Area | Questions |
|------|-----------|
| Login and navigation | Is the sidebar clear? Can you find what you need quickly? |
| Job creation | Is the form complete? Are departments and priorities clear? |
| Task hub | Do you understand the hub concept? Can you take tasks easily? |
| Timer | Does the timer bar work correctly? Does it count correctly? |
| Mark done | Is the work summary form clear? Does the time prefill correctly? |
| Communication | Is posting and replying intuitive? Do you see the right channels? |
| Billing (admins only) | Can you enter billing items without confusion? Are statuses clear? |
| Performance | Any pages that load slowly? |
| Bugs | Any errors, crashes, or wrong data shown? |
| Missing features | What can't you do that you expected to be able to do? |

**Feedback format:** A shared notes document or short Slack thread per area works for a small team. No formal survey tool is required for a pilot.

---

## 12. Go / No-Go Checklist

Review this before inviting employees to the system.

### Go criteria (all must be checked)
- [ ] All 6 pre-launch blockers resolved (Section 1)
- [ ] Smoke tests pass (Section 9)
- [ ] Baseline backup exists and restore was tested
- [ ] `receipt_finalize_enabled` is confirmed `false`
- [ ] All demo passwords changed; no account uses `changeme123`
- [ ] At least one admin can log in and reach the Admin Panel

### No-go criteria (if any apply, do not launch)
- [ ] Any demo password is still `changeme123`
- [ ] `NEXTAUTH_SECRET` is the development default or fewer than 32 bytes
- [ ] Portal is served over HTTP only (no HTTPS)
- [ ] `receipt_finalize_enabled` is `true`
- [ ] No backup exists
- [ ] Database still points to local Docker container on the developer's machine

---

**Pilot launch scope reminder:** During the pilot, avoid entering real client tax IDs, Israeli company registration numbers, or any data that would need to appear on a legally valid tax document. Those fields are marked as reference-only in the UI. Receipt finalization requires accountant sign-off before it can be enabled.
