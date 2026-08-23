"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BurnRateBar } from "../BurnRateBar";
import { ManualContactDialog } from "../ManualContactDialog";
import type { BankBurn } from "@/lib/billing/queries";
import { useT } from "@/lib/i18n/client";
import { Plus, Trash2, Clock, Mail } from "lucide-react";
import type { HourlyBank } from "./types";
import { fmtDate, fmtAmount, selectClass } from "./format";

interface JobOption {
  id: string;
  publicNumber: string;
  title: string;
  status: string;
}

export function HourlyBanksSection({
  clientId,
  clientName,
  clientEmail,
  banks,
  currency,
  burnByBank,
  burnEnabled,
  manualContactEnabled,
  onContactSent,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  banks: HourlyBank[];
  currency: string;
  burnByBank: Record<string, BankBurn> | null;
  burnEnabled: boolean;
  manualContactEnabled: boolean;
  onContactSent: () => void;
}) {
  const router = useRouter();
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [contactBankId, setContactBankId] = useState<string | null>(null);
  const [logUsageBankId, setLogUsageBankId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [totalHours, setTotalHours] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));

  const [usageJobId, setUsageJobId] = useState("");
  const [usageHours, setUsageHours] = useState("");
  const [usageNote, setUsageNote] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<HourlyBank | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  // Load this client's jobs whenever the "Log usage" dialog opens.
  useEffect(() => {
    if (logUsageBankId === null) return;
    let cancelled = false;
    setJobsLoading(true);
    setJobsLoaded(false);
    fetch(`/api/clients/${clientId}/jobs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load jobs"))))
      .then((data: JobOption[]) => {
        if (cancelled) return;
        setJobOptions(data);
        setJobsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setJobOptions([]);
        setJobsLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setJobsLoading(false);
      });
    return () => { cancelled = true; };
  }, [logUsageBankId, clientId]);

  function resetAddForm() { setError(null); setTotalHours(""); setPricePerHour(""); }
  function resetUsageForm() { setError(null); setUsageJobId(""); setUsageHours(""); setUsageNote(""); }

  function handleAddOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetAddForm();
  }

  function handleUsageOpenChange(next: boolean) {
    if (!next) { setLogUsageBankId(null); resetUsageForm(); }
  }

  function submitAddBank(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/billing/hourly-banks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalHoursPurchasedMinutes: totalHours ? parseInt(totalHours, 10) * 60 : null,
          pricePerHourPlaceholder: pricePerHour ? parseInt(pricePerHour, 10) : null,
          currency,
          purchaseDate,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      setOpen(false);
      resetAddForm();
      startTransition(() => { router.refresh(); });
    });
  }

  function submitLogUsage(e: React.FormEvent) {
    e.preventDefault();
    if (!usageJobId.trim()) { setError("Please select a job."); return; }
    if (!usageHours || parseFloat(usageHours) <= 0) { setError("Hours used must be greater than 0."); return; }
    setError(null);
    startTransition(async () => {
      const minutes = Math.round(parseFloat(usageHours) * 60);
      const res = await fetch(`/api/clients/${clientId}/billing/hourly-banks/${logUsageBankId}/usages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: usageJobId.trim(),
          minutesUsed: minutes,
          note: usageNote.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      setLogUsageBankId(null);
      resetUsageForm();
      startTransition(() => { router.refresh(); });
    });
  }

  function confirmDeleteBank() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteError(null);
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/billing/hourly-banks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setDeleteError(d.error ?? "Delete failed.");
        return;
      }
      setDeleteTarget(null);
      startTransition(() => { router.refresh(); });
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" /> Hourly banks
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={isPending}>
          <Plus className="me-1 h-3.5 w-3.5" /> Add bank
        </Button>
      </div>

      {banks.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No hourly banks.</p>
      ) : (
        <div className="space-y-3">
          {banks.map((bank) => {
            const usedMinutes = bank.usages.reduce((s, u) => s + u.minutesUsed, 0);
            return (
              <div key={bank.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Purchased {fmtDate(bank.purchaseDate, locale)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {bank.totalPaymentPlaceholder !== null && (
                      <span className="text-xs text-muted-foreground">
                        {fmtAmount(bank.totalPaymentPlaceholder, bank.currency, locale)}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setLogUsageBankId(bank.id)}
                      disabled={isPending}
                    >
                      <Plus className="me-1 h-3 w-3" /> Log usage
                    </Button>
                    {manualContactEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setContactBankId(bank.id)}
                        disabled={isPending}
                      >
                        <Mail className="me-1 h-3 w-3" /> {t("billing.contactClient")}
                      </Button>
                    )}
                    <button
                      onClick={() => { setDeleteError(null); setDeleteTarget(bank); }}
                      disabled={isPending}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Delete hourly bank"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <BurnRateBar
                  totalMinutes={bank.totalHoursPurchasedMinutes}
                  usedMinutes={usedMinutes}
                  alertThresholdPercent={bank.alertThresholdPercent}
                  currency={bank.currency}
                  pricePerHour={bank.pricePerHourPlaceholder}
                  locale={locale}
                  burn={
                    burnEnabled && burnByBank && burnByBank[bank.id]
                      ? {
                          avgMonthlyMinutes: burnByBank[bank.id]!.avgMonthlyMinutes,
                          projectedMonthsRemaining: burnByBank[bank.id]!.projectedMonthsRemaining,
                          labels: {
                            avgMonthly: t("billing.burn.avgMonthly"),
                            monthsRemaining: t("billing.burn.monthsRemaining"),
                            monthsRemainingNa: t("billing.burn.monthsRemainingNa"),
                          },
                        }
                      : undefined
                  }
                />
                {bank.usages.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {bank.usages.length} usage {bank.usages.length === 1 ? "entry" : "entries"} recorded
                  </p>
                )}
                {bank.expiryDate && (
                  <p className="text-[11px] text-muted-foreground">Expires {fmtDate(bank.expiryDate, locale)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={handleAddOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add hourly bank</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAddBank} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total hours</label>
                <Input type="number" min="1" value={totalHours} onChange={(e) => setTotalHours(e.target.value)} placeholder="e.g. 20" disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Price/hour (placeholder)</label>
                <Input type="number" min="0" value={pricePerHour} onChange={(e) => setPricePerHour(e.target.value)} placeholder="0" disabled={isPending} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Purchase date</label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} disabled={isPending} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : "Add"}</Button>
              <Button type="button" variant="outline" onClick={() => handleAddOpenChange(false)} disabled={isPending}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={logUsageBankId !== null} onOpenChange={handleUsageOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log hourly usage</DialogTitle>
            <DialogDescription>Select the job this usage applies to.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitLogUsage} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job *</label>
              {jobsLoading ? (
                <p className="text-sm text-muted-foreground">Loading jobs…</p>
              ) : jobsLoaded && jobOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This client has no jobs yet. Create a job for this client before logging usage.
                </p>
              ) : (
                <select
                  value={usageJobId}
                  onChange={(e) => setUsageJobId(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="" disabled>Select a job…</option>
                  {jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.publicNumber} — {j.title} ({j.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hours used *</label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={usageHours}
                onChange={(e) => setUsageHours(e.target.value)}
                placeholder="e.g. 1.5"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Note (optional)</label>
              <Textarea
                rows={2}
                value={usageNote}
                onChange={(e) => setUsageNote(e.target.value)}
                placeholder="What was worked on..."
                disabled={isPending}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending || jobsLoading || jobOptions.length === 0} className="flex-1">{isPending ? "Saving..." : "Log usage"}</Button>
              <Button type="button" variant="outline" onClick={() => handleUsageOpenChange(false)} disabled={isPending}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(null); } }}
        title="Delete hourly bank"
        description={deleteTarget ? (
          <>
            Delete the bank purchased on {fmtDate(deleteTarget.purchaseDate, locale)}?
            All logged usage will be removed. This cannot be undone.
          </>
        ) : ""}
        pending={isPending}
        errorMessage={deleteError}
        onConfirm={confirmDeleteBank}
      />

      {manualContactEnabled && contactBankId && (
        <ManualContactDialog
          open={contactBankId !== null}
          onClose={() => setContactBankId(null)}
          onSent={onContactSent}
          clientId={clientId}
          clientName={clientName}
          hasEmail={Boolean(clientEmail)}
          hourlyBankId={contactBankId}
          defaultTemplateKind="hourly_bank_low_client"
        />
      )}
    </section>
  );
}
