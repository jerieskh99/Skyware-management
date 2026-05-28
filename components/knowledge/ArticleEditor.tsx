"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  KnowledgeArticleType,
  KnowledgeReliabilityTier,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

type Visibility = "internal" | "admin_only";

interface InitialValues {
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  whyItMatters?: string | null;
  visibility: Visibility;
  kind?: KnowledgeArticleType;
  reliabilityTier?: KnowledgeReliabilityTier;
  externalSource?: string | null;
  externalUrl?: string | null;
}

interface Props {
  mode: "create" | "edit";
  /** Required in edit mode. */
  initial?: InitialValues;
  /** Where to send the user on success. */
  redirectTo?: string;
  /**
   * For create mode: which kinds are allowed in the picker. If only one
   * is provided we hide the picker entirely. Defaults to the four
   * non-admin-only kinds; the parent page is responsible for narrowing
   * further when the caller is not an admin.
   */
  allowedKinds?: KnowledgeArticleType[];
  /** Lock the kind to one value (used by /knowledge/new/external). */
  lockedKind?: KnowledgeArticleType;
}

const DEFAULT_ALLOWED_KINDS: KnowledgeArticleType[] = [
  "how_to_guide",
  "internal_task_lesson",
  "troubleshooting_note",
  "external_reference",
  "architecture_decision",
  "process_policy_note",
];

const RELIABILITY_TIERS: KnowledgeReliabilityTier[] = [
  "verified",
  "validated",
  "single_source",
  "anecdotal",
];

export function ArticleEditor({
  mode,
  initial,
  redirectTo,
  allowedKinds = DEFAULT_ALLOWED_KINDS,
  lockedKind,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [kind, setKind] = useState<KnowledgeArticleType>(
    lockedKind ?? initial?.kind ?? allowedKinds[0] ?? "how_to_guide",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [whyItMatters, setWhyItMatters] = useState(initial?.whyItMatters ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    initial?.visibility ?? "internal",
  );
  const [reliabilityTier, setReliabilityTier] = useState<KnowledgeReliabilityTier>(
    initial?.reliabilityTier ?? (kind === "external_reference" ? "single_source" : "single_source"),
  );
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [externalSource, setExternalSource] = useState(initial?.externalSource ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isExternal = kind === "external_reference";

  function validateUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("knowledge.editor.titleRequired"));
      return;
    }
    if (!isExternal && !body.trim()) {
      setError(t("knowledge.editor.bodyRequired"));
      return;
    }
    if (isExternal) {
      if (!externalUrl.trim()) {
        setError(t("knowledge.newExternal.urlRequired"));
        return;
      }
      if (!validateUrl(externalUrl.trim())) {
        setError(t("knowledge.newExternal.urlInvalid"));
        return;
      }
      if (!summary.trim()) {
        setError(t("knowledge.newExternal.summaryRequired"));
        return;
      }
    }
    setError(null);

    startTransition(async () => {
      const url =
        mode === "create"
          ? "/api/knowledge"
          : `/api/knowledge/${initial!.slug}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const payload: Record<string, unknown> = {
        title: title.trim(),
        summary: summary.trim() || (mode === "edit" ? null : undefined),
        whyItMatters: whyItMatters.trim() || (mode === "edit" ? null : undefined),
        body: isExternal ? body.trim() || externalUrl.trim() : body.trim(),
        visibility,
        kind,
        reliabilityTier,
      };
      if (isExternal) {
        payload.externalUrl = externalUrl.trim();
        payload.externalSource = externalSource.trim() || null;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        // Duplicate URL: surface dedup toast with link to the existing
        // article. Canonical 409 shape is
        // `{ error: "duplicate_external_url", existing: { id, slug } }`.
        const body409 = (await res.json().catch(() => ({}))) as {
          existing?: { id?: string; slug?: string };
          error?: string;
        };
        const existingSlug = body409.existing?.slug;
        toast.push({
          tone: "error",
          title: t("knowledge.newExternal.dedupToast"),
          description: existingSlug ? `/knowledge/${existingSlug}` : undefined,
        });
        if (existingSlug) {
          router.push(`/knowledge/${existingSlug}`);
        }
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("knowledge.editor.saveFailed"));
        return;
      }
      const next = (await res.json().catch(() => null)) as { slug?: string } | null;
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
      {mode === "create" && !lockedKind && allowedKinds.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("knowledge.new.fields.kind")}</label>
          <div className="flex flex-wrap gap-2">
            {allowedKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                disabled={isPending}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  kind === k
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-input bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {t(`knowledge.kinds.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {t("knowledge.new.fields.title")}
          <span className="ms-1 text-destructive">*</span>
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={isPending}
        />
      </div>

      {isExternal && (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("knowledge.newExternal.fields.url")}
              <span className="ms-1 text-destructive">*</span>
            </label>
            <Input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              maxLength={2000}
              disabled={isPending}
              placeholder="https://"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("knowledge.newExternal.fields.externalSource")}
            </label>
            <Input
              value={externalSource}
              onChange={(e) => setExternalSource(e.target.value)}
              maxLength={120}
              disabled={isPending}
              placeholder={t("knowledge.newExternal.fields.externalSourcePlaceholder")}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {t("knowledge.new.fields.summary")}
          {isExternal && <span className="ms-1 text-destructive">*</span>}
        </label>
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={400}
          placeholder={t("knowledge.editor.summaryPlaceholder")}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {t("knowledge.new.fields.whyItMatters")}
        </label>
        <Textarea
          value={whyItMatters}
          onChange={(e) => setWhyItMatters(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder={t("knowledge.new.fields.whyItMattersPlaceholder")}
          disabled={isPending}
        />
      </div>

      {!isExternal && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("knowledge.new.fields.body")}
            <span className="ms-1 text-destructive">*</span>
          </label>
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
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("knowledge.new.fields.reliability")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RELIABILITY_TIERS.map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => setReliabilityTier(rt)}
                disabled={isPending}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  reliabilityTier === rt
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-input bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {t(`knowledge.reliability.${rt}`)}
              </button>
            ))}
          </div>
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
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

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
