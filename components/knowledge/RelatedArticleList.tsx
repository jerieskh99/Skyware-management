"use client";

import Link from "next/link";
import type { KnowledgeArticleStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

interface ReferenceRow {
  id: string;
  kind: string;
  referencedArticle: {
    id: string;
    slug: string;
    title: string;
    status: KnowledgeArticleStatus;
  };
}

interface Props {
  references: ReferenceRow[];
}

export function RelatedArticleList({ references }: Props) {
  const { t } = useT();
  if (references.length === 0) {
    return (
      <aside className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("knowledge.detail.summary.relatedHeading")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("knowledge.detail.summary.relatedEmpty")}
        </p>
      </aside>
    );
  }
  return (
    <aside className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("knowledge.detail.summary.relatedHeading")}
      </h2>
      <ul className="space-y-1.5">
        {references.map((r) => (
          <li key={r.id}>
            <Link
              href={`/knowledge/${r.referencedArticle.slug}`}
              className="block truncate text-sm hover:underline"
            >
              <span className="text-brand">{r.referencedArticle.title}</span>
              <span className="ms-2 text-[10px] uppercase text-muted-foreground">
                {r.kind}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
