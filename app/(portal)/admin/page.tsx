import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { UserManagementSection } from "@/components/admin/UserManagementSection";
import { TagManagementSection } from "@/components/admin/TagManagementSection";
import { FeatureFlagSection } from "@/components/admin/FeatureFlagSection";
import { SlaDefaultsSection } from "@/components/admin/SlaDefaultsSection";
import { CronTriggerSection } from "@/components/admin/CronTriggerSection";
import { RecurringTemplatesSection } from "@/components/admin/RecurringTemplatesSection";
import { Shield, Users, Tag, Flag, BookOpen, SlidersHorizontal, Building2, Network, Clock, Repeat } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { getT } from "@/lib/i18n/server";
import { FALLBACK_PRIORITY_SLA_MINUTES } from "@/lib/sla";
import { getFeatureFlag } from "@/lib/feature-flags";
import { listTemplates } from "@/lib/recurring/template-queries";
import type { JobPriority } from "@prisma/client";

const BASE_TAB_KEYS = [
  { key: "users",   icon: Users },
  { key: "tags",    icon: Tag },
  { key: "flags",   icon: Flag },
  { key: "audit",   icon: BookOpen },
  { key: "org",     icon: Network },
  { key: "sla",     icon: SlidersHorizontal },
  { key: "cron",    icon: Clock },
  { key: "company", icon: Building2 },
] as const;

const RECURRING_TAB = { key: "recurring", icon: Repeat } as const;

