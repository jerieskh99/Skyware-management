import type { KnowledgeArticleStatus, KnowledgeArticleType } from "@prisma/client";
import { isAdmin, type SessionUser } from "@/lib/permissions";

/**
 * Knowledge module permission predicates.
 *
 * Mirrors the permissions matrix in
 * `docs/knowledge-sprint-2026-05/knowledge_security_permissions_audit.md` §2.
 * Each predicate is pure: same inputs, same answer, no I/O. They are the
 * single source of truth for the API route guards.
 *
 * The hard rule "author cannot review own work" is enforced inside
 * `canReview`. UI elements that hide a button when the user cannot use
 * it MUST still call the same predicate server-side; UI is a hint, not
 * a guarantee.
 */

interface ArticleAuthor {
  authorUserId: string;
}

interface ArticleAuthorStatus extends ArticleAuthor {
  status: KnowledgeArticleStatus;
}

interface ArticleKindStatus {
  kind: KnowledgeArticleType;
  status: KnowledgeArticleStatus;
}

interface JobShape {
  assignedEmployeeId: string | null;
  status: string;
}

/** Statuses where the author may still edit the body (draft-side). */
const AUTHOR_EDITABLE: ReadonlySet<KnowledgeArticleStatus> = new Set([
  "draft",
  "ai_structured",
]);

/** Anyone signed in can create a draft article. Admin-only kinds checked elsewhere. */
export function canCreateArticle(user: SessionUser): boolean {
  // Per the matrix, all signed-in users may author drafts (the
  // "create in own department scope" row). Admin-only kinds (e.g. a
  // process_policy_note) are filtered downstream by the kind selector
  // in the editor; the route validates with `canCreateKindAs`.
  return Boolean(user?.id);
}

/** Author may edit only while the article is in an author-editable status. */
export function canEditDraft(
  user: SessionUser,
  article: ArticleAuthorStatus,
): boolean {
  if (isAdmin(user)) return true;
  if (article.authorUserId !== user.id) return false;
  return AUTHOR_EDITABLE.has(article.status);
}

/** Submit-for-review is author-only (or admin) and only from draft / ai_structured. */
export function canSubmitForReview(
  user: SessionUser,
  article: ArticleAuthorStatus,
): boolean {
  if (isAdmin(user)) return true;
  if (article.authorUserId !== user.id) return false;
  return article.status === "draft" || article.status === "ai_structured";
}

/**
 * Reviewer guard. Per the matrix and §1 of the review workflow:
 * - Reviewer must NOT be the article's author.
 * - For V1, only admins can review (the matrix lists `deny` for
 *   employees on `approve` / `request_changes`). Phase 2 will add the
 *   senior-employee opt-in.
 * - The article must currently be in `pending_review`.
 */
export function canReview(
  user: SessionUser,
  article: ArticleAuthorStatus,
): boolean {
  if (article.status !== "pending_review") return false;
  if (article.authorUserId === user.id) return false;
  return isAdmin(user);
}

/** Publish requires admin in V1; reviewer who approved can also publish (Phase 2 expands). */
export function canPublish(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canArchive(user: SessionUser): boolean {
  return isAdmin(user);
}

/** Rescind is a stronger archive. Admin-only and audited separately. */
export function canRescind(user: SessionUser): boolean {
  return isAdmin(user);
}

/**
 * Re-verify is the "still applicable" or freshness-bump action. Available
 * to anyone in V1 for `external_reference` / `troubleshooting_note` /
 * `how_to_guide` (any employee who has actually re-checked the link or
 * tried the steps), and only on published articles. Admins always.
 */
export function canReVerify(
  user: SessionUser,
  article: ArticleKindStatus,
): boolean {
  if (article.status !== "published") return false;
  if (isAdmin(user)) return true;
  return (
    article.kind === "external_reference" ||
    article.kind === "troubleshooting_note" ||
    article.kind === "how_to_guide"
  );
}

/**
 * AI structuring is author-only and only from `draft`. Per §11 of the
 * security audit, the three-gate flag check happens inside
 * `lib/knowledge/ai-structure.ts`; this predicate gates the user-facing
 * route handler.
 */
export function canRunAiStructure(
  user: SessionUser,
  article: ArticleAuthorStatus,
): boolean {
  if (isAdmin(user)) {
    // Admins can structure on behalf of an author (e.g. helping with onboarding)
    // but only on a draft.
    return article.status === "draft";
  }
  if (article.authorUserId !== user.id) return false;
  return article.status === "draft";
}

/**
 * "Create a knowledge article from this job" gate. The job must be in
 * the right shape (work has actually been done) and the caller must
 * either be the assignee, an admin, or have read access to the job.
 *
 * The caller is responsible for confirming read access via
 * `lib/permissions.ts#canReadJob`; this predicate adds the
 * knowledge-side rule on top.
 */
export function canCreateFromJob(
  user: SessionUser,
  job: JobShape,
): boolean {
  if (isAdmin(user)) return true;
  if (job.assignedEmployeeId !== user.id) return false;
  // The author of the lesson must have actually finished the work. Allow
  // the "done" and "reviewed" terminal states per the review workflow.
  return job.status === "done" || job.status === "reviewed";
}

/**
 * Kind-specific create gate. Some kinds are admin-authored only per the
 * security audit §2 article-type overrides:
 *   - `process_policy_note`: admin-only authoring.
 *   - `architecture_decision`: admin-only authoring (high org weight).
 * The others are open to any signed-in user.
 */
export function canCreateKindAs(
  user: SessionUser,
  kind: KnowledgeArticleType,
): boolean {
  if (isAdmin(user)) return true;
  if (kind === "process_policy_note") return false;
  if (kind === "architecture_decision") return false;
  return true;
}

/** Hard delete is admin-only and used sparingly per §7 (purge). */
export function canHardDelete(user: SessionUser): boolean {
  return isAdmin(user);
}
