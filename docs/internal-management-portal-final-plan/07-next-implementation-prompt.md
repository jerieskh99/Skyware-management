# Next Implementation Prompt

Copy the prompt below into a new Claude Code session.
Use Opus 4.7 for architecture and tricky logic. Switch to Sonnet 4.6 for repetitive scaffolding.

Confirm the suggested stack with the user before generating code.

Stack is confirmed. Use:
- Next.js 14+ App Router
- TypeScript strict
- Tailwind
- shadcn/ui
- PostgreSQL
- Prisma
- Auth.js unless there is a strong reason not to
- Zod
- React Query or SWR, choose whichever fits best
- bcryptjs or Argon2, choose the simpler reliable option
- pnpm
- Vitest, React Testing Library, Playwright

Do not stop to ask me to confirm the stack.
Start implementation now.
Complete Phase 0 and Phase 1 only.
Then stop for review before Phase 2.

--- Follow the token-efficiency rules in .claude/CLAUDE.md and .claude/rules.md.

## Prompt

```
Build the Skyware Internal Management Portal MVP.



Repository: /Users/jeries/Desktop/projects/Skyware-management
The repo currently has no application code. Only planning docs and .claude rules.

Authoritative sources, in priority order:
1. docs/internal-management-portal-final-plan/02-implementation-ready-spec.md  (behavior)
2. docs/internal-management-portal-final-plan/03-data-model-final.md           (schema)
3. docs/internal-management-portal-final-plan/04-mvp-build-plan.md             (scope, order, validation)
4. docs/internal-management-portal-final-plan/05-file-by-file-implementation-plan.md (layout)
5. docs/internal-management-portal-final-plan/06-ux-flow-spec.md               (flows)
6. docs/internal-management-portal-final-plan/01-accepted-scope.md             (decisions log)

The three original planning files in docs/ are historical context. The enhancement folder is also historical. When in conflict, the final-plan folder wins.

Stack (confirm with user before scaffolding):
- Next.js 14+ with App Router and TypeScript strict.
- Tailwind plus shadcn/ui. Reuse vocabulary from /Users/jeries/Desktop/projects/skyware-com (read-only reference).
- Postgres 15+.
- Prisma 5 ORM (preferred). Drizzle is an acceptable alternative.
- Auth.js (NextAuth) or Lucia. Pick one and explain.
- Zod for validation. React Query or SWR for client data.
- Argon2 or bcryptjs for password hashing.
- pnpm or npm.
- Vitest plus React Testing Library plus Playwright.

Hard constraints:
- Do NOT modify docs/internal-management-portal-spec.md, docs/internal-management-portal-data-model.md, docs/internal-management-portal-mvp-plan.md.
- Do NOT modify anything inside docs/internal-management-portal-enhancement/.
- Do NOT modify anything inside docs/internal-management-portal-final-plan/ except to add a build log if asked.
- Do NOT import code from /Users/jeries/Desktop/projects/skyware-com/. Visual reuse only via Tailwind classes and components.
- Do NOT touch .claude/CLAUDE.md or .claude/RULES.md.

Compliance and safety constraints:
- Receipt finalize endpoint must check feature flag receipt_finalize_enabled. Default false in production.
- A verification banner must be visible on every receipt page until the flag is enabled.
- Do not invent real client names, prices, tax IDs, or company numbers. Use placeholders.
- Never store passwords, vault items, OAuth tokens, or any secret belonging to clients or third parties.
- CredentialReference is Phase 2 and is a POINTER only when implemented.
- Audit log every mutating route inside the same transaction as the mutation.
- Permission enforcement happens at the API layer, not only the UI.
- All Israeli tax-document statements are placeholders. Mark "Needs accountant verification" in code comments where relevant.

MVP scope:
- Exactly the items in docs/internal-management-portal-final-plan/04-mvp-build-plan.md Section 2.
- Excluded: items in Section 3 of the same file.
- Build order: follow Section 4 phases.
- Validate against Section 5 checklist before declaring MVP complete.

What you should do first:
1. Read all six final-plan files end to end.
2. Propose the stack and confirm.
3. Scaffold the repo per docs/internal-management-portal-final-plan/05-file-by-file-implementation-plan.md.
4. Generate the Prisma schema from docs/internal-management-portal-final-plan/03-data-model-final.md Section 1.
5. Generate seed scripts from Section 8.
6. Implement Phase 0 and Phase 1 of the build plan.
7. Stop and request review before continuing to Phase 2.

Behaviors required from you:
- Build behind feature flags whenever a module is a placeholder.
- Use transactions for any mutation that writes AuditLog or numbering.
- Keep Hebrew RTL working on every page.
- Always set Asia/Jerusalem as display timezone.
- Show meaningful empty states.
- Add a loading state and an error state to every async surface.
- Write unit tests for: lifecycle transitions, permissions, SLA derivation, receipt numbering, aging buckets, burn-rate calculation.
- Write integration tests for the main mutating routes.
- Write end-to-end Playwright tests for: login, job creation, task take, mark working, mark done, mark reviewed, mark payment paid with create receipt, language switch to Hebrew.

If you encounter:
- A blocking unknown about Israeli compliance: stop. Ask the user. Do not guess.
- A blocking unknown about real prices or clients: use placeholders.
- A blocking unknown about the stack: stop. Ask the user.
- A request that violates the constraints above: refuse and explain.

Deliverables for this run:
- A working dev environment.
- A passing Prisma schema and migration.
- A seeded dev database.
- A working login.
- The portal shell with sidebar, header, language toggle, RTL pass.
- A health endpoint that returns 200.
- A short status update at the end summarizing what was built and what remains.

Style:
- Follow .claude/CLAUDE.md and .claude/RULES.md.
- Short sentences. No filler. No em-dashes. No emojis unless asked.
- Comment only where the why is non-obvious.
- Names over comments.
- Do not write planning documents in this session. The plan is already in docs/internal-management-portal-final-plan/.
```

---

## Notes for the operator

- Run the prompt in a fresh session so prior context does not bias decisions.
- Approve the stack proposal before any code is generated.
- After Phase 0 and Phase 1, review and approve before Phase 2.
- Repeat: review and approve at the end of every phase from `04-mvp-build-plan.md`.
- Real client data and Skyware legal details must not be entered into seed scripts. Only placeholders.
- Confirm an Israeli accountant is engaged before flipping `receipt_finalize_enabled` to true in production.

## What to ask the user before starting

- Confirm the stack proposal.
- Confirm default SLA hours per priority and severity (or accept the defaults in `02-implementation-ready-spec.md`).
- Confirm low-balance threshold for hourly banks (default 25 percent).
- Confirm hosting region preference for the dev environment.
- Confirm placeholder approach for the demo client list.

## What to revisit after Phase 10

- Resolve the blocking items listed in `README.md` of the final-plan folder.
- Engage the accountant for receipt template review.
- Schedule a Phase 2 planning session covering the items in `04-mvp-build-plan.md` Section 3 that move to Phase 2.
- Re-run a fresh enhancement pass once pilot feedback is in.
