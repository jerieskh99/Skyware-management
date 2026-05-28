import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { canManageReminders } from "@/lib/billing/permissions";
import { prisma } from "@/lib/prisma";
import { getFeatureFlag } from "@/lib/feature-flags";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReminderQueueTable } from "@/components/billing/ReminderQueueTable";
import type { ReminderDTO } from "@/components/billing/ReminderDecisionDialog";
import type { Prisma, PaymentReminderStatus } from "@prisma/client";
import { BellRing } from "lucide-react";

const STATUS_VALUES: PaymentReminderStatus[] = [
  "scheduled",
  "admin_notified",
  "approved",
  "delayed",
  "cancelled",
  "sent",
  "send_failed",
  "bounced",
];
const VALID_STATUSES = new Set<string>(STATUS_VALUES);

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function BillingRemindersPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  if (!(await getFeatureFlag("billing_reminders_enabled"))) notFound();
  if (!isAdmin(user) || !canManageReminders(user)) notFound();

  const sp = await searchParams;
  const statusFilter =
    sp["status"] && VALID_STATUSES.has(sp["status"]) ? (sp["status"] as PaymentReminderStatus) : undefined;
  const clientFilter = sp["clientId"] || undefined;

  const { t } = await getT();

  const where: Prisma.PaymentReminderWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(clientFilter ? { payment: { clientId: clientFilter } } : {}),
  };

  const [rows, clientOptions] = await Promise.all([
    prisma.paymentReminder.findMany({
      where,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        failureReason: true,
        payment: {
          select: {
            id: true,
            reference: true,
            dueDate: true,
            amountPlaceholder: true,
            totalAmount: true,
            currency: true,
            latenessAmount: true,
            latenessUnit: true,
            client: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: [{ scheduledFor: "desc" }],
      take: 200,
    }),
    // Distinct clients that have at least one reminder, for the filter select.
    prisma.client.findMany({
      where: { payments: { some: { reminders: { some: {} } } } },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 500,
    }),
  ]);

  const reminders: ReminderDTO[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
    failureReason: r.failureReason,
    payment: {
      id: r.payment.id,
      reference: r.payment.reference,
      dueDate: r.payment.dueDate ? r.payment.dueDate.toISOString() : null,
      amount: r.payment.totalAmount ?? r.payment.amountPlaceholder ?? null,
      currency: r.payment.currency,
      latenessAmount: r.payment.latenessAmount,
      latenessUnit: r.payment.latenessUnit,
    },
    client: r.payment.client,
  }));

  const hasFilter = Boolean(statusFilter || clientFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BellRing}
        title={t("billingReminders.title")}
        description={t("billingReminders.description")}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterChips active={statusFilter} clientId={clientFilter} t={t} />
        {clientOptions.length > 0 && (
          <form method="GET" action="/billing/reminders" className="flex items-center gap-2">
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <select
              name="clientId"
              defaultValue={clientFilter ?? ""}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("billingReminders.filterAllClients")}</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
            <button type="submit" className="h-8 rounded-md border bg-muted px-3 text-xs hover:bg-accent">
              {t("common.filter")}
            </button>
          </form>
        )}
      </div>

      {reminders.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title={hasFilter ? t("billingReminders.emptyFiltered") : t("billingReminders.empty")}
          description={hasFilter ? undefined : t("billingReminders.emptyDescription")}
          action={
            hasFilter ? (
              <Link
                href="/billing/reminders"
                className="inline-flex h-9 items-center rounded-md border px-4 text-sm text-muted-foreground hover:bg-accent"
              >
                {t("common.clear")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ReminderQueueTable reminders={reminders} />
      )}
    </div>
  );
}

function StatusFilterChips({
  active,
  clientId,
  t,
}: {
  active?: PaymentReminderStatus;
  clientId?: string;
  t: (key: string) => string;
}) {
  const clientQs = clientId ? `&clientId=${clientId}` : "";
  const options: { label: string; value: PaymentReminderStatus | "" }[] = [
    { label: t("billingReminders.filterAll"), value: "" },
    { label: t("billingReminders.status.admin_notified"), value: "admin_notified" },
    { label: t("billingReminders.status.scheduled"), value: "scheduled" },
    { label: t("billingReminders.status.approved"), value: "approved" },
    { label: t("billingReminders.status.delayed"), value: "delayed" },
    { label: t("billingReminders.status.sent"), value: "sent" },
    { label: t("billingReminders.status.send_failed"), value: "send_failed" },
    { label: t("billingReminders.status.cancelled"), value: "cancelled" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ label, value }) => {
        const isActive = (active ?? "") === value;
        const href = value ? `?status=${value}${clientQs}` : clientId ? `?clientId=${clientId}` : "?";
        return (
          <Link
            key={value || "all"}
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
