import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  FileText,
  Mail,
  Upload,
  Filter,
  CheckSquare,
  ShieldAlert,
  Receipt,
  Banknote,
  Building2,
  CreditCard,
  Landmark,
  Tags,
  Link2,
  Inbox,
  Archive,
  Plug,
  AlertTriangle,
  Lock,
  CircleSlash,
} from "lucide-react";

const CATEGORIES: {
  icon: React.ElementType;
  title: string;
  desc: string;
  related: string;
}[] = [
  {
    icon: CheckSquare,
    title: "Client payment confirmations",
    desc: "Bank or app-issued acknowledgements that a client paid an invoice.",
    related: "Links to Billing → Payments",
  },
  {
    icon: FileText,
    title: "Supplier invoices",
    desc: "Invoices issued by vendors, contractors, and service providers.",
    related: "Future suppliers ledger",
  },
  {
    icon: Receipt,
    title: "Supplier receipts",
    desc: "Receipts issued by suppliers after we pay them.",
    related: "Future suppliers ledger",
  },
  {
    icon: Building2,
    title: "Company expenses",
    desc: "Internal expense receipts — meals, hardware, travel, office.",
    related: "Bookkeeping export",
  },
  {
    icon: CreditCard,
    title: "Subscription receipts",
    desc: "Recurring SaaS and infrastructure billing receipts.",
    related: "Cost-of-tools tracking",
  },
  {
    icon: Landmark,
    title: "Tax documents",
    desc: "Tax authority correspondence, statements, and certificates.",
    related: "Reviewed by accountant",
  },
  {
    icon: Banknote,
    title: "Bank transfer confirmations",
    desc: "Bank-issued confirmations of incoming or outgoing transfers.",
    related: "Reconciled against payments",
  },
];

const WORKFLOW: { icon: React.ElementType; title: string; desc: string }[] = [
  { icon: Inbox, title: "Receive", desc: "Email or manual upload into a dedicated inbox." },
  { icon: Tags, title: "Classify", desc: "Auto-suggest category; admin confirms." },
  { icon: Link2, title: "Link", desc: "Attach to client, payment, supplier, or job." },
  { icon: CheckSquare, title: "Review", desc: "Admin marks the record as reviewed." },
  { icon: Archive, title: "Archive", desc: "Stored for export to bookkeeping later." },
];

const FILTER_FIELDS: { label: string; placeholder?: string; kind: "select" | "input" | "date" }[] = [
  { label: "Client", placeholder: "Any client", kind: "select" },
  { label: "Supplier", placeholder: "Any supplier", kind: "select" },
  { label: "Document type", placeholder: "Any type", kind: "select" },
  { label: "From", kind: "date" },
  { label: "To", kind: "date" },
  { label: "Review status", placeholder: "Any", kind: "select" },
  { label: "Linked", placeholder: "Any", kind: "select" },
  { label: "Source", placeholder: "Email or manual", kind: "select" },
];

const TABLE_COLUMNS = [
  "Document",
  "Type",
  "Source",
  "Linked to",
  "Received",
  "Review",
  "Action",
];

