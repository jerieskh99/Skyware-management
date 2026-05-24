"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface Tag {
  id: string;
  key: string;
  labelEn: string;
  labelHe: string;
  colorHex: string | null;
  scope: string;
}

interface AttachedTag {
  tag: { id: string; key: string; labelEn: string; labelHe: string; colorHex: string | null };
}

interface Props {
  slug: string;
  attached: AttachedTag[];
  locale?: "en" | "he";
}

export function ArticleTagPicker({ slug, attached, locale = "en" }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [all, setAll] = useState<Tag[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data: Tag[]) => setAll(data))
      .catch(() => {/* silent */});
  }, []);

  const attachedIds = new Set(attached.map((a) => a.tag.id));
  const available = all.filter((tg) => !attachedIds.has(tg.id));

  function attach(tagId: string) {
    startTransition(async () => {
      await fetch(`/api/knowledge/${slug}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      router.refresh();
    });
  }

  function detach(tagId: string) {
    startTransition(async () => {
      await fetch(`/api/knowledge/${slug}/tags?tagId=${tagId}`, {
        method: "DELETE",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t("knowledge.tagsLabel")}</p>
      <div className="flex flex-wrap gap-1.5">
        {attached.map((a) => (
          <span
            key={a.tag.id}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
            style={
              a.tag.colorHex
                ? { borderColor: a.tag.colorHex, color: a.tag.colorHex }
                : undefined
            }
          >
            {locale === "he" ? a.tag.labelHe : a.tag.labelEn}
            <button
              type="button"
              onClick={() => detach(a.tag.id)}
              disabled={isPending}
              className="rounded-full p-0.5 hover:bg-accent"
              aria-label={t("common.delete")}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {attached.length === 0 && (
          <span className="text-[11px] text-muted-foreground">{t("knowledge.tagsEmpty")}</span>
        )}
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.slice(0, 12).map((tg) => (
            <button
              key={tg.id}
              type="button"
              onClick={() => attach(tg.id)}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3 w-3" />
              {locale === "he" ? tg.labelHe : tg.labelEn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
