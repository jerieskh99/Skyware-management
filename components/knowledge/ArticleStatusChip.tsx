"use client";

import type { KnowledgeArticleStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const STATUS_STYLES: Record<KnowledgeArticleStatus, string> = {
  draft:          "bg-muted text-muted-foreground border-border",
  ai_structured:  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved:       "bg-blue-50 text-blue-700 border-blue-200",
  published:      "bg-green-50 text-green-700 border-green-200",
  archived:       "bg-muted text-muted-foreground/60 border-border line-through",
};

interface Props {
  status: KnowledgeArticleStatus;
  className?: string;
}

export function ArticleStatusChip({ status, className = "" }: Props) {
  const { t } = useT();
  const chipClass = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`knowledge.statuses.${status}`)}
    </span>
  );
}
