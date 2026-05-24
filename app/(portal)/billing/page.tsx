import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getBillingKpis, listPayments, getAgingPayments } from "@/lib/billing/queries";
import { PaymentStatusChip } from "@/components/billing/PaymentStatusChip";
import { BillingPageActions } from "@/components/billing/BillingPageActions";
import type { PaymentStatus } from "@prisma/client";
import { CreditCard, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";

const VALID_STATUSES = new Set<string>([
  "draft", "sent_to_client", "waiting_for_payment",
  "partially_paid", "paid", "cancelled", "overdue",
]);

interface Props {
  searchParams: Promise<Record<string, string>>;
}

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return `${amount.toLocaleString()} ${currency}`;
}

export default async function BillingPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const rawStatuses = (sp["status"] ? [sp["status"]] : []).filter((s) => VALID_STATUSES.has(s)) as PaymentStatus[];
  const clientFilter = sp["clientId"] ?? undefined;

  const [kpis, payments, aging] = await Promise.all([
    getBillingKpis(),
    listPayments({ status: rawStatuses.length ? rawStatuses : undefined, clientId: clientFilter }),
    getAgingPayments(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={CreditCard}
        title="Billing"
        description="Payments, monthly plans, hourly banks, and one-time charges across all clients."
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={CreditCard}
          tone={kpis.unpaidCount > 0 ? "warn" : "default"}
          label="Unpaid"
          value={kpis.unpaidCount}
          href="?status=waiting_for_payment"
        />
        <KpiCard
          icon={AlertTriangle}
          tone={kpis.overdueCount > 0 ? "danger" : "default"}
          label="Overdue"
          value={kpis.overdueCount}
          href="?status=overdue"
        />
        <KpiCard
          icon={CheckCircle2}
          tone="success"
          label="Paid this month"
          value={kpis.paidThisMonth}
          href="?status=paid"
        />
      </div>

      {/* Aging payments highlight */}
      {aging.length > 0 && (
        <SectionCard
          icon={Clock}
          title="Needs attention"
          description="Aging or overdue payments — review these first."
          count={aging.length}
          bodyClassName="p-0"
        >
          <div className="divide-y">
            {aging.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link href={`/clients/${p.client.id}`} className="font-medium hover:underline">
                    {p.client.companyName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {p.sourceMonthly?.serviceName ?? p.sourceType.replace(/_/g, " ")} ·{" "}
                    {fmtAmount(p.amountPlaceholder, p.currency)}
                    {p.dueDate && ` · Due ${fmtDate(p.dueDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentStatusChip status={p.status} />
                  <BillingPageActions payment={p} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* All payments */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">All payments</h2>
          <StatusFilterLinks active={rawStatuses[0]} />
        </div>

        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found."
            description="Payments are created from the client billing tab."
          />
        ) : (
          <div className="rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Client</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">Issued</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">Due</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Link href={`/clients/${p.client.id}?tab=billing`} className="font-medium hover:underline">
                          {p.client.companyName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.sourceMonthly?.serviceName ?? p.sourceType.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {fmtAmount(p.amountPlaceholder, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {fmtDate(p.issuedDate)}
                      </td>
                      <td className={`px-4 py-3 text-xs hidden sm:table-cell ${p.status === "overdue" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {fmtDate(p.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusChip status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <BillingPageActions payment={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Status filter chips ──────────────────────────────────────────────────────

const FILTER_OPTIONS: { label: string; value: PaymentStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Awaiting", value: "waiting_for_payment" },
  { label: "Partial", value: "partially_paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Paid", value: "paid" },
  { label: "Draft", value: "draft" },
];

function StatusFilterLinks({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTER_OPTIONS.map(({ label, value }) => {
        const isActive = (active ?? "") === value;
        const href = value ? `?status=${value}` : "?";
        return (
          <Link
            key={value}
            href={href}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
