"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LatenessUnit } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Lock, ChevronDown, ChevronRight } from "lucide-react";

export interface PaymentReminderRule {
  latenessAmount: number | null;
  latenessUnit: LatenessUnit | null;
  latenessNotifyAdminFirst: boolean;
  autoSendAfterMinutes: number | null;
}

interface Props {
  paymentId: string;
  initial: PaymentReminderRule;
  open: boolean;
  onClose: () => void;
}

/**
 * Edit the late-payment reminder rule for one payment. PATCHes the lateness
 * fields to `/api/billing/payments/[id]`. The "notify admins first" gate is
 * always enforced server-side; the checkbox is shown read-only-ish (the admin
 * cannot disable the review step).
 */
export function PaymentReminderRuleDialog({ paymentId, initial, open, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(
    initial.latenessAmount != null ? String(initial.latenessAmount) : "",
  );
  const [unit, setUnit] = useState<LatenessUnit>(initial.latenessUnit ?? "days");
  const [autoSend, setAutoSend] = useState(
    initial.autoSendAfterMinutes != null ? String(initial.autoSendAfterMinutes) : "",
  );
  const [showAdvanced, setShowAdvanced] = useState(initial.autoSendAfterMinutes != null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Both-or-neither for the amount/unit pair. Empty amount clears the rule.
    const trimmed = amount.trim();
    let latenessAmount: number | null = null;
    let latenessUnit: LatenessUnit | null = null;
    if (trimmed !== "") {
      const n = parseInt(trimmed, 10);
      if (!Number.isInteger(n) || n <= 0) {
        setError(t("billing.lateness.saveFailed"));
        return;
      }
      latenessAmount = n;
      latenessUnit = unit;
    }

    let autoSendAfterMinutes: number | null = null;
    if (showAdvanced && autoSend.trim() !== "") {
      const m = parseInt(autoSend.trim(), 10);
      if (!Number.isInteger(m) || m <= 0) {
        setError(t("billing.lateness.saveFailed"));
        return;
      }
      autoSendAfterMinutes = m;
    }

    startTransition(async () => {
      const res = await fetch(`/api/billing/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latenessAmount,
          latenessUnit,
          autoSendAfterMinutes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("billing.lateness.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("billing.lateness.saved") });
      onClose();
      router.refresh();
    });
  }

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing.lateness.sectionTitle")}</DialogTitle>
          <DialogDescription>{t("billing.lateness.sectionDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("billing.lateness.amountLabel")}</label>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("billing.lateness.clearRule")}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("billing.lateness.unitLabel")}</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as LatenessUnit)}
                disabled={isPending || amount.trim() === ""}
                className={selectClass}
              >
                <option value="days">{t("billing.lateness.unitDays")}</option>
                <option value="weeks">{t("billing.lateness.unitWeeks")}</option>
              </select>
            </div>
          </div>

          {/* Notify-admins-first: always enforced, shown read-only. */}
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <input
              type="checkbox"
              checked
              readOnly
              aria-readonly
              className="mt-0.5 h-4 w-4"
            />
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-foreground">{t("billing.lateness.notifyAdminLabel")}</p>
              <p className="flex items-center gap-1 text-muted-foreground">
                <Lock className="h-3 w-3" /> {t("billing.lateness.notifyAdminEnforced")}
              </p>
            </div>
          </div>

          {/* Advanced auto-send */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {t("billing.lateness.advancedToggle")}
            </button>
            {showAdvanced && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("billing.lateness.autoSendLabel")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={autoSend}
                    onChange={(e) => setAutoSend(e.target.value)}
                    disabled={isPending}
                    className="max-w-[140px]"
                  />
                  <span className="text-sm text-muted-foreground">{t("billing.lateness.autoSendSuffix")}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("billing.lateness.autoSendHelp")}</p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
