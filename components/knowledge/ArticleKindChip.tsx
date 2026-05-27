"use client";

import type { KnowledgeArticleType } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const KIND_STYLES: Record<KnowledgeArticleType, string> = {
  internal_task_lesson:   "bg-violet-50 text-violet-700 border-violet-200",
  external_reference:     "bg-blue-50 text-blue-700 border-blue-200",
  how_to_guide:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  troubleshooting_note:   "bg-amber-50 text-amber-700 border-amber-200",
  architecture_decision:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  process_policy_note:    "bg-slate-50 text-slate-700 border-slate-200",
};

interface Props {
  kind: KnowledgeArticleType;
  className?: string;
}

export function ArticleKindChip({ kind, className = "" }: Props) {
  const { t } = useT();
  const chipClass = KIND_STYLES[kind] ?? KIND_STYLES.how_to_guide;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`knowledge.kinds.${kind}`)}
    </span>
  );
}
