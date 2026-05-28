/**
 * Stable audit action codes for the Knowledge module.
 *
 * Centralized so:
 *   1. Wave 2B API route handlers can import the constant rather than typing
 *      a string literal (and risking a typo).
 *   2. Search tools (`grep "knowledge\\."` in the audit log table) have a
 *      single, exhaustive list to grep against.
 *
 * The action keys are stable forever; existing rows reference them. Adding
 * a new action is fine; renaming or removing one is a migration concern.
 */

export const KNOWLEDGE_AUDIT_ACTIONS = {
  ARTICLE_CREATED: "knowledge.article.created",
  ARTICLE_UPDATED: "knowledge.article.updated",
  ARTICLE_DELETED: "knowledge.article.deleted",
  ARTICLE_AI_STRUCTURED: "knowledge.article.ai_structured",
  ARTICLE_SUBMITTED_FOR_REVIEW: "knowledge.article.submitted_for_review",
  ARTICLE_REVIEW_DECIDED: "knowledge.article.review_decided",
  ARTICLE_REVIEW_ASSIGNED: "knowledge.article.review_assigned",
  ARTICLE_PUBLISHED: "knowledge.article.published",
  ARTICLE_UN_APPROVED: "knowledge.article.un_approved",
  ARTICLE_ARCHIVED: "knowledge.article.archived",
  ARTICLE_RESCINDED: "knowledge.article.rescinded",
  ARTICLE_UN_ARCHIVED: "knowledge.article.un_archived",
  ARTICLE_RE_VERIFIED: "knowledge.article.re_verified",
  ARTICLE_REVISION_CREATED: "knowledge.article.revision_created",
  ARTICLE_LINK_HEALTH_CHECKED: "knowledge.article.link_health_checked",
  ARTICLE_FRESHNESS_FLAGGED: "knowledge.article.freshness_flagged",
  ARTICLE_TAG_ATTACHED: "knowledge.article.tag_attached",
  ARTICLE_TAG_DETACHED: "knowledge.article.tag_detached",
} as const;

export type KnowledgeAuditAction =
  (typeof KNOWLEDGE_AUDIT_ACTIONS)[keyof typeof KNOWLEDGE_AUDIT_ACTIONS];
