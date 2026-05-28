"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EmailTemplateKind } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface EmailTemplateRow {
  id: string;
  kind: EmailTemplateKind;
  name: string;
  subjectEn: string;
  bodyEn: string;
  subjectHe: string;
  bodyHe: string;
  variableNotes: string | null;
  updatedAt: string | Date;
}

/** Template variables the renderer understands (see lib/email/render.ts). */
const VARIABLES = [
  "client_name",
  "payment_public_number",
  "amount",
  "currency",
  "due_date",
  "days_overdue",
  "company_name",
  "contact_url",
] as const;

type FieldKey = "subjectEn" | "bodyEn" | "subjectHe" | "bodyHe";

interface DraftState {
  name: string;
  subjectEn: string;
  bodyEn: string;
  subjectHe: string;
  bodyHe: string;
  variableNotes: string;
}

function toDraft(row: EmailTemplateRow): DraftState {
  return {
    name: row.name,
    subjectEn: row.subjectEn,
    bodyEn: row.bodyEn,
    subjectHe: row.subjectHe,
    bodyHe: row.bodyHe,
    variableNotes: row.variableNotes ?? "",
  };
}

interface Props {
  templates: EmailTemplateRow[];
}

export function EmailTemplatesSection({ templates }: Props) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [selectedKind, setSelectedKind] = useState<EmailTemplateKind | null>(
    templates[0]?.kind ?? null,
  );
  const selected = templates.find((tpl) => tpl.kind === selectedKind) ?? null;
  const [draft, setDraft] = useState<DraftState | null>(selected ? toDraft(selected) : null);

  // Track the last-focused editable field + its caret so a variable chip
  // inserts at the cursor rather than appending.
  const activeFieldRef = useRef<FieldKey | null>(null);
  const caretRef = useRef<number>(0);

  function selectTemplate(kind: EmailTemplateKind) {
    setSelectedKind(kind);
    const next = templates.find((tpl) => tpl.kind === kind);
    setDraft(next ? toDraft(next) : null);
    activeFieldRef.current = null;
  }

  function update(field: keyof DraftState, value: string) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function insertVariable(name: string) {
    const field = activeFieldRef.current;
    if (!draft || !field) return;
    const token = `{{${name}}}`;
    const current = draft[field];
    const pos = Math.min(caretRef.current, current.length);
    const next = current.slice(0, pos) + token + current.slice(pos);
    update(field, next);
    caretRef.current = pos + token.length;
  }

  function fieldHandlers(field: FieldKey) {
    return {
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        activeFieldRef.current = field;
        caretRef.current = e.target.selectionStart ?? e.target.value.length;
      },
      onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        caretRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
      },
      onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        caretRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
      },
    };
  }

  function save() {
    if (!selected || !draft) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/email-templates/${selected.kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          subjectEn: draft.subjectEn,
          bodyEn: draft.bodyEn,
          subjectHe: draft.subjectHe,
          bodyHe: draft.bodyHe,
          variableNotes: draft.variableNotes.trim() ? draft.variableNotes.trim() : null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ tone: "error", title: t("emailTemplates.saveFailed"), description: data.error });
        return;
      }
      toast.push({ tone: "success", title: t("emailTemplates.saved") });
      router.refresh();
    });
  }

  if (templates.length === 0 || !selected || !draft) {
    return <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("emailTemplates.description")}</p>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Template list */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("emailTemplates.selectTemplate")}
          </label>
          <ul className="space-y-0.5">
            {templates.map((tpl) => {
              const active = tpl.kind === selectedKind;
              return (
                <li key={tpl.kind}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(tpl.kind)}
                    disabled={isPending}
                    className={`w-full rounded-md border px-3 py-2 text-start text-sm transition-colors ${
                      active
                        ? "border-brand bg-brand-soft text-brand font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {t(`emailTemplates.kind.${tpl.kind}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Editor */}
        <div className="space-y-4">
          {/* Variable chips */}
          <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("emailTemplates.variablesTitle")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  disabled={isPending}
                  className="rounded-full border border-input bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("emailTemplates.variablesHint")}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("emailTemplates.name")}</label>
            <Input value={draft.name} onChange={(e) => update("name", e.target.value)} disabled={isPending} dir="auto" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("emailTemplates.subjectEn")}</label>
                <Input
                  value={draft.subjectEn}
                  onChange={(e) => update("subjectEn", e.target.value)}
                  disabled={isPending}
                  dir="ltr"
                  {...fieldHandlers("subjectEn")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("emailTemplates.bodyEn")}</label>
                <Textarea
                  rows={8}
                  value={draft.bodyEn}
                  onChange={(e) => update("bodyEn", e.target.value)}
                  disabled={isPending}
                  dir="ltr"
                  {...fieldHandlers("bodyEn")}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("emailTemplates.subjectHe")}</label>
                <Input
                  value={draft.subjectHe}
                  onChange={(e) => update("subjectHe", e.target.value)}
                  disabled={isPending}
                  dir="rtl"
                  {...fieldHandlers("subjectHe")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("emailTemplates.bodyHe")}</label>
                <Textarea
                  rows={8}
                  value={draft.bodyHe}
                  onChange={(e) => update("bodyHe", e.target.value)}
                  disabled={isPending}
                  dir="rtl"
                  {...fieldHandlers("bodyHe")}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("emailTemplates.variableNotes")}</label>
            <Textarea
              rows={2}
              value={draft.variableNotes}
              onChange={(e) => update("variableNotes", e.target.value)}
              disabled={isPending}
              dir="auto"
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? t("emailTemplates.saving") : t("emailTemplates.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
