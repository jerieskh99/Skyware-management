"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import type { MonthlyBillingStatus } from "@prisma/client";
import { Plus, Trash2, CreditCard } from "lucide-react";
import type { MonthlyItem } from "./types";
import { fmtDate, fmtAmount, selectClass, statusBadge } from "./format";

export function MonthlySection({ clientId, items, currency }: { clientId: string; items: MonthlyItem[]; currency: string }) {
  const router = useRouter();
  const { locale } = useT();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<MonthlyBillingStatus>("active");
  const [deleteTarget, setDeleteTarget] = useState<MonthlyItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function resetForm() { setError(null); setServiceName(""); setPrice(""); }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceName.trim()) { setError("Service name is required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/billing/monthly-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: serviceName.trim(),
          priceAmountPlaceholder: price ? parseInt(price, 10) : null,
          currency,
          startDate,
          status,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      router.refresh();
      setOpen(false);
      resetForm();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteError(null);
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/billing/monthly-items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setDeleteError(d.error ?? "Delete failed.");
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-muted-foreground" /> Monthly billing
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={isPending}>
          <Plus className="me-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No monthly billing items.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.serviceName}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtAmount(item.priceAmountPlaceholder, item.currency, locale)} / {item.billingCycle} · from {fmtDate(item.startDate, locale)}
                  {item.endDate && ` to ${fmtDate(item.endDate, locale)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge[item.status]}`}>
                  {item.status}
                </span>
                <button
                  onClick={() => { setDeleteError(null); setDeleteTarget(item); }}
                  disabled={isPending}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${item.serviceName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add monthly billing item</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Service name *</label>
              <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Web hosting, IT support" disabled={isPending} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount (placeholder)</label>
                <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isPending} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as MonthlyBillingStatus)} disabled={isPending} className={selectClass}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : "Add"}</Button>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(null); } }}
        title="Delete monthly item"
        description={deleteTarget ? (
          <>
            Delete <span className="font-medium text-foreground">{deleteTarget.serviceName}</span>?
            This cannot be undone.
          </>
        ) : ""}
        pending={isPending}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
