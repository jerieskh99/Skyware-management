"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { ArticleKindChip } from "./ArticleKindChip";
import { ReviewDecisionDialog } from "./ReviewDecisionDialog";

interface ReviewQueueRowProps {
  row: {
    slug: string;
    title: string;
    kind: import("@prisma/client").KnowledgeArticleType;
    author: { id: string; displayName: string } | null;
    updatedAt: Date | string;
    createdAt: Date | string;
  };
  canDecide: boolean;
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  return `${dd}d`;
}

export function ReviewQueueRow({ row, canDecide }: ReviewQueueRowProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const updated =
    typeof row.updatedAt === "string" ? new Date(row.updatedAt) : row.updatedAt;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/20">
      <div className="min-w-0 flex-1">
        <Link
          href={`/knowledge/${row.slug}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {row.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <ArticleKindChip kind={row.kind} />
          {row.author && <span>{row.author.displayName}</span>}
          <span aria-hidden>·</span>
          <time dateTime={updated.toISOString()}>{timeAgo(updated)}</time>
        </div>
      </div>
      {canDecide && (
        <>
          <Button size="sm" onClick={() => setOpen(true)}>
            {t("knowledge.review.decideButton")}
          </Button>
          <ReviewDecisionDialog
            open={open}
            onOpenChange={setOpen}
            slug={row.slug}
            articleTitle={row.title}
          />
        </>
      )}
    </li>
  );
}
