# Production Readiness — Skyware Internal Management Portal

Date: 2026-05-16
Version: Phase 10 Hardening

---

## 1. Local Development Quick Start

```bash
# Prerequisites: Docker, Node.js >= 20, pnpm
npm install -g pnpm        # if not installed

# Clone and install
pnpm install

# Start database, run migrations, seed demo data
pnpm db:fresh              # = docker compose up + migrate + seed

# Start dev server
pnpm dev                   # http://localhost:3000
```

**Demo login (placeholder — change before pilot):**

| Role | Username | Password |
|------|----------|----------|
| Admin (CEO) | `admin.ceo` | `changeme123` |
| Admin (CTO) | `admin.cto` | `changeme123` |
| Helpdesk employee | `emp.helpdesk.1` | `changeme123` |
| IT employee | `emp.it.1` | `changeme123` |
| R&D employee | `emp.rnd.1` | `changeme123` |

**These are placeholder demo credentials. Change all passwords before pilot.**

---

## 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in all values.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Example: `postgresql://user:pass@localhost:5433/skyware_management` |
| `NEXTAUTH_SECRET` | Yes | Random 32-byte secret for JWT signing. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes (production) | Full public URL of the portal, e.g. `https://portal.skyware.example.com`. |

**Never commit `.env.local` to version control.**

---

## 3. Database Scripts

| Script | Action |
|--------|--------|
| `pnpm db:up` | Start Postgres Docker container |
| `pnpm db:down` | Stop and remove container |
| `pnpm db:migrate` | Apply pending Prisma migrations (dev) |
| `pnpm db:migrate:prod` | Apply migrations without prompt (production/CI) |
| `pnpm db:seed` | Insert or update fixture + demo data |
| `pnpm db:generate` | Regenerate Prisma client after schema changes |
| `pnpm db:studio` | Open Prisma Studio UI |
| `pnpm db:reset` | Drop and recreate schema, re-seed (DESTROYS DATA) |
| `pnpm db:fresh` | `db:up` + `db:migrate` + `db:seed` |

---

## 4. Database Backup and Restore

The project uses PostgreSQL 16. Backup using `pg_dump` from inside or outside the Docker container.

