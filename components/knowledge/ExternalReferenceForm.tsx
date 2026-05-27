"use client";

import { ArticleEditor } from "./ArticleEditor";

/**
 * Thin wrapper over `ArticleEditor` that locks the kind to
 * `external_reference`. Exists so the `/knowledge/new/external` page can
 * stay declarative and so future per-form copy diffs (placeholders,
 * required-field stars) can land here without touching ArticleEditor.
 */
export function ExternalReferenceForm() {
  return <ArticleEditor mode="create" lockedKind="external_reference" />;
}
