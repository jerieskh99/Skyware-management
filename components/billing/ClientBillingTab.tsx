"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { BurnRateBar } from "./BurnRateBar";
import { PaymentStatusChip } from "./PaymentStatusChip";
import { MarkPaidSheet } from "./MarkPaidSheet";
import type { MonthlyBillingStatus, HourlyBankStatus, PaymentStatus, Currency } from "@prisma/client";
import { Plus, Pencil, Trash2, CreditCard, Clock, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyItem {
  id: string;
  serviceName: string;
  priceAmountPlaceholder: number | null;
  currency: Currency;
  billingCycle: string;
  startDate: string | Date;
  endDate: string | Date | null;
  status: MonthlyBillingStatus;
}

interface HourlyUsage {
  id: string;
  minutesUsed: number;
  usedAt: string | Date;
  note: string | null;
  jobId: string;
}

interface HourlyBank {
  id: string;
  totalHoursPurchasedMinutes: number | null;
  pricePerHourPlaceholder: number | null;
  totalPaymentPlaceholder: number | null;
  currency: Currency;
  purchaseDate: string | Date;
  expiryDate: string | Date | null;
  status: HourlyBankStatus;
  alertThresholdPercent: number;
  usages: HourlyUsage[];
}

interface OneTimeCharge {
  id: string;
  jobNameSnapshot: string;
  priceAmountPlaceholder: number | null;
  currency: Currency;
  dateCreated: string | Date;
  job: { id: string; publicNumber: string; title: string };
  payment: { id: string; status: PaymentStatus } | null;
}

interface PaymentRow {
  id: string;
  sourceType: string;
  amountPlaceholder: number | null;
  currency: Currency;
  issuedDate: string | Date;
  dueDate: string | Date | null;
  paidDate: string | Date | null;
  status: PaymentStatus;
  method: string | null;
  reference: string | null;
  notes: string | null;
  sourceMonthly: { id: string; serviceName: string } | null;
  createdBy: { displayName: string };
}

interface BillingAccount {
  id: string;
  defaultCurrency: Currency;
  monthlyBillingItems: MonthlyItem[];
  hourlyBanks: HourlyBank[];
  oneTimeCharges: OneTimeCharge[];
}

interface Props {
  clientId: string;
  clientName: string;
  billingAccount: BillingAccount | null;
  payments: PaymentRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return `${amount.toLocaleString()} ${currency}`;
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── Monthly billing section ──────────────────────────────────────────────────

function MonthlySection({ clientId, items, currency }: { clientId: string; items: MonthlyItem[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<MonthlyBillingStatus>("active");

  function closeDialog() { setOpen(false); setError(null); setServiceName(""); setPrice(""); }

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
      router.refresh(); closeDialog();
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      await fetch(`/api/clients/${clientId}/billing/monthly-items/${itemId}`, { method: "DELETE" });
      router.refresh();
    });
  }

  const statusBadge: Record<MonthlyBillingStatus, string> = {
    active: "bg-green-50 text-green-700 border-green-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    cancelled: "bg-muted text-muted-foreground border-border",
    none: "bg-muted text-muted-foreground border-border",
  };

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
                  {fmtAmount(item.priceAmountPlaceholder, item.currency)} / {item.billingCycle} · from {fmtDate(item.startDate)}
                  {item.endDate && ` to ${fmtDate(item.endDate)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge[item.status]}`}>
                  {item.status}
                </span>
                <button onClick={() => deleteItem(item.id)} disabled={isPending} className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Add monthly billing item</h3>
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
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Hourly banks section ─────────────────────────────────────────────────────

function HourlyBanksSection({ clientId, banks, currency }: { clientId: string; banks: HourlyBank[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logUsageBankId, setLogUsageBankId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add-bank form state
  const [totalHours, setTotalHours] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));

  // Log-usage form state
  const [usageJobId, setUsageJobId] = useState("");
  const [usageHours, setUsageHours] = useState("");
  const [usageNote, setUsageNote] = useState("");

  function closeAddDialog() { setOpen(false); setError(null); setTotalHours(""); setPricePerHour(""); }
  function closeUsageDialog() { setLogUsageBankId(null); setError(null); setUsageJobId(""); setUsageHours(""); setUsageNote(""); }

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
      router.refresh(); closeAddDialog();
    });
  }

  function submitLogUsage(e: React.FormEvent) {
    e.preventDefault();
    if (!usageJobId.trim()) { setError("Job ID is required."); return; }
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
      router.refresh(); closeUsageDialog();
    });
  }

  function deleteBank(bankId: string) {
    startTransition(async () => {
      await fetch(`/api/clients/${clientId}/billing/hourly-banks/${bankId}`, { method: "DELETE" });
      router.refresh();
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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Purchased {fmtDate(bank.purchaseDate)}</p>
                  <div className="flex items-center gap-2">
                    {bank.totalPaymentPlaceholder !== null && (
                      <span className="text-xs text-muted-foreground">
                        {fmtAmount(bank.totalPaymentPlaceholder, bank.currency)}
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
                    <button onClick={() => deleteBank(bank.id)} disabled={isPending} className="rounded p-1 text-muted-foreground hover:text-destructive">
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
                />
                {bank.usages.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {bank.usages.length} usage {bank.usages.length === 1 ? "entry" : "entries"} recorded
                  </p>
                )}
                {bank.expiryDate && (
                  <p className="text-[11px] text-muted-foreground">Expires {fmtDate(bank.expiryDate)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add bank dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Add hourly bank</h3>
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
                <Button type="button" variant="outline" onClick={closeAddDialog} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log usage dialog */}
      {logUsageBankId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold">Log hourly usage</h3>
            <p className="mb-4 text-xs text-muted-foreground">Paste the Job ID from the job detail URL.</p>
            <form onSubmit={submitLogUsage} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Job ID *</label>
                <Input
                  value={usageJobId}
                  onChange={(e) => setUsageJobId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={isPending}
                />
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
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : "Log usage"}</Button>
                <Button type="button" variant="outline" onClick={closeUsageDialog} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── One-time charges section ─────────────────────────────────────────────────

function OneTimeSection({ clientId, charges }: { clientId: string; charges: OneTimeCharge[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [jobIdInput, setJobIdInput] = useState("");
  const [price, setPrice] = useState("");

  function closeDialog() { setOpen(false); setError(null); setJobIdInput(""); setPrice(""); }

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
      router.refresh(); closeDialog();
    });
  }

  function deleteCharge(chargeId: string) {
    startTransition(async () => {
      await fetch(`/api/clients/${clientId}/billing/one-time-charges/${chargeId}`, { method: "DELETE" });
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
                  {fmtAmount(c.priceAmountPlaceholder, c.currency)} · {fmtDate(c.dateCreated)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.payment && <PaymentStatusChip status={c.payment.status} />}
                <button onClick={() => deleteCharge(c.id)} disabled={isPending} className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Add one-time charge</h3>
            <p className="mb-3 text-xs text-muted-foreground">Paste the Job ID (UUID) from the job detail URL.</p>
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
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Payments section ─────────────────────────────────────────────────────────

function PaymentsSection({
  clientId,
  clientName,
  payments,
  monthlyItems,
  hourlyBanks,
}: {
  clientId: string;
  clientName: string;
  payments: PaymentRow[];
  monthlyItems: MonthlyItem[];
  hourlyBanks: HourlyBank[];
}) {
  const router = useRouter();
  const [activePayment, setActivePayment] = useState<PaymentRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Create payment form state
  const [sourceType, setSourceType] = useState<"monthly" | "hourly_bank" | "one_time">("monthly");
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  function closeCreateDialog() {
    setCreateOpen(false); setError(null);
    setSourceType("monthly"); setSourceId(""); setAmount(""); setDueDate(""); setCreateNotes("");
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
      router.refresh(); closeCreateDialog();
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
                  {p.sourceMonthly?.serviceName ?? p.sourceType.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtAmount(p.amountPlaceholder, p.currency)} · Issued {fmtDate(p.issuedDate)}
                  {p.dueDate && ` · Due ${fmtDate(p.dueDate)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PaymentStatusChip status={p.status} />
                {p.status !== "paid" && p.status !== "cancelled" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActivePayment(p)}>
                    <Pencil className="me-1 h-3 w-3" /> Update
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create payment dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Create payment draft</h3>
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
                      <option key={b.id} value={b.id}>Purchased {fmtDate(b.purchaseDate)}</option>
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
                <Button type="button" variant="outline" onClick={closeCreateDialog} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activePayment && (
        <MarkPaidSheet
          payment={{ ...activePayment, client: { companyName: clientName } }}
          onClose={() => setActivePayment(null)}
        />
      )}
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ClientBillingTab({ clientId, clientName, billingAccount, payments }: Props) {
  if (!billingAccount) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-amber-600 font-medium">No billing account found for this client.</p>
        <p className="mt-1 text-xs text-muted-foreground">This should be created automatically when a client is added.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        Currency: <strong>{billingAccount.defaultCurrency}</strong> · Amounts shown are reference placeholders only — not verified accounting figures.
      </div>

      <MonthlySection clientId={clientId} items={billingAccount.monthlyBillingItems} currency={billingAccount.defaultCurrency} />
      <Separator />
      <HourlyBanksSection clientId={clientId} banks={billingAccount.hourlyBanks} currency={billingAccount.defaultCurrency} />
      <Separator />
      <OneTimeSection clientId={clientId} charges={billingAccount.oneTimeCharges} />
      <Separator />
      <PaymentsSection
        clientId={clientId}
        clientName={clientName}
        payments={payments}
        monthlyItems={billingAccount.monthlyBillingItems}
        hourlyBanks={billingAccount.hourlyBanks}
      />
    </div>
  );
}