**Backup:**
```bash
# From host (Docker container named skyware_postgres per docker-compose.yml)
docker exec skyware_postgres pg_dump -U skyware skyware_management > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Restore:**
```bash
docker exec -i skyware_postgres psql -U skyware skyware_management < backup_file.sql
```

**Docker Compose volume:**
Data is stored in a named Docker volume (`skyware-postgres-data`). The volume persists across `docker compose down` but is removed by `docker compose down -v`.

**Production recommendation:**
- Schedule daily automated `pg_dump` to persistent storage (S3, NAS, etc.).
- Test restore procedure quarterly.
- Retain at least 30 days of backups.

---

## 5. Production Deployment Checklist

### Before pilot launch

- [ ] Change all demo passwords (see Section 1).
- [ ] Set `NEXTAUTH_SECRET` to a strong random value.
- [ ] Set `NEXTAUTH_URL` to the production domain.
- [ ] Configure `DATABASE_URL` to point to a managed/production PostgreSQL instance.
- [ ] Run `pnpm db:migrate:prod` instead of `pnpm db:migrate`.
- [ ] Verify HTTPS is configured on the production URL (HSTS header is already sent).
- [ ] Remove or replace seeded placeholder clients and employee data.
- [ ] Review feature flags in Admin Panel → Feature Flags:
  - `receipt_finalize_enabled` **must remain false** until accountant sign-off.
  - `financial_documents_module` — enable only when the module is built.
  - `agent_control_center_module` — enable only when the agent is provisioned.
- [ ] Verify no real Israeli tax IDs, company numbers, or billing rates are stored.
- [ ] Conduct a restore drill from backup.

### Before receipt/billing go-live

- [ ] Have an Israeli accountant verify:
  - VAT rate (`vatRateBasisPoints` default is 1800 = 18% — verify current legal rate).
  - Document type labels (חשבונית מס קבלה etc.).
  - Allocation number (ספרת אסמכתא) requirements.
  - Numbering sequence (must be monotonic and gap-free per Israeli tax law).
- [ ] Add company legal details (company name, ח.פ., VAT number, address) via Admin Panel → Company Details when that section is implemented.
- [ ] Only enable `receipt_finalize_enabled` after accountant written sign-off.
- [ ] Test receipt draft generation with placeholder data before enabling finalization.

---

## 6. Security Headers

Security headers are set in `next.config.ts` for all routes:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

**Content-Security-Policy (CSP) is deferred.** Implementing CSP correctly for Next.js App Router requires per-request nonce injection, which adds complexity. Implement for Phase 11 / pre-production audit. Until then, `X-Content-Type-Options` and `X-Frame-Options` provide the most critical protections.

---

## 7. Rate Limiting

A simple in-memory rate limiter is applied to password change and reset endpoints:

| Endpoint | Limit |
|----------|-------|
| `POST /api/users/me/password` | 5 requests per 15 min per IP |
| `POST /api/admin/users/[id]/password` | 5 requests per 15 min per IP |

**Limitation:** The in-memory rate limiter resets on server restart and is **not shared across multiple processes or instances**. For production deployments with multiple server instances or serverless environments (Vercel, Docker replicas), replace `lib/rate-limit.ts` with a Redis-backed solution:

```
pnpm add @upstash/ratelimit @upstash/redis
```

See [Upstash Rate Limit](https://github.com/upstash/ratelimit) for a drop-in replacement pattern.

The NextAuth login endpoint (`/api/auth/[...nextauth]`) is handled by the next-auth library and is not rate-limited by this codebase. For production, add rate limiting at the reverse proxy (nginx, Caddy) or use a WAF.

---

## 8. Known Placeholders and Feature Flags

| Item | Status | Notes |
|------|--------|-------|
| Receipt finalization | Placeholder — `receipt_finalize_enabled: false` | Needs accountant sign-off |
| Israeli company details | Placeholder (not stored) | Needs `CompanySettings` DB table |
| SLA defaults | Hardcoded in `lib/sla.ts` | Edit requires code change |
| Financial Documents ingestion | Feature-flagged off | No email/IMAP connection exists |
| Agent Control Center | Feature-flagged off | No autonomous code exists |
| Attachment file uploads | Schema-ready, no upload infrastructure | Deferred |
| CSV export (Statistics) | Not implemented | Deferred |
| Saved views (billing/jobs/clients) | URL-based filters only | Deferred |
| Email change for users | Not in admin UI | Deferred |

All amounts in billing (`*Placeholder` fields) are reference figures only and are not verified accounting values.

---

## 9. Test Coverage

| Suite | Count | What is tested |
|-------|-------|----------------|
| `tests/unit/lifecycle.test.ts` | 18 | Job status transition rules |
| `tests/unit/permissions.test.ts` | 24 | All permission helper functions |
| `tests/unit/sla.test.ts` | 14 | SLA target derivation and state |
| `tests/unit/billing-permissions.test.ts` | 30 | Billing/receipt permissions + admin-only page access |
| `tests/unit/audit-redaction.test.ts` | 8 | Audit log sensitive-field redaction |
| `e2e/login.spec.ts` | 5 | Login, redirect, health check |
| `e2e/admin-access.spec.ts` | ~15 | Admin/employee page access gates (needs live server) |

Run unit tests: `pnpm test`
Run e2e tests (requires live server + seeded DB): `pnpm db:fresh && pnpm dev` then `pnpm test:e2e`

---

## 10. Pilot Launch Blockers

These items **must** be resolved before the portal handles real client data:

1. **Change all demo passwords** — `changeme123` is for development only.
2. **Set a strong `NEXTAUTH_SECRET`** — the seeded default is not production-safe.
3. **Replace seeded placeholder data** — no real client names, billing rates, or employee details should remain.
4. **Accountant sign-off before enabling receipt finalization** — `receipt_finalize_enabled` stays `false`.
5. **HTTPS in production** — HSTS header is sent but only effective over HTTPS.
6. **Production database with backups** — do not run on the local Docker container.

After resolving all blockers: flip `receipt_finalize_enabled` to `true` only after accountant written verification.

---

## 11. Monitoring and Observability

Not yet implemented. For production consideration:

- Application error tracking: Sentry, Highlight.io, or similar.
- Database query monitoring: PgHero, pganalyze, or built-in Prisma metrics.
- Uptime monitoring: UptimeRobot, BetterUptime, or similar.
- Health endpoint: `GET /api/health` returns `{ status: "ok" }`.
