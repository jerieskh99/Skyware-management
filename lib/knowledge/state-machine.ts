import type { KnowledgeArticleStatus } from "@prisma/client";

/**
 * Knowledge article state machine.
 *
 * Encodes the forward/backward/lateral transitions enumerated in
 * `docs/knowledge-sprint-2026-05/knowledge_review_workflow.md` §1. The
 * machine is intentionally narrow: every API mutation that changes
 * `KnowledgeArticle.status` must route through one of these rules.
 *
 * The `who` axis is enforced by callers via `lib/knowledge/permissions.ts`;
 * this module only asserts the legality of the (from, to) edge. Splitting
 * it that way keeps the machine reusable from unit tests (no session needed)
 * and keeps the permissions doc the single source of truth on access.
 */

export type KnowledgeTransitionAction =
  | "ai_structure"
  | "reject_ai"
  | "submit_for_review"
  | "approve"
  | "request_changes"
  | "reject"
  | "publish"
  | "un_approve"
  | "archive"
  | "un_archive"
  | "rescind"
  | "re_verify"
  | "re_verify_diff";

/** Authorization tier required to fire a transition. */
export type TransitionWho = "admin" | "author" | "reviewer";

export interface TransitionRule {
  from: KnowledgeArticleStatus;
  to: KnowledgeArticleStatus;
  action: KnowledgeTransitionAction;
  /**
   * - `admin`: caller must have `isAdmin === true`.
   * - `author`: caller is either the article author or an admin.
   * - `reviewer`: caller is NOT the article author AND is either an admin
   *   or a seeded reviewer. Author-self-review is rejected by the
   *   permissions layer, not here.
   */
  who: TransitionWho;
}

export const ALLOWED_TRANSITIONS: ReadonlyArray<TransitionRule> = [
  // ----- Forward transitions -----
  { from: "draft", to: "ai_structured", action: "ai_structure", who: "author" },
  { from: "draft", to: "pending_review", action: "submit_for_review", who: "author" },
  {
    from: "ai_structured",
    to: "pending_review",
    action: "submit_for_review",
    who: "author",
  },
  // Author rejects the AI version of the draft and reverts to the raw text.
  // The structuring attempt remains in the audit log; the working state
  // simply rewinds. See `knowledge_review_workflow.md` §1 "ai_structured ->
  // draft".
  { from: "ai_structured", to: "draft", action: "reject_ai", who: "author" },
  { from: "pending_review", to: "approved", action: "approve", who: "reviewer" },
  // Reviewer-driven revert: "request changes" lands the article back as a draft.
  { from: "pending_review", to: "draft", action: "request_changes", who: "reviewer" },
  // Reviewer rejects outright. The article is archived (with a `rejected`
  // sub-status carried on the review row) per workflow doc §1
  // "pending_review -> archived (reject)". Authors can clone into a new
  // draft if they want to try again. This replaces the V0 path that sent
  // rejections back to `draft`, which conflated rejection with revision.
  { from: "pending_review", to: "archived", action: "reject", who: "reviewer" },
  { from: "approved", to: "published", action: "publish", who: "reviewer" },
  // Admin override: pull an approved-but-unpublished article back into review.
  { from: "approved", to: "pending_review", action: "un_approve", who: "admin" },
  // Standard takedown of a published article (or rescind, see actionFor heuristic).
  // The edge accepts both `archive` and `rescind` labels; the route handler
  // chooses which to write to audit based on whether a rescission note was
  // supplied.
  { from: "published", to: "archived", action: "archive", who: "admin" },
  // Re-verify path that produces non-trivial edits: the published article
  // returns to `pending_review` so a reviewer signs off on the new body.
  // See workflow doc §1 "published -> pending_review (re-verification
  // triggered edit)". The trivial-diff re-verify path bumps
  // `last_verified_at` in place without a state change and is not modeled
  // here.
  { from: "published", to: "pending_review", action: "re_verify_diff", who: "admin" },
  // Resurrect a wrongly-archived article back to draft.
  { from: "archived", to: "draft", action: "un_archive", who: "admin" },
];

/** Lookup map keyed by `from:to` to avoid linear scans in hot paths. */
const TRANSITION_INDEX: ReadonlyMap<string, TransitionRule> = new Map(
  ALLOWED_TRANSITIONS.map((rule) => [`${rule.from}:${rule.to}`, rule]),
);

function key(from: KnowledgeArticleStatus, to: KnowledgeArticleStatus): string {
  return `${from}:${to}`;
}

/** True iff `(from, to)` is one of the explicitly modeled transitions. */
export function isAllowedTransition(
  from: KnowledgeArticleStatus,
  to: KnowledgeArticleStatus,
): boolean {
  return TRANSITION_INDEX.has(key(from, to));
}

/** All statuses reachable in one transition from `from`. Stable order. */
export function nextStates(
  from: KnowledgeArticleStatus,
): KnowledgeArticleStatus[] {
  const out: KnowledgeArticleStatus[] = [];
  for (const rule of ALLOWED_TRANSITIONS) {
    if (rule.from === from) out.push(rule.to);
  }
  return out;
}

/**
 * Returns the action label that names the `(from, to)` transition, or
 * `null` if the edge is not allowed. `published -> archived` resolves to
 * `archive`; the `rescind` action is a UI distinction layered on top by
 * the route handler when the admin passes a rescission note.
 */
export function actionFor(
  from: KnowledgeArticleStatus,
  to: KnowledgeArticleStatus,
): KnowledgeTransitionAction | null {
  return TRANSITION_INDEX.get(key(from, to))?.action ?? null;
}

/** Returns the rule object for `(from, to)`, or `null` if disallowed. */
export function ruleFor(
  from: KnowledgeArticleStatus,
  to: KnowledgeArticleStatus,
): TransitionRule | null {
  return TRANSITION_INDEX.get(key(from, to)) ?? null;
}
