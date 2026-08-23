import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import {
  getBillingKpis,
  listPayments,
  listPaymentsByAgingBucket,
  getAgingPayments,
  getAgingBuckets,
  AGING_BUCKET_KEYS,
  type AgingBucketKey,
} from "@/lib/billing/queries";
import { PaymentStatusChip } from "@/components/billing/PaymentStatusChip";
import { BillingPageActions } from "@/components/billing/BillingPageActions";
import { AgingStrip } from "@/components/billing/AgingStrip";
import { SavedViewBar } from "@/components/saved-views/SavedViewBar";
import type { PaymentStatus } from "@prisma/client";
import { CreditCard, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getT } from "@/lib/i18n/server";
import { formatCurrency, formatCurrencyILS, formatDateIL } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

const VALID_STATUSES = new Set<string>([
  "draft", "sent_to_client", "waiting_for_payment",
  "partially_paid", "paid", "cancelled", "overdue",
]);

const VALID_AGING = new Set<string>(AGING_BUCKET_KEYS);

interface Props {
  searchParams: Promise<Record<string, string>>;
}

function fmtDate(d: string | Date | null, locale: Locale) {
  if (!d) return "—";
  return formatDateIL(new Date(d), locale);
}

function fmtAmount(amount: number | null, currency: string, locale: Locale) {
  if (amount === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(amount, locale);
  return formatCurrency(amount, currency, locale);
}

export default async function BillingPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const rawStatuses = (sp["status"] ? [sp["status"]] : []).filter((s) => VALID_STATUSES.has(s)) as PaymentStatus[];
  const clientFilter = sp["clientId"] ?? undefined;
  const agingFilter = sp["aging"] && VALID_AGING.has(sp["aging"]) ? (sp["aging"] as AgingBucketKey) : undefined;

  const flags = await getFeatureFlags([
    "saved_views_enabled",
    "saved_views_team_shared_enabled",
    "aging_buckets_enabled",
    "manual_contact_enabled",
  ]);
  const savedViewsEnabled = flags["saved_views_enabled"] ?? false;
  const teamSharedEnabled = flags["saved_views_team_shared_enabled"] ?? false;
  const agingEnabled = flags["aging_buckets_enabled"] ?? false;
  const manualContactEnabled = flags["manual_contact_enabled"] ?? false;

  const [kpis, payments, aging, agingBuckets] = await Promise.all([
    getBillingKpis(),
    agingFilter
      ? listPaymentsByAgingBucket(agingFilter)
      : listPayments({ status: rawStatuses.length ? rawStatuses : undefined, clientId: clientFilter }),
    getAgingPayments(),
    agingEnabled ? getAgingBuckets() : Promise.resolve(null),
  ]);

  const { t, locale } = await getT();

  const sourceTypeLabel = (sourceType: string): string => {
    if (sourceType === "monthly" || sourceType === "hourly_bank" || sourceType === "one_time") {
      return t(`payment.sourceType.${sourceType}`);
    }
    return sourceType;
  };

  const currentFilters: Record<string, string> = {};
  if (rawStatuses[0]) currentFilters["status"] = rawStatuses[0];
  if (clientFilter) currentFilters["clientId"] = clientFilter;
  if (agingFilter) currentFilters["aging"] = agingFilter;

  return (
    <div className="space-y-8">
      <PageHeader
        icon={CreditCard}
        title={t("billing.title")}
        description={t("billing.description")}
      />

      {savedViewsEnabled && (
        <SavedViewBar
          scope="billing"
          currentFilters={currentFilters}
          currentUserId={user.id}
          isAdmin={isAdmin(user)}
          teamSharedEnabled={teamSharedEnabled}
        />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={CreditCard}
          tone={kpis.unpaidCount > 0 ? "warn" : "default"}
          label={t("billing.kpiUnpaid")}
          value={kpis.unpaidCount}
          href="?status=waiting_for_payment"
        />
        <KpiCard
          icon={AlertTriangle}
          tone={kpis.overdueCount > 0 ? "danger" : "default"}
          label={t("billing.kpiOverdue")}
          value={kpis.overdueCount}
          href="?status=overdue"
        />
        <KpiCard
          icon={CheckCircle2}
          tone="success"
          label={t("billing.kpiPaidThisMonth")}
          value={kpis.paidThisMonth}
          href="?status=paid"
        />
      </div>

      {/* Aging buckets strip (feature-flagged) */}
      {agingEnabled && agingBuckets && (
        <AgingStrip
          buckets={agingBuckets}
          active={agingFilter}
          hrefFor={(b) => `?aging=${b}`}
          labels={{
            title: t("billing.aging.title"),
            b0_30: t("billing.aging.b0_30"),
            b31_60: t("billing.aging.b31_60"),
            b61_90: t("billing.aging.b61_90"),
            b91_plus: t("billing.aging.b91_plus"),
            count: t("billing.aging.count"),
            amount: t("billing.aging.amount"),
            empty: t("billing.aging.empty"),
          }}
        />
      )}

      {/* Aging payments highlight */}
      {aging.length > 0 && (
        <SectionCard
          icon={Clock}
          title={t("billing.needsAttention")}
          description={t("billing.needsAttentionDescription")}
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
                    {p.sourceMonthly?.serviceName ?? sourceTypeLabel(p.sourceType)} ·{" "}
                    {fmtAmount(p.amountPlaceholder, p.currency, locale)}
                    {p.dueDate && ` · ${t("billing.due")} ${fmtDate(p.dueDate, locale)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentStatusChip status={p.status} />
                  <BillingPageActions payment={p} manualContactEnabled={manualContactEnabled} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* All payments */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("billing.allPayments")}</h2>
          <StatusFilterLinks active={rawStatuses[0]} />
        </div>

        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={t("billing.noPayments")}
            description={t("billing.noPaymentsDescription")}
          />
        ) : (
          <div className="rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colClient")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colSource")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colAmount")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("billing.colIssued")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("billing.colDue")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colStatus")}</th>
                    <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colActions")}</th>
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
                        {p.sourceMonthly?.serviceName ?? sourceTypeLabel(p.sourceType)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {fmtAmount(p.amountPlaceholder, p.currency, locale)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {fmtDate(p.issuedDate, locale)}
                      </td>
                      <td className={`px-4 py-3 text-xs hidden sm:table-cell ${p.status === "overdue" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {fmtDate(p.dueDate, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusChip status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <BillingPageActions payment={p} manualContactEnabled={manualContactEnabled} />
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

async function StatusFilterLinks({ active }: { active?: string }) {
  const { t } = await getT();
  const FILTER_OPTIONS: { label: string; value: PaymentStatus | "" }[] = [
    { label: t("billing.filterAll"), value: "" },
    { label: t("billing.filterAwaiting"), value: "waiting_for_payment" },
    { label: t("billing.filterPartial"), value: "partially_paid" },
    { label: t("billing.filterOverdue"), value: "overdue" },
    { label: t("billing.filterPaid"), value: "paid" },
    { label: t("billing.filterDraft"), value: "draft" },
  ];

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
