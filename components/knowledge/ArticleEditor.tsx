"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";

type Visibility = "internal" | "admin_only";

interface InitialValues {
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  visibility: Visibility;
}

interface Props {
  mode: "create" | "edit";
  /** Required in edit mode. */
  initial?: InitialValues;
  /** Where to send the user on success. */
  redirectTo?: string;
}

export function ArticleEditor({ mode, initial, redirectTo }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    initial?.visibility ?? "internal",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("knowledge.editor.titleRequired"));
      return;
    }
    if (!body.trim()) {
      setError(t("knowledge.editor.bodyRequired"));
      return;
    }
    setError(null);

    startTransition(async () => {
      const url =
        mode === "create"
          ? "/api/knowledge"
          : `/api/knowledge/${initial!.slug}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || (mode === "edit" ? null : undefined),
          body: body.trim(),
          visibility,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("knowledge.editor.saveFailed"));
        return;
      }
      const next = await res.json().catch(() => null);
      const target =
        redirectTo ??
        (mode === "create" && next?.slug
          ? `/knowledge/${next.slug}`
          : `/knowledge/${initial?.slug ?? ""}`);
      router.push(target);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("knowledge.editor.title")}</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("knowledge.editor.summary")}</label>
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={400}
          placeholder={t("knowledge.editor.summaryPlaceholder")}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("knowledge.editor.body")}</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          maxLength={50_000}
          placeholder={t("knowledge.editor.bodyPlaceholder")}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          {t("knowledge.editor.bodyHint")}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("knowledge.visibility.label")}</label>
        <div className="flex gap-2">
          {(["internal", "admin_only"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              disabled={isPending}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                visibility === v
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {t(`knowledge.visibility.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("common.saving") : t("common.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
