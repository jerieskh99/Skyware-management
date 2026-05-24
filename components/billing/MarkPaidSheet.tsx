"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentStatusChip } from "./PaymentStatusChip";
import type { PaymentStatus } from "@prisma/client";
import { Receipt } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface Payment {
  id: string;
  status: PaymentStatus;
  amountPlaceholder: number | null;
  currency: string;
  issuedDate: string | Date;
  dueDate: string | Date | null;
  sourceType: string;
  client: { companyName: string };
  sourceMonthly?: { serviceName: string } | null;
}

interface Props {
  payment: Payment;
  onClose: () => void;
}

const METHOD_KEYS = [
  "bank_transfer",
  "bit",
  "cheque",
  "cash",
  "credit_card",
  "other",
] as const;

const NEXT_STATUSES: Partial<Record<PaymentStatus, string[]>> = {
  draft:               ["sent_to_client", "cancelled"],
  sent_to_client:      ["waiting_for_payment", "cancelled"],
  waiting_for_payment: ["paid", "partially_paid", "overdue", "cancelled"],
  partially_paid:      ["paid", "overdue", "cancelled"],
  overdue:             ["paid", "cancelled"],
};

export function MarkPaidSheet({ payment, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("paid");

  const allowedStatuses = NEXT_STATUSES[payment.status] ?? [];
  const markingPaid = nextStatus === "paid";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (markingPaid && !paidDate) { setError(t("billing.paidDateRequired")); return; }
    if (markingPaid && !method) { setError(t("billing.methodRequired")); return; }
    setError(null);

    startTransition(async () => {
      const body: Record<string, unknown> = { status: nextStatus };
      if (markingPaid) {
        body.paidDate = paidDate;
        body.method = method;
        if (reference.trim()) body.reference = reference.trim();
        if (notes.trim()) body.notes = notes.trim();
      }

      const res = await fetch(`/api/billing/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? t("billing.updateFailed"));
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t("billing.updatePaymentStatus")}</DialogTitle>
            <PaymentStatusChip status={payment.status} />
          </div>
        </DialogHeader>

        <div className="space-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">{payment.client.companyName}</p>
          <p className="text-muted-foreground">
            {payment.sourceMonthly?.serviceName ?? payment.sourceType.replace("_", " ")}
            {payment.amountPlaceholder != null &&
              ` · ${payment.amountPlaceholder.toLocaleString()} ${payment.currency}`}
          </p>
        </div>

        {allowedStatuses.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t("billing.terminalState")}
            </p>
            <Button variant="outline" onClick={onClose} className="w-full">{t("common.close")}</Button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("billing.moveToStatus")}</label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value)}
                disabled={isPending}
                className={selectClass}
              >
                {allowedStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`payment.status.${s}`)}
                  </option>
                ))}
              </select>
            </div>

            {markingPaid && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("billing.paidDate")} *</label>
                    <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} disabled={isPending} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("billing.method")} *</label>
                    <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={isPending} className={selectClass}>
                      {METHOD_KEYS.map((k) => (
                        <option key={k} value={k}>{t(`billing.method_${k}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("billing.reference")}</label>
                  <Input placeholder={t("billing.referencePlaceholder")} value={reference} onChange={(e) => setReference(e.target.value)} disabled={isPending} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("billing.notesOptional")}</label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isPending} />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{t("billing.receiptDocument")}</p>
                    <p>{t("billing.receiptDocumentBody")}</p>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? t("common.saving") : markingPaid ? t("billing.markPaid") : t("billing.updateStatus")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
