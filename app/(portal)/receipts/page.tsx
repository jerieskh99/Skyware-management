import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ReceiptDocumentStatus,
  ReceiptDocumentType,
} from "@prisma/client";
import { Receipt, AlertTriangle, Download } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listReceipts } from "@/lib/receipts/queries";
import { getFeatureFlag } from "@/lib/feature-flags";
import { envAllowsProductionIssuance } from "@/lib/compliance/gates";
import { getT } from "@/lib/i18n/server";
import { formatCurrency, formatCurrencyILS, formatDateIL } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ReceiptStatusChip } from "@/components/receipts/ReceiptStatusChip";
import { ReceiptTypeChip } from "@/components/receipts/ReceiptTypeChip";
import { AllocationStatusPill } from "@/components/receipts/AllocationStatusPill";
import { CreateDraftWrapper } from "@/components/receipts/CreateDraftWrapper";

const VALID_STATUSES = new Set<ReceiptDocumentStatus>([
  "draft",
  "finalized",
  "cancelled",
]);

const VALID_TYPES = new Set<ReceiptDocumentType>([
  "invoice",
  "receipt",
  "tax_invoice",
  "tax_invoice_receipt",
  "credit_note",
  "proforma_invoice",
]);

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function fmtAmount(
  amount: number | null,
  currency: string,
  locale: Locale,
): string {
  if (amount === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(amount, locale);
  return formatCurrency(amount, currency, locale);
}

export default async function ReceiptsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const sp = await searchParams;
  const statusParam = pickParam(sp, "status") as ReceiptDocumentStatus | undefined;
  const typeParam = pickParam(sp, "type") as ReceiptDocumentType | undefined;
  const yearParamStr = pickParam(sp, "year");
  const clientId = pickParam(sp, "clientId");
  const pageStr = pickParam(sp, "page");

  const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : undefined;
  const type = typeParam && VALID_TYPES.has(typeParam) ? typeParam : undefined;
  let year: number | undefined;
  if (yearParamStr) {
    const n = Number(yearParamStr);
    if (Number.isInteger(n) && n >= 2000 && n <= 2999) year = n;
  }
  const page = pageStr ? Math.max(1, Number(pageStr) || 1) : 1;
  const perPage = 20;

  const [finalizeEnabled, listResult, clientsRaw] = await Promise.all([
    getFeatureFlag("receipt_finalize_enabled"),
    listReceipts({
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(clientId ? { clientId } : {}),
      page,
      perPage,
    }),
    prisma.client.findMany({
      where: { status: "active" },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const envAllows = envAllowsProductionIssuance();
  const complianceLocked = !finalizeEnabled || !envAllows;

  const { t, locale } = await getT();

  // Build a map for client name lookups in the table.
  const clientById = new Map(clientsRaw.map((c) => [c.id, c.companyName]));

  // Resolve any clientIds present in receipts not already in the active list
  // (the receipt may reference an inactive client).
  const missingIds = Array.from(
    new Set(
      listResult.items
        .map((r) => r.clientId)
        .filter((id) => !clientById.has(id)),
    ),
  );
  if (missingIds.length > 0) {
    const extras = await prisma.client.findMany({
      where: { id: { in: missingIds } },
      select: { id: true, companyName: true },
    });
    for (const c of extras) clientById.set(c.id, c.companyName);
  }

  const totalPages = Math.max(1, Math.ceil(listResult.total / listResult.perPage));

  // Preserve filters when paginating.
  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (type) baseParams.set("type", type);
  if (year !== undefined) baseParams.set("year", String(year));
  if (clientId) baseParams.set("clientId", clientId);

  function pageHref(p: number): string {
    const u = new URLSearchParams(baseParams);
    if (p > 1) u.set("page", String(p));
    const qs = u.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title={t("receipts.list.title")}
        description={t("receipts.list.subtitle")}
        actions={<CreateDraftWrapper clients={clientsRaw} />}
      />

      {complianceLocked && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-amber-800">{t("receipts.list.complianceBanner")}</p>
        </div>
      )}

      <FilterStrip
        activeStatus={status}
        activeType={type}
        activeYear={year}
        activeClientId={clientId}
        clients={clientsRaw}
      />

      {listResult.items.length === 0 ? (
        <EmptyState icon={Receipt} title={t("receipts.list.empty")} />
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.number")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.type")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.client")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">
                    {t("receipts.list.cols.issueDate")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.total")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.status")}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    {t("receipts.list.cols.allocation")}
                  </th>
                  <th className="px-4 py-2.5 text-end text-xs font-medium text-muted-foreground">
                    {t("receipts.list.cols.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {listResult.items.map((r) => {
                  const numberLabel =
                    r.documentNumber !== null && r.documentNumberYear !== null
                      ? `${r.documentNumberYear}-${r.documentNumber}`
                      : t("receipts.detail.draftBadge");
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/receipts/${r.id}`}
                          className="font-semibold hover:underline"
                        >
                          {numberLabel}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ReceiptTypeChip type={r.type} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/clients/${r.clientId}`}
                          className="font-medium hover:underline"
                        >
                          {clientById.get(r.clientId) ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {formatDateIL(new Date(r.issueDate), locale)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {fmtAmount(r.totalAmount, r.currency, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <ReceiptStatusChip status={r.status} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <AllocationStatusPill status={r.allocationStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/receipts/${r.id}`}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            {t("common.viewAll")}
                          </Link>
                          <a
                            href={`/api/receipts/${r.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label={t("receipts.detail.downloadPdf")}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {listResult.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {t("receipts.list.pagination.showing")}{" "}
            {(listResult.page - 1) * listResult.perPage + 1}
            {"–"}
            {Math.min(listResult.page * listResult.perPage, listResult.total)} {t("receipts.list.pagination.of")} {listResult.total}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              size="sm"
              variant="outline"
              disabled={listResult.page <= 1}
            >
              {listResult.page > 1 ? (
                <Link href={pageHref(listResult.page - 1)}>{t("common.previous")}</Link>
              ) : (
                <span>{t("common.previous")}</span>
              )}
            </Button>
            <span className="px-1">
              {listResult.page} / {totalPages}
            </span>
            <Button
              asChild
              size="sm"
              variant="outline"
              disabled={listResult.page >= totalPages}
            >
              {listResult.page < totalPages ? (
                <Link href={pageHref(listResult.page + 1)}>{t("common.next")}</Link>
              ) : (
                <span>{t("common.next")}</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter strip ───────────────────────────────────────────────────────────

interface FilterStripProps {
  activeStatus?: ReceiptDocumentStatus;
  activeType?: ReceiptDocumentType;
  activeYear?: number;
  activeClientId?: string;
  clients: { id: string; companyName: string }[];
}

async function FilterStrip({
  activeStatus,
  activeType,
  activeYear,
  activeClientId,
  clients,
}: FilterStripProps) {
  const { t } = await getT();

  function hrefWith(patch: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (activeStatus && patch["status"] === undefined) params.set("status", activeStatus);
    if (activeType && patch["type"] === undefined) params.set("type", activeType);
    if (activeYear !== undefined && patch["year"] === undefined) params.set("year", String(activeYear));
    if (activeClientId && patch["clientId"] === undefined) params.set("clientId", activeClientId);
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  const statuses: Array<{ value: ReceiptDocumentStatus | undefined; label: string }> = [
    { value: undefined, label: t("receipts.list.filters.all") },
    { value: "draft", label: t("receipts.status.draft") },
    { value: "finalized", label: t("receipts.status.finalized") },
    { value: "cancelled", label: t("receipts.status.cancelled") },
  ];

  const types: Array<{ value: ReceiptDocumentType | undefined; label: string }> = [
    { value: undefined, label: t("receipts.list.filters.all") },
    { value: "tax_invoice_receipt", label: t("receipts.type.tax_invoice_receipt") },
    { value: "tax_invoice", label: t("receipts.type.tax_invoice") },
    { value: "receipt", label: t("receipts.type.receipt") },
    { value: "invoice", label: t("receipts.type.invoice") },
    { value: "credit_note", label: t("receipts.type.credit_note") },
    { value: "proforma_invoice", label: t("receipts.type.proforma_invoice") },
  ];

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="space-y-2">
      <ChipRow
        label={t("receipts.list.filters.status")}
        items={statuses.map((s) => ({
          key: String(s.value ?? "all"),
          label: s.label,
          href: hrefWith({ status: s.value, page: undefined }),
          active: (activeStatus ?? null) === (s.value ?? null),
        }))}
      />
      <ChipRow
        label={t("receipts.list.filters.type")}
        items={types.map((s) => ({
          key: String(s.value ?? "all"),
          label: s.label,
          href: hrefWith({ type: s.value, page: undefined }),
          active: (activeType ?? null) === (s.value ?? null),
        }))}
      />
      <ChipRow
        label={t("receipts.list.filters.year")}
        items={[
          {
            key: "all",
            label: t("receipts.list.filters.all"),
            href: hrefWith({ year: undefined, page: undefined }),
            active: activeYear === undefined,
          },
          ...years.map((y) => ({
            key: String(y),
            label: String(y),
            href: hrefWith({ year: String(y), page: undefined }),
            active: activeYear === y,
          })),
        ]}
      />
      {activeClientId && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t("receipts.list.filters.client")}:</span>
          <Link
            href={hrefWith({ clientId: undefined, page: undefined })}
            className="rounded-full border bg-primary text-primary-foreground border-primary px-3 py-1 font-medium"
          >
            {clients.find((c) => c.id === activeClientId)?.companyName ?? activeClientId} ×
          </Link>
        </div>
      )}
    </div>
  );
}

function ChipRow({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="me-1 text-muted-foreground">{label}:</span>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            i.active
              ? "bg-primary text-primary-foreground border-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
