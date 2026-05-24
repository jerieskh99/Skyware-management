import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import {
  getClientDetail,
  getClientJobs,
  getClientEnvironmentNotes,
} from "@/lib/clients/queries";
import { getClientBillingData, getBankBurn, type BankBurn } from "@/lib/billing/queries";
import { getFeatureFlag } from "@/lib/feature-flags";
import { EnvironmentNotesSection } from "@/components/clients/EnvironmentNotesSection";
import { ClientDetailHeader } from "@/components/clients/ClientDetailHeader";
import { ClientBillingTab } from "@/components/billing/ClientBillingTab";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import {
  Building2,
  Briefcase,
  CreditCard,
  Receipt,
  Server,
  ArrowLeft,
} from "lucide-react";

const TABS = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "jobs", label: "Jobs", icon: Briefcase },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "receipts", label: "Receipts", icon: Receipt },
  { key: "environment", label: "Environment", icon: Server },
];

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const activeTab = TABS.some((t) => t.key === sp["tab"]) ? sp["tab"] : "overview";

  const client = await getClientDetail(id);
  if (!client) notFound();

  const [jobs, envNotes, billingData] = await Promise.all([
    activeTab === "jobs" || activeTab === "overview" ? getClientJobs(id) : Promise.resolve([]),
    activeTab === "environment" ? getClientEnvironmentNotes(id) : Promise.resolve([]),
    activeTab === "billing" ? getClientBillingData(id) : Promise.resolve(null),
  ]);

  let burnByBank: Record<string, BankBurn> | null = null;
  let burnEnabled = false;
  if (activeTab === "billing" && billingData?.billingAccount?.hourlyBanks?.length) {
    burnEnabled = await getFeatureFlag("hourly_burn_enabled");
    if (burnEnabled) {
      const ids = billingData.billingAccount.hourlyBanks.map((b) => b.id);
      const burnMap = await getBankBurn(ids);
      burnByBank = Object.fromEntries(burnMap);
    }
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Clients
      </Link>

      {/* Header */}
      <ClientDetailHeader client={client} />

      {/* Tab nav */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/clients/${id}?tab=${tab.key}`}
              className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab client={client} recentJobs={jobs.slice(0, 5)} />
      )}
      {activeTab === "jobs" && <JobsTab jobs={jobs} />}
      {activeTab === "billing" && (
        <ClientBillingTab
          clientId={id}
          clientName={client.companyName}
          billingAccount={billingData?.billingAccount ?? null}
          payments={billingData?.payments ?? []}
          burnByBank={burnByBank}
          burnEnabled={burnEnabled}
        />
      )}
      {activeTab === "receipts" && <ReceiptsPlaceholder />}
      {activeTab === "environment" && (
        <EnvironmentNotesSection clientId={id} initialNotes={envNotes} />
      )}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClientDetail>>>;
type ClientJob = Awaited<ReturnType<typeof getClientJobs>>[number];

function OverviewTab({
  client,
  recentJobs,
}: {
  client: ClientDetail;
  recentJobs: ClientJob[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Company & contact */}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Company details</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow label="Company name" value={client.companyName} />
          <InfoRow label="Contact person" value={client.contactPerson} />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Phone" value={client.phone} />
          <InfoRow
            label="Address"
            value={client.address}
            multiline
          />
          <InfoRow
            label="Tax ID (ח״פ / ע״מ)"
            value={
              client.israeliTaxId
                ? `${client.israeliTaxId} — reference only`
                : null
            }
          />
        </dl>
      </div>

      {/* Status & meta */}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Status & metadata</h3>
        <dl className="space-y-2 text-sm">
          <InfoRow
            label="Status"
            value={
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  client.status === "active"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {client.status === "active" ? "Active" : "Inactive"}
              </span>
            }
          />
          <InfoRow
            label="Billing account"
            value={
              client.billingAccount ? (
                <span className="text-muted-foreground">
                  {client.billingAccount.defaultCurrency} — linked
                </span>
              ) : (
                <span className="text-amber-600">No billing account</span>
              )
            }
          />
          <InfoRow label="Total jobs" value={String(client._count.jobs)} />
          <InfoRow label="Created by" value={client.createdBy.displayName} />
          <InfoRow
            label="Added"
            value={new Date(client.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        </dl>

        {client.notes && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
              {client.notes}
            </p>
          </div>
        )}
      </div>

      {/* Recent jobs summary */}
      {recentJobs.length > 0 && (
        <div className="rounded-lg border p-4 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent jobs</h3>
            <Link
              href={`/clients/${client.id}?tab=jobs`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-1.5">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href={`/my-jobs/${job.id}`}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent/40"
              >
                <span className="truncate font-medium">
                  {job.publicNumber && (
                    <span className="me-1.5 text-muted-foreground">
                      #{job.publicNumber}
                    </span>
                  )}
                  {job.title}
                </span>
                <JobStatusChip status={job.status} className="shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

function JobsTab({ jobs }: { jobs: ClientJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Briefcase className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No jobs linked to this client.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Jobs created with this client selected will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <Link
          key={job.id}
          href={`/my-jobs/${job.id}`}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {job.publicNumber && (
                <span className="text-xs text-muted-foreground">
                  #{job.publicNumber}
                </span>
              )}
              <span className="font-medium truncate">{job.title}</span>
            </div>
            {job.assignedEmployee && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {job.assignedEmployee.displayName}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <JobStatusChip status={job.status} />
            <span className="text-[10px] text-muted-foreground">
              {new Date(job.createdAt).toLocaleDateString("en-GB")}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Receipts placeholder ────────────────────────────────────────────────────

function ReceiptsPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-semibold">Receipts & Documents — Phase 7</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
        Tax invoices, receipts, proformas, and credit notes will be generated in Phase 7.
      </p>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  if (!value && value !== 0) {
    return (
      <div className={`flex gap-2 ${multiline ? "flex-col" : "items-start justify-between"}`}>
        <dt className="shrink-0 text-muted-foreground">{label}</dt>
        <dd className="text-muted-foreground/50 italic">—</dd>
      </div>
    );
  }
  return (
    <div className={`flex gap-2 ${multiline ? "flex-col" : "items-start justify-between"}`}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`${multiline ? "" : "text-end"} font-medium`}>{value}</dd>
    </div>
  );
}
