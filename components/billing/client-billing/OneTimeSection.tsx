"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PaymentStatusChip } from "../PaymentStatusChip";
import { useT } from "@/lib/i18n/client";
import { Plus, Trash2, Zap } from "lucide-react";
import type { OneTimeCharge } from "./types";
import { fmtDate, fmtAmount } from "./format";

export function OneTimeSection({ clientId, charges }: { clientId: string; charges: OneTimeCharge[] }) {
  const router = useRouter();
  const { locale } = useT();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [jobIdInput, setJobIdInput] = useState("");
  const [price, setPrice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OneTimeCharge | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function resetForm() { setError(null); setJobIdInput(""); setPrice(""); }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobIdInput.trim()) { setError("Job ID is required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/billing/one-time-charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobIdInput.trim(),
          priceAmountPlaceholder: price ? parseInt(price, 10) : null,
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
      const res = await fetch(`/api/clients/${clientId}/billing/one-time-charges/${id}`, { method: "DELETE" });
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
          <Zap className="h-4 w-4 text-muted-foreground" /> One-time charges
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={isPending}>
          <Plus className="me-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {charges.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No one-time charges.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {charges.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/my-jobs/${c.job.id}`} className="font-medium hover:underline">
                  {c.job.publicNumber} · {c.jobNameSnapshot}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {fmtAmount(c.priceAmountPlaceholder, c.currency, locale)} · {fmtDate(c.dateCreated, locale)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.payment && <PaymentStatusChip status={c.payment.status} />}
                <button
                  onClick={() => { setDeleteError(null); setDeleteTarget(c); }}
                  disabled={isPending}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete charge for ${c.jobNameSnapshot}`}
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
            <DialogTitle>Add one-time charge</DialogTitle>
            <DialogDescription>Paste the Job ID (UUID) from the job detail URL.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job ID *</label>
              <Input value={jobIdInput} onChange={(e) => setJobIdInput(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={isPending} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (placeholder)</label>
              <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" disabled={isPending} />
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
        title="Delete one-time charge"
        description={deleteTarget ? (
          <>
            Delete charge <span className="font-medium text-foreground">{deleteTarget.job.publicNumber} · {deleteTarget.jobNameSnapshot}</span>?
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