const PAGE_SIZE = 25;

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function AdminPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const recurringFlag = await getFeatureFlag("recurring_jobs_enabled");
  const TAB_KEYS = recurringFlag ? [...BASE_TAB_KEYS, RECURRING_TAB] : BASE_TAB_KEYS;
  const tab = TAB_KEYS.some((t) => t.key === sp["tab"]) ? sp["tab"] : "users";
  const { t } = await getT();
  const page = Math.max(1, parseInt(sp["page"] ?? "1", 10));
  const auditAction = sp["action"]?.trim() || undefined;
  const auditEntityType = sp["entityType"]?.trim() || undefined;

  // ── Data fetch based on active tab ──
  let users: Awaited<ReturnType<typeof getUsers>> = [];
  let roleOptions: { key: string; nameEn: string }[] = [];
  let deptOptions: { key: string; nameEn: string }[] = [];
  let tags: Awaited<ReturnType<typeof getTags>> = [];
  let flags: Awaited<ReturnType<typeof getFlags>> = [];
  let auditLogs: Awaited<ReturnType<typeof getAuditLogs>>["rows"] = [];
  let auditTotal = 0;
  let auditPageCount = 0;
  let orgRoles: Awaited<ReturnType<typeof getOrgRoles>> = [];
  let orgDepts: Awaited<ReturnType<typeof getOrgDepts>> = [];
  let slaRows: Awaited<ReturnType<typeof getSlaRows>> = [];
  let recurringRows: Awaited<ReturnType<typeof listTemplates>> = [];
  let recurringDepts: Awaited<ReturnType<typeof getRecurringDepts>> = [];
  let recurringClients: Awaited<ReturnType<typeof getRecurringClients>> = [];
  let recurringUsers: Awaited<ReturnType<typeof getRecurringUsers>> = [];

  if (tab === "users") {
    [users, roleOptions, deptOptions] = await Promise.all([
      getUsers(),
      prisma.role.findMany({ select: { key: true, nameEn: true }, orderBy: { key: "asc" } }),
      prisma.department.findMany({ select: { key: true, nameEn: true }, orderBy: { key: "asc" } }),
    ]);
  } else if (tab === "tags") {
    tags = await getTags();
  } else if (tab === "flags") {
    flags = await getFlags();
  } else if (tab === "audit") {
    const result = await getAuditLogs({ page, action: auditAction, entityType: auditEntityType });
    auditLogs = result.rows;
    auditTotal = result.total;
    auditPageCount = result.pageCount;
  } else if (tab === "org") {
    [orgRoles, orgDepts] = await Promise.all([getOrgRoles(), getOrgDepts()]);
  } else if (tab === "sla") {
    slaRows = await getSlaRows();
  } else if (tab === "recurring") {
    [recurringRows, recurringDepts, recurringClients, recurringUsers] = await Promise.all([
      listTemplates(),
      getRecurringDepts(),
      getRecurringClients(),
      getRecurringUsers(),
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title={t("admin.title")}
        description={t("admin.description")}
      />

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b">
        {TAB_KEYS.map(({ key, icon: Icon }) => {
          const isActive = tab === key;
          return (
            <Link
              key={key}
              href={`/admin?tab=${key}`}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-brand" : ""}`} />
              {t(`admin.tabs.${key}`)}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "users" && (
        <UserManagementSection
          users={users}
          roleOptions={roleOptions}
          deptOptions={deptOptions}
        />
      )}

      {tab === "tags" && <TagManagementSection tags={tags} />}

      {tab === "flags" && <FeatureFlagSection flags={flags} />}

      {tab === "audit" && (
        <AuditLogTab
          logs={auditLogs}
          total={auditTotal}
          page={page}
          pageCount={auditPageCount}
          filterAction={auditAction}
          filterEntityType={auditEntityType}
        />
      )}

      {tab === "org" && <OrgTab roles={orgRoles} departments={orgDepts} />}

      {tab === "sla" && <SlaDefaultsSection rows={slaRows} />}

      {tab === "cron" && <CronTriggerSection />}

      {tab === "company" && <CompanyTab />}

      {tab === "recurring" && (
        <RecurringTemplatesSection
          templates={recurringRows.map((r) => ({
            id: r.id,
            name: r.name,
            titleTemplate: r.titleTemplate,
            description: r.description,
            departmentId: r.departmentId,
            clientId: r.clientId,
            priority: r.priority,
            severity: r.severity,
            defaultAssigneeId: r.defaultAssigneeId,
            cadence: r.cadence,
            anchor: r.anchor,
            timezone: r.timezone,
            nextRunAt: r.nextRunAt,
            lastGeneratedAt: r.lastGeneratedAt,
            generatedCount: r.generatedCount,
            status: r.status,
          }))}
          deptOptions={recurringDepts}
          clientOptions={recurringClients}
          userOptions={recurringUsers}
        />
      )}
    </div>
  );
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function getUsers() {
  return prisma.user.findMany({
    select: {
      id: true, username: true, email: true, displayName: true,
      isActive: true, lastLoginAt: true,
      role: { select: { key: true, nameEn: true, isAdmin: true } },
      department: { select: { key: true, nameEn: true } },
    },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });
}

async function getTags() {
  return prisma.tag.findMany({
    select: {
      id: true, key: true, labelEn: true, labelHe: true,
      scope: true, colorHex: true, isSystem: true,
      _count: { select: { jobTags: true, postTags: true } },
    },
    orderBy: [{ scope: "asc" }, { key: "asc" }],
  });
}

async function getFlags() {
  return prisma.featureFlag.findMany({
    select: { id: true, key: true, enabled: true, description: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
}

async function getOrgRoles() {
  return prisma.role.findMany({
    select: {
      key: true, nameEn: true, nameHe: true, isAdmin: true,
      _count: { select: { users: { where: { isActive: true } } } },
    },
    orderBy: { isAdmin: "desc" },
  });
}

async function getOrgDepts() {
  return prisma.department.findMany({
    select: {
      key: true, nameEn: true, nameHe: true, isGlobal: true,
      _count: { select: { users: { where: { isActive: true } } } },
    },
    orderBy: { key: "asc" },
  });
}

async function getSlaRows(): Promise<
  Array<{ priority: JobPriority; targetMinutes: number; updatedAt: Date | null }>
> {
  const rows = await prisma.slaDefaults.findMany({
    select: { priority: true, targetMinutes: true, updatedAt: true },
  });
  const byPriority = new Map(rows.map((r) => [r.priority, r]));
  const order: JobPriority[] = ["urgent", "high", "normal", "low"];
  return order.map((p) => {
    const row = byPriority.get(p);
    return {
      priority: p,
      targetMinutes: row?.targetMinutes ?? FALLBACK_PRIORITY_SLA_MINUTES[p],
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

async function getRecurringDepts() {
  return prisma.department.findMany({
    select: { id: true, nameEn: true, nameHe: true },
    orderBy: { key: "asc" },
  });
}

async function getRecurringClients() {
  return prisma.client.findMany({
    where: { status: "active" },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
    take: 500,
  });
}

async function getRecurringUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

async function getAuditLogs(opts: { page: number; action?: string; entityType?: string }) {
  const where = {
    ...(opts.action ? { action: { contains: opts.action, mode: "insensitive" as const } } : {}),
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true, action: true, entityType: true, entityId: true,
        diffJson: true, createdAt: true,
        actor: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total, pageCount: Math.ceil(total / PAGE_SIZE) };
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

type AuditRow = Awaited<ReturnType<typeof getAuditLogs>>["rows"][number];

function AuditLogTab({
  logs, total, page, pageCount, filterAction, filterEntityType,
}: {
  logs: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
  filterAction?: string;
  filterEntityType?: string;
}) {
  const ENTITY_TYPES = ["Job", "Payment", "User", "Tag", "FeatureFlag", "Client", "ClientEnvironmentNote",
    "MonthlyBillingItem", "HourlyBank", "HourlyBankUsage", "OneTimeJobCharge",
    "CommunicationPost", "CommunicationReply", "ReceiptDocument"];

  return (
    <div className="space-y-4">
      {/* Filter form */}
      <form method="GET" action="/admin" className="flex flex-wrap gap-2">
        <input type="hidden" name="tab" value="audit" />
        <input
          name="action"
          defaultValue={filterAction}
          placeholder="Filter by action (e.g. job.created)"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-64"
        />
        <select
          name="entityType"
          defaultValue={filterEntityType}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((et) => <option key={et} value={et}>{et}</option>)}
        </select>
        <button type="submit" className="h-9 rounded-md border bg-muted px-4 text-sm hover:bg-accent">
          Filter
        </button>
        <Link href="/admin?tab=audit" className="inline-flex h-9 items-center rounded-md border px-4 text-sm text-muted-foreground hover:bg-accent">
          Clear
        </Link>
      </form>

      <p className="text-xs text-muted-foreground">{total.toLocaleString()} entries{filterAction || filterEntityType ? " matching filter" : ""}</p>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">No audit entries found.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">When</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">Entity</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden md:table-cell">Diff preview</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {log.actor ? log.actor.username : <span className="text-muted-foreground italic">system</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-primary">{log.action}</td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{log.entityType}</td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                      {log.diffJson && log.diffJson !== null
                        ? JSON.stringify(log.diffJson).slice(0, 80)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link href={`/admin?tab=audit&page=${page - 1}${filterAction ? `&action=${filterAction}` : ""}${filterEntityType ? `&entityType=${filterEntityType}` : ""}`}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
              Previous
            </Link>
          )}
          <span className="text-xs text-muted-foreground">Page {page} of {pageCount}</span>
          {page < pageCount && (
            <Link href={`/admin?tab=audit&page=${page + 1}${filterAction ? `&action=${filterAction}` : ""}${filterEntityType ? `&entityType=${filterEntityType}` : ""}`}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Roles & Departments tab (read-only) ──────────────────────────────────────

type OrgRole = Awaited<ReturnType<typeof getOrgRoles>>[number];
type OrgDept = Awaited<ReturnType<typeof getOrgDepts>>[number];

function OrgTab({ roles, departments }: { roles: OrgRole[]; departments: OrgDept[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Roles */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Roles</h3>
        <p className="text-xs text-muted-foreground">Read-only. Roles are defined in the database seed.</p>
        <div className="divide-y rounded-lg border">
          {roles.map((r) => (
            <div key={r.key} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{r.nameEn}</p>
                <p className="text-xs text-muted-foreground" dir="rtl">{r.nameHe}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.isAdmin && (
                  <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                    Admin
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {r._count.users} active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Departments */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Departments</h3>
        <p className="text-xs text-muted-foreground">Read-only. Departments are defined in the database seed.</p>
        <div className="divide-y rounded-lg border">
          {departments.map((d) => (
            <div key={d.key} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{d.nameEn}</p>
                <p className="text-xs text-muted-foreground" dir="rtl">{d.nameHe}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {d.isGlobal && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    Global
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {d._count.users} active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Company details tab (placeholder) ────────────────────────────────────────

function CompanyTab() {
  const fields = [
    { label: "Company name (English)", placeholder: "Skyware IT LTD", note: "" },
    { label: "Company name (Hebrew)", placeholder: "סקייוור אי.טי בע\"מ", note: "" },
    { label: "Company number (ח.פ. / ע.מ.)", placeholder: "5X-XXXXXXX", note: "Reference only — verify with accountant" },
    { label: "VAT / Tax number", placeholder: "5XXXXXXXX", note: "Reference only — verify with accountant" },
    { label: "Registered address", placeholder: "123 Example St, Haifa, Israel", note: "" },
    { label: "Phone", placeholder: "+972-X-XXXXXXX", note: "" },
    { label: "Email", placeholder: "billing@example.com", note: "" },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3 text-sm text-amber-800">
        <p className="font-medium">Needs accountant verification</p>
        <p className="mt-0.5 text-xs text-amber-700">
          Company details are used as headers in receipt/tax documents (Phase 7). All values must be verified
          by an Israeli accountant before receipts are finalized. Do not enter unverified legal information.
        </p>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        Company details storage is not yet implemented. These fields will be saved to a{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs">CompanySettings</code> table in a future pass.
        For now, enter your company details directly in the receipt template when Phase 7 is configured.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ label, placeholder, note }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{label}</label>
            <input
              disabled
              placeholder={placeholder}
              className="flex h-10 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground placeholder:text-muted-foreground/50 cursor-not-allowed"
            />
            {note && <p className="text-[11px] text-amber-600">{note}</p>}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Logo and stamp upload will be added when the company settings table is implemented.
      </p>
    </div>
  );
}
