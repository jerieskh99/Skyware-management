import type { KnowledgeArticleType } from "@prisma/client";
import { isAcceptableExternalUrl } from "./url";

/**
 * Knowledge submission validators.
 *
 * Rules sourced from `docs/knowledge-sprint-2026-05/knowledge_quality_control_plan.md`
 * §1.1 and §4. These run server-side at submit-for-review time (the
 * state-machine guard) - drafts can be partial.
 *
 * Pure functions; no I/O. The route handler maps issues to a 422 with the
 * issue list as the response body.
 */

export type ArticleValidationIssueCode =
  | "title_too_short"
  | "summary_too_short"
  | "body_too_short"
  | "no_tags"
  | "external_missing_url"
  | "external_missing_source"
  | "external_bad_url";

export interface ArticleValidationIssue {
  code: ArticleValidationIssueCode;
  message: string;
}

export interface SubmitValidationInput {
  title: string;
  summary: string | null;
  body: string;
  kind: KnowledgeArticleType;
  tagsCount: number;
  externalUrl: string | null;
  externalSource: string | null;
}

const TITLE_MIN = 8;
const SUMMARY_MIN = 40;

/**
 * Body word floor per article type. The plan calls for a generous floor
 * on operational types and a lighter touch on external references where
 * the URL carries the load.
 */
const BODY_WORD_FLOOR: Record<KnowledgeArticleType, number> = {
  external_reference: 40,
  internal_task_lesson: 80,
  how_to_guide: 200,
  troubleshooting_note: 80,
  architecture_decision: 150,
  process_policy_note: 150,
};

/** Count "words" by stripping fenced code blocks and whitespace-splitting. */
export function countBodyWords(body: string): number {
  const noCode = body.replace(/```[\s\S]*?```/g, " ");
  return noCode.split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Apply the submit-for-review validators. Returns a (possibly empty) array
 * of issues; callers pass that straight to the API error response.
 */
export function validateForSubmit(
  payload: SubmitValidationInput,
): ArticleValidationIssue[] {
  const issues: ArticleValidationIssue[] = [];

  const trimmedTitle = payload.title?.trim() ?? "";
  if (trimmedTitle.length < TITLE_MIN) {
    issues.push({
      code: "title_too_short",
      message: `Title must be at least ${TITLE_MIN} characters.`,
    });
  }

  const summary = payload.summary?.trim() ?? "";
  if (summary.length < SUMMARY_MIN) {
    issues.push({
      code: "summary_too_short",
      message: `Summary must be at least ${SUMMARY_MIN} characters.`,
    });
  }

  const wordCount = countBodyWords(payload.body ?? "");
  const floor = BODY_WORD_FLOOR[payload.kind];
  if (wordCount < floor) {
    issues.push({
      code: "body_too_short",
      message: `Body must contain at least ${floor} words for ${payload.kind} articles (current: ${wordCount}).`,
    });
  }

  if (!payload.tagsCount || payload.tagsCount < 1) {
    issues.push({
      code: "no_tags",
      message: "At least one tag is required before submitting for review.",
    });
  }

  if (payload.kind === "external_reference") {
    const url = payload.externalUrl?.trim() ?? "";
    const source = payload.externalSource?.trim() ?? "";
    if (url.length === 0) {
      issues.push({
        code: "external_missing_url",
        message: "External references require an external URL.",
      });
    } else if (!isAcceptableExternalUrl(url)) {
      // Catches `javascript:`, `data:`, malformed strings, etc.
      issues.push({
        code: "external_bad_url",
        message: "External URL must be a valid http(s) URL.",
      });
    }
    if (source.length === 0) {
      issues.push({
        code: "external_missing_source",
        message: "External references require an external source label (vendor, publication, etc.).",
      });
    }
  }

  return issues;
}

/** Convenience predicate: zero issues means ready to submit. */
export function isReadyToSubmit(payload: SubmitValidationInput): boolean {
  return validateForSubmit(payload).length === 0;
}
