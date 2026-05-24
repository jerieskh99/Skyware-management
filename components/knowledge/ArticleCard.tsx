import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TagRow {
  tag: { id: string; key: string; labelEn: string; labelHe: string; colorHex: string | null };
}

interface Props {
  article: {
    slug: string;
    title: string;
    summary: string | null;
    status: string;
    visibility: string;
    updatedAt: Date | string;
    author: { id: string; displayName: string } | null;
    tags: TagRow[];
  };
  locale?: "en" | "he";
}

export function ArticleCard({ article, locale = "en" }: Props) {
  const updated =
    typeof article.updatedAt === "string"
      ? new Date(article.updatedAt)
      : article.updatedAt;
  return (
    <Link
      href={`/knowledge/${article.slug}`}
      className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-brand-soft group-hover:text-brand">
        <BookOpen className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{article.title}</p>
          {article.status !== "published" && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {article.status}
            </Badge>
          )}
          {article.visibility === "admin_only" && (
            <Badge variant="outline" className="text-[10px] uppercase">
              admin
            </Badge>
          )}
        </div>
        {article.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {article.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {article.author && <span>{article.author.displayName}</span>}
          <span aria-hidden>·</span>
          <time dateTime={updated.toISOString()}>
            {updated.toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
          </time>
          {article.tags.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <div className="flex flex-wrap gap-1">
                {article.tags.slice(0, 4).map((t) => (
                  <span
                    key={t.tag.id}
                    className="rounded-full border px-1.5 py-0.5"
                    style={
                      t.tag.colorHex
                        ? { borderColor: t.tag.colorHex, color: t.tag.colorHex }
                        : undefined
                    }
                  >
                    {locale === "he" ? t.tag.labelHe : t.tag.labelEn}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