export default async function FinancialDocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const isEnabled = await getFeatureFlag("financial_documents_module");

  return (
    <div className="space-y-8">
      <PageHeader
        icon={FileText}
        title="Financial Documents"
        description="Future module for inbound financial records — payment confirmations, supplier invoices and receipts, expenses, subscriptions, tax documents, and bank transfers."
        actions={<ModuleStatusBadge enabled={isEnabled} />}
      />

      {/* Disabled banner — only when off */}
      {!isEnabled && (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <p className="flex flex-wrap items-center gap-2">
            <CircleSlash className="h-4 w-4 text-muted-foreground" />
            Feature flag{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">financial_documents_module</code>{" "}
            is off. Nothing on this page is wired to ingestion or storage yet.
            <Link href="/admin?tab=flags" className="font-medium text-brand hover:underline">
              Manage feature flags →
            </Link>
          </p>
        </div>
      )}

      {/* Safety / compliance notice */}
      <section className="rounded-xl border border-warn/30 bg-warn-soft/50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-warn">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-2 text-sm">
            <p className="font-medium text-foreground">Read this before the module goes live</p>
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                No real email ingestion is connected — no Gmail, IMAP, SMTP, bank, or cloud-storage account.
              </li>
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                Do not paste passwords, API keys, or OAuth tokens into the portal. No credential vault exists.
              </li>
              <li className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                Every financial document must be reviewed by an admin before it influences billing or reports.
              </li>
              <li className="flex items-start gap-2">
                <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                Receipt and tax-document <em>issuance</em> stays in the separate, accountant-verified Receipts module (currently disabled).
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Planned workflow */}
      <SectionCard
        icon={Plug}
        title="Planned workflow"
        description="How documents will flow through the portal once the module is built."
        bodyClassName="p-4"
      >
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW.map((step, idx) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="relative flex flex-col gap-2 rounded-lg border bg-background p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="text-sm font-medium leading-none">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </li>
            );
          })}
        </ol>
      </SectionCard>

      {/* Document categories */}
      <SectionCard
        icon={Tags}
        title="Document categories"
        description="The seven planned categories the module will route documents into."
        count={CATEGORIES.length}
        bodyClassName="p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map(({ icon: Icon, title, desc, related }) => (
            <div
              key={title}
              className="rounded-lg border bg-background p-4 transition-colors hover:bg-accent/40"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium leading-tight">{title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                {related}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Filters preview */}
      <SectionCard
        icon={Filter}
        title="Filters & search"
        description="Preview of the controls that will be available once the module is enabled."
        actions={
          <span className="rounded-full border border-dashed bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </span>
        }
        bodyClassName="p-4"
      >
        <div aria-disabled className="pointer-events-none select-none">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DisabledField label="Search">
              <input
                disabled
                placeholder="Document #, sender, amount…"
                className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground placeholder:text-muted-foreground/60"
              />
            </DisabledField>
            {FILTER_FIELDS.map((f) => (
              <DisabledField key={f.label} label={f.label}>
                {f.kind === "date" ? (
                  <input
                    type="date"
                    disabled
                    className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground"
                  />
                ) : f.kind === "select" ? (
                  <div className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground/80">
                    <span>{f.placeholder}</span>
                    <span aria-hidden className="text-xs">▾</span>
                  </div>
                ) : (
                  <input
                    disabled
                    placeholder={f.placeholder}
                    className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground placeholder:text-muted-foreground/60"
                  />
                )}
              </DisabledField>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Filters will be URL-driven (server-rendered, shareable) when the module is built — matching the pattern used by Billing and My Jobs.
        </p>
      </SectionCard>

      {/* Ingestion preview */}
      <SectionCard
        icon={Inbox}
        title="Ingestion"
        description="Two intended sources. Both are non-functional in this build."
        bodyClassName="p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <IngestionTile
            icon={Mail}
            title="Email ingestion"
            status="Not connected"
            body="The module will watch a dedicated mailbox and auto-classify incoming documents. No mailbox, OAuth token, or app password is configured."
          />
          <IngestionTile
            icon={Upload}
            title="Manual upload"
            status="Not available"
            body="Admins will upload PDFs, images, or .eml files directly. File storage is not provisioned in this build."
          />
        </div>
      </SectionCard>

      {/* Documents list placeholder */}
      <SectionCard
        icon={FileText}
        title="Documents"
        description="Empty until the module is enabled and a source is connected."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                {TABLE_COLUMNS.map((c) => (
                  <th
                    key={c}
                    className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className="px-4 py-8">
                  <EmptyState
                    icon={FileText}
                    title="No documents yet"
                    description="When the module is enabled, ingested documents will land here with category, source, linked entity, and review status."
                    className="border-none py-2"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Related areas */}
      <SectionCard
        title="Related areas"
        description="Where to go in the meantime."
        bodyClassName="p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RelatedLink href="/clients" icon={Building2} title="Clients" hint="Edit client and billing records" />
          <RelatedLink href="/billing" icon={CreditCard} title="Billing" hint="Payments, banks, charges" />
          <RelatedLink href="/receipts" icon={Receipt} title="Receipts" hint="Accountant-verified module" />
          <RelatedLink href="/admin?tab=flags" icon={ShieldAlert} title="Feature flags" hint="Toggle this module" />
        </div>
        <p className="mt-3 px-1 text-xs text-muted-foreground">
          Production readiness and accountant-verification expectations are tracked in{" "}
          <code className="rounded bg-muted px-1 font-mono text-[11px]">docs/production-readiness.md</code>.
        </p>
      </SectionCard>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function ModuleStatusBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
        Module enabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      Module disabled
    </span>
  );
}

function DisabledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function IngestionTile({
  icon: Icon,
  title,
  status,
  body,
}: {
  icon: React.ElementType;
  title: string;
  status: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-medium">{title}</p>
        </div>
        <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {status}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function RelatedLink({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-brand-soft group-hover:text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </Link>
  );
}

