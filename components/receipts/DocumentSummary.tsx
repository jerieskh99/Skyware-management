"use client";

import type { ReceiptDocument } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import {
  formatCurrency,
  formatCurrencyILS,
  formatDateIL,
} from "@/lib/format";
import { ReceiptTypeChip } from "./ReceiptTypeChip";
import { ReceiptStatusChip } from "./ReceiptStatusChip";
import { AllocationStatusPill } from "./AllocationStatusPill";

interface LineRowShape {
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
}

interface Props {
  receipt: ReceiptDocument;
}

function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asMoney(
  minorUnits: number | null,
  currency: string,
  locale: "he" | "en",
): string {
  if (minorUnits === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(minorUnits, locale);
  return formatCurrency(minorUnits, currency, locale);
}

export function DocumentSummary({ receipt }: Props) {
  const { t, locale } = useT();

  const lines: LineRowShape[] = Array.isArray(receipt.descriptionLines)
    ? (receipt.descriptionLines as unknown as LineRowShape[])
    : [];

  const vatRatePct = (receipt.vatRateBasisPoints / 100).toFixed(2);

  const documentNumberLabel =
    receipt.documentNumber !== null && receipt.documentNumberYear !== null
      ? `${receipt.documentNumberYear}-${receipt.documentNumber}`
      : t("receipts.detail.draftBadge");

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("receipts.detail.summary.heading")}</h2>
        <div className="flex items-center gap-1.5">
          <ReceiptTypeChip type={receipt.type} />
          <ReceiptStatusChip status={receipt.status} />
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row label={t("receipts.detail.summary.documentNumber")} value={documentNumberLabel} />
        <Row label={t("receipts.detail.summary.type")} value={t(`receipts.type.${receipt.type}`)} />
        <Row
          label={t("receipts.detail.summary.issueDate")}
          value={formatDateIL(new Date(receipt.issueDate), locale)}
        />
        <Row
          label={t("receipts.detail.summary.paymentDate")}
          value={receipt.paymentDate ? formatDateIL(new Date(receipt.paymentDate), locale) : "—"}
        />
        <Row label={t("receipts.detail.summary.currency")} value={receipt.currency} />
        <Row
          label={t("receipts.detail.summary.exchangeRate")}
          value={receipt.exchangeRate ? receipt.exchangeRate.toString() : "—"}
        />
        <Row
          label={t("receipts.detail.summary.vatRate")}
          value={`${vatRatePct}% (${receipt.vatRateBasisPoints} bp)`}
        />
        <Row label={t("receipts.detail.summary.language")} value={receipt.language} />
        <Row
          label={t("receipts.detail.summary.paymentMethod")}
          value={receipt.paymentMethod ? t(`billing.method_${receipt.paymentMethod}`) : "—"}
        />
        <Row label={t("receipts.detail.summary.reference")} value={receipt.reference ?? "—"} />
        <Row
          label={t("receipts.detail.summary.allocationStatus")}
          value={<AllocationStatusPill status={receipt.allocationStatus} />}
        />
        <Row
          label={t("receipts.detail.summary.allocationNumber")}
          value={receipt.allocationNumber ?? "—"}
        />
      </dl>

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("receipts.detail.summary.linesHeading")}
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                  {t("receipts.detail.summary.lineDescription")}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">
                  {t("receipts.detail.summary.lineQuantity")}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">
                  {t("receipts.detail.summary.lineUnitPrice")}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">
                  {t("receipts.detail.summary.lineTotal")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-xs text-muted-foreground">
                    —
                  </td>
                </tr>
              )}
              {lines.map((line, idx) => {
                const qty = readNumber(line.quantity);
                const unit = readNumber(line.unitPrice);
                const total = readNumber(line.lineTotal);
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2" dir="auto">
                      {readString(line.description)}
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs">
                      {qty !== null ? qty : "—"}
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs">
                      {unit !== null ? asMoney(unit, receipt.currency, locale) : "—"}
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs">
                      {total !== null ? asMoney(total, receipt.currency, locale) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {t("receipts.detail.summary.amountBeforeVat")}
          </p>
          <p className="font-mono">
            {asMoney(receipt.amountBeforeVat, receipt.currency, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t("receipts.detail.summary.vatAmount")}
          </p>
          <p className="font-mono">
            {asMoney(receipt.vatAmount, receipt.currency, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t("receipts.detail.summary.totalAmount")}
          </p>
          <p className="font-mono font-semibold">
            {asMoney(receipt.totalAmount, receipt.currency, locale)}
          </p>
        </div>
      </div>

      {receipt.notes && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("receipts.detail.summary.notes")}
          </h3>
          <p className="whitespace-pre-wrap text-sm" dir="auto">
            {receipt.notes}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-end text-sm font-medium">{value}</dd>
    </div>
  );
}
