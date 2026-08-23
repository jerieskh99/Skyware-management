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
import { PaymentStatusChip } from "../PaymentStatusChip";
import { MarkPaidSheet } from "../MarkPaidSheet";
import { ManualContactDialog } from "../ManualContactDialog";
import { PaymentReminderRuleDialog } from "../PaymentReminderRuleDialog";
import { useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { formatDateIL } from "@/lib/format";
import type { LatenessUnit } from "@prisma/client";
import { Plus, Pencil, CreditCard, Mail, BellRing } from "lucide-react";
import type { PaymentRow, MonthlyItem, HourlyBank } from "./types";
import { fmtDate, fmtAmount, selectClass } from "./format";

function sourceTypeLabel(t: (key: string) => string, sourceType: string): string {
  if (sourceType === "monthly" || sourceType === "hourly_bank" || sourceType === "one_time") {
    return t(`payment.sourceType.${sourceType}`);
  }
  return sourceType;
}

function latenessSummary(
  amount: number | null,
  unit: LatenessUnit | null,
  t: (key: string) => string,
): string {
  if (amount === null || unit === null) return t("billing.lateness.summaryNone");
  const key = unit === "weeks" ? "billing.lateness.summaryWeeks" : "billing.lateness.summaryDays";
  return t(key).replace("{{amount}}", String(amount));
}

export function PaymentsSection({
  clientId,
  clientName,
  clientEmail,
  payments,
  monthlyItems,
  hourlyBanks,
  remindersEnabled,
  manualContactEnabled,
  onContactSent,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  payments: PaymentRow[];
  monthlyItems: MonthlyItem[];
  hourlyBanks: HourlyBank[];
  remindersEnabled: boolean;
  manualContactEnabled: boolean;
  onContactSent: () => void;
}) {
  const router = useRouter();
  const { t, locale } = useT();
  const [activePayment, setActivePayment] = useState<PaymentRow | null>(null);
  const [ruleTarget, setRuleTarget] = useState<PaymentRow | null>(null);
  const [contactPayment, setContactPayment] = useState<PaymentRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState<"monthly" | "hourly_bank" | "one_time">("monthly");
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  function resetCreateForm() {
    setError(null);
    setSourceType("monthly"); setSourceId(""); setAmount(""); setDueDate(""); setCreateNotes("");
  }

  function handleCreateOpenChange(next: boolean) {
    setCreateOpen(next);
    if (!next) resetCreateForm();
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = {
        clientId,
        sourceType,
        amountPlaceholder: amount ? parseInt(amount, 10) : null,
        currency,
        issuedDate,
        status: "draft",
      };
      if (sourceType === "monthly" && sourceId) body.sourceMonthlyId = sourceId;
      if (sourceType === "hourly_bank" && sourceId) body.sourceHourlyId = sourceId;
      if (dueDate) body.dueDate = dueDate;
      if (createNotes.trim()) body.notes = createNotes.trim();

      const res = await fetch("/api/billing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      setCreateOpen(false);
      resetCreateForm();
      startTransition(() => { router.refresh(); });
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-muted-foreground" /> Payments
        </h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={isPending}>
          <Plus className="me-1 h-3.5 w-3.5" /> Create payment
        </Button>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No payments yet. Use &ldquo;Create payment&rdquo; to add a draft.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.sourceMonthly?.serviceName ?? sourceTypeLabel(t, p.sourceType)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtAmount(p.amountPlaceholder, p.currency, locale)} · Issued {fmtDate(p.issuedDate, locale)}
                  {p.dueDate && ` · Due ${fmtDate(p.dueDate, locale)}`}
                </p>
                {remindersEnabled && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <BellRing className="h-3 w-3" />
                    {latenessSummary(p.latenessAmount, p.latenessUnit, t)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <PaymentStatusChip status={p.status} />
                {remindersEnabled && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRuleTarget(p)} disabled={isPending}>
                    <BellRing className="me-1 h-3 w-3" /> {t("billing.lateness.button")}
                  </Button>
                )}
                {manualContactEnabled && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setContactPayment(p)} disabled={isPending}>
                    <Mail className="me-1 h-3 w-3" /> {t("billing.contactClient")}
                  </Button>
                )}
                {p.status !== "paid" && p.status !== "cancelled" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActivePayment(p)}>
                    <Pencil className="me-1 h-3 w-3" /> {t("billing.update")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create payment draft</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Source type *</label>
              <select
                value={sourceType}
                onChange={(e) => { setSourceType(e.target.value as "monthly" | "hourly_bank" | "one_time"); setSourceId(""); }}
                disabled={isPending}
                className={selectClass}
              >
                <option value="monthly">Monthly billing</option>
                <option value="hourly_bank">Hourly bank</option>
                <option value="one_time">One-time charge</option>
              </select>
            </div>

            {sourceType === "monthly" && monthlyItems.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Monthly item (optional)</label>
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={isPending} className={selectClass}>
                  <option value="">Not linked</option>
                  {monthlyItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.serviceName}</option>
                  ))}
                </select>
              </div>
            )}

            {sourceType === "hourly_bank" && hourlyBanks.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hourly bank (optional)</label>
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={isPending} className={selectClass}>
                  <option value="">Not linked</option>
                  {hourlyBanks.map((b) => (
                    <option key={b.id} value={b.id}>Purchased {fmtDate(b.purchaseDate, locale)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount (placeholder)</label>
                <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={isPending} className={selectClass}>
                  <option value="ILS">ILS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Issued date *</label>
                <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Due date</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={isPending} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea rows={2} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} disabled={isPending} />
            </div>

            <p className="text-[11px] text-muted-foreground">Payment will be created as a draft. Use &ldquo;Update&rdquo; to advance its status.</p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Creating..." : "Create draft"}</Button>
              <Button type="button" variant="outline" onClick={() => handleCreateOpenChange(false)} disabled={isPending}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {activePayment && (
        <MarkPaidSheet
          payment={{ ...activePayment, client: { companyName: clientName } }}
          onClose={() => setActivePayment(null)}
        />
      )}

      {remindersEnabled && ruleTarget && (
        <PaymentReminderRuleDialog
          paymentId={ruleTarget.id}
          open={ruleTarget !== null}
          onClose={() => setRuleTarget(null)}
          initial={{
            latenessAmount: ruleTarget.latenessAmount,
            latenessUnit: ruleTarget.latenessUnit,
            latenessNotifyAdminFirst: ruleTarget.latenessNotifyAdminFirst,
            autoSendAfterMinutes: ruleTarget.autoSendAfterMinutes,
          }}
        />
      )}

      {manualContactEnabled && contactPayment && (
        <ManualContactDialog
          open={contactPayment !== null}
          onClose={() => setContactPayment(null)}
          onSent={onContactSent}
          clientId={clientId}
          clientName={clientName}
          hasEmail={Boolean(clientEmail)}
          paymentId={contactPayment.id}
          defaultTemplateKind="payment_reminder_client"
          vars={buildPaymentVars(contactPayment, locale)}
        />
      )}
    </section>
  );
}

/**
 * Render-vars for a payment-scoped manual contact. `client_name`,
 * `company_name`, and `contact_url` are filled server-side; here we provide
 * the payment-specific placeholders the templates reference.
 */
function buildPaymentVars(p: PaymentRow, locale: Locale): Record<string, string> {
  const handle = p.reference || `PMT-${p.id.slice(0, 8)}`;
  const vars: Record<string, string> = {
    payment_public_number: handle,
    currency: p.currency,
  };
  if (p.amountPlaceholder != null) {
    vars.amount = (p.amountPlaceholder / 100).toFixed(2);
  }
  if (p.dueDate) {
    vars.due_date = formatDateIL(new Date(p.dueDate), locale);
    const due = new Date(p.dueDate).getTime();
    const days = Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24));
    vars.days_overdue = String(Math.max(0, days));
  }
  return vars;
}
