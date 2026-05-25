"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReceiptDocument, ReceiptDocumentType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

const RECEIPT_TYPES: ReceiptDocumentType[] = [
  "invoice",
  "receipt",
  "tax_invoice",
  "tax_invoice_receipt",
  "credit_note",
  "proforma_invoice",
];

const CURRENCIES = ["ILS", "USD", "EUR"] as const;

interface LineRow {
  description: string;
  amountAgorot: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptDocument;
}

function isoDate(d: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function readLines(raw: unknown): LineRow[] {
  if (!Array.isArray(raw)) return [{ description: "", amountAgorot: 0 }];
  const out: LineRow[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const description = typeof obj["description"] === "string" ? obj["description"] : "";
      const lineTotal = typeof obj["lineTotal"] === "number" ? obj["lineTotal"] : 0;
      out.push({ description, amountAgorot: lineTotal });
    }
  }
  return out.length > 0 ? out : [{ description: "", amountAgorot: 0 }];
}

export function EditDraftDrawer({ open, onOpenChange, receipt }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ReceiptDocumentType>(receipt.type);
  const [issueDate, setIssueDate] = useState<string>(isoDate(receipt.issueDate));
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(
    receipt.currency as (typeof CURRENCIES)[number],
  );
  const [amountBeforeVat, setAmountBeforeVat] = useState<number>(
    receipt.amountBeforeVat ?? 0,
  );
  const [vatRateBp, setVatRateBp] = useState<number>(receipt.vatRateBasisPoints);
  const [notes, setNotes] = useState<string>(receipt.notes ?? "");
  const [lines, setLines] = useState<LineRow[]>(readLines(receipt.descriptionLines));

  const vatAmount = Math.round((amountBeforeVat * vatRateBp) / 10000);
  const totalAmount = amountBeforeVat + vatAmount;

  function addLine() {
    setLines((prev) => [...prev, { description: "", amountAgorot: 0 }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  function updateLine(idx: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanLines = lines
      .map((l) => ({
        description: l.description.trim(),
        lineTotal: Math.round(l.amountAgorot),
      }))
      .filter((l) => l.description.length > 0);
    if (cleanLines.length === 0) {
      setError(t("receipts.draftForm.atLeastOneLine"));
      return;
    }

    startTransition(async () => {
      const body = {
        type,
        issueDate,
        currency,
        amountBeforeVat,
        vatRateBasisPoints: vatRateBp,
        vatAmount,
        totalAmount,
        descriptionLines: cleanLines,
        notes: notes.trim() ? notes.trim() : null,
      };
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("receipts.draftForm.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("receipts.draftForm.updateSuccess") });
      onOpenChange(false);
      router.refresh();
    });
  }

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("receipts.draftForm.editTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("receipts.draftForm.type")}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ReceiptDocumentType)}
                disabled={isPending}
                className={selectClass}
              >
                {RECEIPT_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {t(`receipts.type.${rt}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("receipts.draftForm.currency")}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
                disabled={isPending}
                className={selectClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("receipts.draftForm.issueDate")}</label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("receipts.draftForm.amountBeforeVat")}
              </label>
              <Input
                type="number"
                min={0}
                step={1}
                value={amountBeforeVat}
                onChange={(e) => setAmountBeforeVat(Math.max(0, Number(e.target.value) || 0))}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("receipts.draftForm.vatRate")}</label>
              <Input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={vatRateBp}
                onChange={(e) =>
                  setVatRateBp(Math.min(10000, Math.max(0, Number(e.target.value) || 0)))
                }
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("receipts.draftForm.vatAmount")}
              </p>
              <p className="font-mono">{vatAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("receipts.draftForm.total")}</p>
              <p className="font-mono font-semibold">{totalAmount.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                {t("receipts.draftForm.linesHeading")}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLine}
                disabled={isPending}
              >
                <Plus className="me-1 h-3 w-3" />
                {t("receipts.draftForm.addLine")}
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Input
                    placeholder={t("receipts.draftForm.description")}
                    value={line.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                    disabled={isPending}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={line.amountAgorot}
                    onChange={(e) =>
                      updateLine(idx, { amountAgorot: Math.max(0, Number(e.target.value) || 0) })
                    }
                    disabled={isPending}
                    className="w-32"
                    aria-label={t("receipts.draftForm.lineTotal")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(idx)}
                    disabled={isPending || lines.length === 1}
                    aria-label={t("receipts.draftForm.removeLine")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("receipts.draftForm.notes")}</label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder={t("receipts.draftForm.notesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t("receipts.draftForm.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("receipts.draftForm.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
