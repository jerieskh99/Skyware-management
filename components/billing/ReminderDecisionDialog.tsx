"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentReminderStatus, LatenessUnit } from "@prisma/client";
import { isAllowedReminderTransition } from "@/lib/billing/reminder-state";
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
import { ReminderStatusChip } from "./ReminderStatusChip";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatCurrencyILS, formatDateIL, formatDateTimeIL } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { Check, Clock, Ban, Send } from "lucide-react";

export interface ReminderDTO {
  id: string;
  status: PaymentReminderStatus;
  scheduledFor: string | null;
  failureReason: string | null;
  payment: {
    id: string;
    reference: string | null;
    dueDate: string | null;
    amount: number | null;
    currency: string;
    latenessAmount: number | null;
    latenessUnit: LatenessUnit | null;
  };
  client: { id: string; companyName: string };
}

type Action = "approve" | "delay" | "cancel" | "send_now";

/**
 * Maps a UI action to the reminder status it produces. Used to filter the
 * dialog's action buttons against the state-machine — buttons whose target
 * status is not reachable from the reminder's current status are hidden,
 * since the server would reject them with a 422 anyway.
 */
const ACTION_TARGET: Record<Action, PaymentReminderStatus> = {
  approve: "approved",
  delay: "delayed",
  cancel: "cancelled",
  send_now: "sent",
};

interface Props {
  reminder: ReminderDTO;
  open: boolean;
  onClose: () => void;
}

function paymentHandle(reference: string | null, id: string): string {
  return reference || `PMT-${id.slice(0, 8)}`;
}

function fmtAmount(amount: number | null, currency: string, locale: Locale): string {
  if (amount === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(amount, locale);
  return formatCurrency(amount, currency, locale);
}

function latenessSummary(
  amount: number | null,
  unit: LatenessUnit | null,
  t: (k: string) => string,
): string {
  if (amount === null || unit === null) return t("billing.lateness.summaryNone");
  const key = unit === "weeks" ? "billing.lateness.summaryWeeks" : "billing.lateness.summaryDays";
  return t(key).replace("{{amount}}", String(amount));
}

export function ReminderDecisionDialog({ reminder, open, onClose }: Props) {
  const router = useRouter();
  const { t, locale } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [newScheduledFor, setNewScheduledFor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const p = reminder.payment;
  const handle = paymentHandle(p.reference, p.id);

  const ALL_ACTIONS: { value: Action; icon: typeof Check }[] = [
    { value: "approve", icon: Check },
    { value: "delay", icon: Clock },
    { value: "send_now", icon: Send },
    { value: "cancel", icon: Ban },
  ];

  // Only show actions whose target status is reachable from the reminder's
  // current status per the state machine. Avoids surfacing buttons that the
  // server would reject with a 422 (e.g. "Approve" from `delayed`).
  const availableActions = useMemo(
    () =>
      ALL_ACTIONS.filter((a) =>
        isAllowedReminderTransition(reminder.status, ACTION_TARGET[a.value]),
      ),
    // ALL_ACTIONS is a stable literal; only re-compute when the status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reminder.status],
  );

  const [action, setAction] = useState<Action>(
    () => availableActions[0]?.value ?? "approve",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (action === "delay" && !newScheduledFor) {
      setError(t("billingReminders.decision.newScheduledForRequired"));
      return;
    }
    startTransition(async () => {
      const payload: Record<string, unknown> = { action };
      if (comment.trim()) payload.comment = comment.trim();
      if (action === "delay") {
        // datetime-local yields a local wall-clock value; convert to ISO-8601
        // with offset so the server gets an unambiguous instant.
        payload.newScheduledFor = new Date(newScheduledFor).toISOString();
      }
      const res = await fetch(`/api/billing/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 422) {
          setError(data.error ?? t("billingReminders.decision.illegalTransition"));
        } else {
          setError(data.error ?? t("billingReminders.decision.failed"));
        }
        return;
      }
      const successKey =
        action === "approve" ? "successApprove"
        : action === "delay" ? "successDelay"
        : action === "cancel" ? "successCancel"
        : "successSendNow";
      toast.push({
        tone: "success",
        title: t(`billingReminders.decision.${successKey}`),
        // Reminder emails go through the same test-mode transport; make it
        // clear when a "send" did not actually leave the building.
        description:
          action === "send_now" || action === "approve"
            ? t("common.testModeNotice")
            : undefined,
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t("billingReminders.decision.title")}</DialogTitle>
            <ReminderStatusChip status={reminder.status} />
          </div>
          <DialogDescription>{t("billingReminders.decision.description")}</DialogDescription>
        </DialogHeader>

        {/* Reminder facts */}
        <dl className="space-y-1.5 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <Row label={t("billingReminders.decision.client")} value={reminder.client.companyName} />
          <Row label={t("billingReminders.decision.payment")} value={<span className="font-mono text-xs">{handle}</span>} />
          <Row label={t("billingReminders.decision.amount")} value={fmtAmount(p.amount, p.currency, locale)} />
          <Row
            label={t("billingReminders.decision.due")}
            value={p.dueDate ? formatDateIL(new Date(p.dueDate), locale) : "—"}
          />
          <Row label={t("billingReminders.decision.rule")} value={latenessSummary(p.latenessAmount, p.latenessUnit, t)} />
          <Row
            label={t("billingReminders.decision.scheduledFor")}
            value={reminder.scheduledFor ? formatDateTimeIL(new Date(reminder.scheduledFor), locale) : "—"}
          />
          {reminder.failureReason && (
            <Row
              label={t("billingReminders.decision.failureReason")}
              value={<span className="text-destructive">{reminder.failureReason}</span>}
            />
          )}
        </dl>

        {availableActions.length === 0 && (
          <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("billingReminders.decision.noActionsAvailable")}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("billingReminders.decision.title")}</label>
            <div className="grid grid-cols-2 gap-2">
              {availableActions.map(({ value, icon: Icon }) => {
                const active = action === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setAction(value); setError(null); }}
                    disabled={isPending}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      active
                        ? "border-brand bg-brand-soft text-brand font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(`billingReminders.decision.${value === "send_now" ? "sendNow" : value}`)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`billingReminders.decision.${action === "send_now" ? "sendNowHint" : `${action}Hint`}`)}
            </p>
          </div>

          {action === "delay" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("billingReminders.decision.newScheduledFor")}</label>
              <Input
                type="datetime-local"
                value={newScheduledFor}
                onChange={(e) => setNewScheduledFor(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {action === "cancel"
                ? t("billingReminders.decision.cancelComment")
                : t("billingReminders.decision.comment")}
            </label>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} disabled={isPending} dir="auto" />
          </div>

          {(action === "cancel" || action === "send_now") && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {action === "cancel"
                ? t("billingReminders.decision.confirmCancel")
                : t("billingReminders.decision.confirmSendNow")}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              disabled={isPending || availableActions.length === 0}
              className="flex-1"
            >
              {isPending ? t("common.saving") : t("billingReminders.decision.submit")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("manualContact.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
