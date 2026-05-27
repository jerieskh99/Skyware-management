"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

/**
 * Side-by-side review of the LLM-structured output vs the original
 * rawInputSnapshot. On Accept we PATCH the article body / summary /
 * whyItMatters with the structured output. On Reject we just navigate
 * away; the snapshots stay around in case the author wants another pass.
 *
 * Snapshot shape: the AI structuring lib writes `{ title?, summary?,
 * body?, whyItMatters? }` (and whatever else the prompt yields). We
 * only consume the four fields above.
 */
interface StructuredShape {
  title?: string;
  summary?: string;
  body?: string;
  whyItMatters?: string;
}

interface Props {
  slug: string;
  rawInput: string | null;
  structured: unknown;
}

function readStringField(obj: unknown, key: keyof StructuredShape): string | undefined {
  if (obj === null || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

export function AiStructureReviewer({ slug, rawInput, structured }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const title = readStringField(structured, "title");
  const summary = readStringField(structured, "summary");
  const body = readStringField(structured, "body");
  const whyItMatters = readStringField(structured, "whyItMatters");

  function accept() {
    setError(null);
    startTransition(async () => {
      const payload: Record<string, unknown> = {};
      if (title) payload.title = title;
      if (summary !== undefined) payload.summary = summary;
      if (body !== undefined) payload.body = body;
      if (whyItMatters !== undefined) payload.whyItMatters = whyItMatters;

      const res = await fetch(`/api/knowledge/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.ai.acceptSuccess") });
      router.push(`/knowledge/${slug}`);
      router.refresh();
    });
  }

  function reject() {
    router.push(`/knowledge/${slug}`);
  }

  if (!structured) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        {t("knowledge.ai.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("knowledge.ai.drySetNote")}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("knowledge.ai.sideBySideHeading.original")}
          </h2>
          <pre
            className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed"
            dir="auto"
          >
            {rawInput ?? "—"}
          </pre>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("knowledge.ai.sideBySideHeading.structured")}
          </h2>
          <div className="max-h-[60vh] space-y-3 overflow-auto text-sm">
            {title && (
              <Field label={t("knowledge.new.fields.title")} value={title} />
            )}
            {summary !== undefined && (
              <Field label={t("knowledge.new.fields.summary")} value={summary} />
            )}
            {whyItMatters !== undefined && (
              <Field
                label={t("knowledge.new.fields.whyItMatters")}
                value={whyItMatters}
              />
            )}
            {body !== undefined && (
              <Field label={t("knowledge.new.fields.body")} value={body} multiline />
            )}
          </div>
        </section>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={accept} disabled={isPending}>
          <Check className="me-1.5 h-3.5 w-3.5" />
          {isPending ? t("common.working") : t("knowledge.ai.accept")}
        </Button>
        <Button variant="outline" onClick={reject} disabled={isPending}>
          <X className="me-1.5 h-3.5 w-3.5" />
          {t("knowledge.ai.reject")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {multiline ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed" dir="auto">
          {value}
        </pre>
      ) : (
        <p className="text-sm" dir="auto">
          {value}
        </p>
      )}
    </div>
  );
}
