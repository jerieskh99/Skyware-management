"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import type { EmailTemplateKind } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, Loader2 } from "lucide-react";

/** The five template kinds an admin can seed a manual message from. */
const TEMPLATE_KINDS: EmailTemplateKind[] = [
  "manual_contact",
  "payment_reminder_client",
  "payment_reminder_admin",
  "hourly_bank_low_client",
  "hourly_bank_low_admin",
];

/** `{{ name }}` substitution mirroring lib/email/render.ts (unknown -> ""). */
const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(VAR_PATTERN, (_m, name: string) => vars[name] ?? "");
}

interface TemplateDTO {
  kind: EmailTemplateKind;
  subjectEn: string;
  bodyEn: string;
  subjectHe: string;
  bodyHe: string;
}

export interface ManualContactContext {
  clientId: string;
  clientName: string;
  /** No email on file -> the dialog refuses to send. */
  hasEmail: boolean;
  paymentId?: string;
  hourlyBankId?: string;
  /** Default template to preselect. Defaults to `manual_contact`. */
  defaultTemplateKind?: EmailTemplateKind;
  /**
   * Extra render variables to seed the preview and the send payload, e.g.
   * `{ payment_public_number, amount, currency, due_date, days_overdue }`.
   * `client_name` is always injected from `clientName`.
   */
  vars?: Record<string, string>;
}

interface Props extends ManualContactContext {
  open: boolean;
  onClose: () => void;
  /** Called after a successful send, e.g. to refresh an email-history view. */
  onSent?: () => void;
}

export function ManualContactDialog({
  open,
  onClose,
  onSent,
  clientId,
  clientName,
  hasEmail,
  paymentId,
  hourlyBankId,
  defaultTemplateKind = "manual_contact",
  vars,
}: Props) {
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [templateKind, setTemplateKind] = useState<EmailTemplateKind>(defaultTemplateKind);
  const [language, setLanguage] = useState<"en" | "he">("he");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<TemplateDTO | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const previewVars = useMemo<Record<string, string>>(
    () => ({ client_name: clientName, ...(vars ?? {}) }),
    [clientName, vars],
  );

  // Reset transient state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setTemplateKind(defaultTemplateKind);
      setLanguage("he");
      setDirty(false);
      setSubject("");
      setBody("");
    }
  }, [open, defaultTemplateKind]);

  // Fetch the selected template's raw text.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTemplate(true);
    setLoadError(false);
    fetch(`/api/admin/email-templates/${templateKind}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as TemplateDTO;
      })
      .then((data) => {
        if (cancelled) return;
        setTemplate(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateKind]);

  // Prefill subject/body from the template for the chosen language, unless the
  // admin has already edited the fields (dirty).
  useEffect(() => {
    if (!template || dirty) return;
    setSubject(language === "he" ? template.subjectHe : template.subjectEn);
    setBody(language === "he" ? template.bodyHe : template.bodyEn);
  }, [template, language, dirty]);

  const previewSubject = renderVars(subject, previewVars);
  const previewBody = renderVars(body, previewVars);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasEmail) return;
    startTransition(async () => {
      const payload: Record<string, unknown> = {
        clientId,
        language,
        // Always send the previewed subject+body as an override pair so the
        // delivered email matches the preview exactly. The backend re-runs
        // variable substitution on these strings.
        subject,
        body,
        ...(paymentId ? { paymentId } : {}),
        ...(hourlyBankId ? { hourlyBankId } : {}),
        ...(vars ? { vars } : {}),
      };
      const res = await fetch("/api/billing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ tone: "error", title: t("manualContact.failed"), description: data.error });
        return;
      }
      const data = (await res.json()) as { testMode: boolean; status: string };
      toast.push({
        tone: "success",
        title: t("manualContact.success"),
        description: data.testMode ? t("common.testModeNotice") : undefined,
      });
      onSent?.();
      onClose();
    });
  }

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("manualContact.title")}</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        {!hasEmail ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("manualContact.noEmail")}</span>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("manualContact.reason")}</label>
                <select
                  value={templateKind}
                  onChange={(e) => { setTemplateKind(e.target.value as EmailTemplateKind); setDirty(false); }}
                  disabled={isPending}
                  className={selectClass}
                >
                  {TEMPLATE_KINDS.map((k) => (
                    <option key={k} value={k}>{t(`manualContact.templateKind.${k}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("manualContact.language")}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "he")}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="he">{t("manualContact.languageHe")}</option>
                  <option value="en">{t("manualContact.languageEn")}</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("manualContact.reasonHint")}</p>

            {loadError && (
              <p className="text-xs text-destructive">{t("manualContact.templateLoadFailed")}</p>
            )}
            {loadingTemplate && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("manualContact.loadingTemplate")}
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("manualContact.subject")}</label>
              <Input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
                disabled={isPending}
                dir="auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("manualContact.body")}</label>
              <Textarea
                rows={6}
                value={body}
                onChange={(e) => { setBody(e.target.value); setDirty(true); }}
                disabled={isPending}
                dir="auto"
              />
            </div>

            {/* Live preview */}
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("manualContact.previewTitle")}
                </p>
              </div>
              <p className="text-sm font-medium" dir="auto">{previewSubject || "—"}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" dir="auto">
                {previewBody || "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">{t("manualContact.previewHint")}</p>
              {dirty && (
                <p className="text-[11px] text-amber-700">{t("manualContact.overrideNote")}</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending || loadingTemplate} className="flex-1">
                {isPending ? t("manualContact.sending") : t("manualContact.send")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                {t("manualContact.cancel")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
