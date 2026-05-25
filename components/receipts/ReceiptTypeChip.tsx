"use client";

import type { ReceiptDocumentType } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const TYPE_STYLES: Record<ReceiptDocumentType, string> = {
  invoice:             "bg-slate-50 text-slate-700 border-slate-200",
  receipt:             "bg-blue-50 text-blue-700 border-blue-200",
  tax_invoice:         "bg-indigo-50 text-indigo-700 border-indigo-200",
  tax_invoice_receipt: "bg-violet-50 text-violet-700 border-violet-200",
  credit_note:         "bg-amber-50 text-amber-700 border-amber-200",
  proforma_invoice:    "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface Props {
  type: ReceiptDocumentType;
  className?: string;
}

export function ReceiptTypeChip({ type, className = "" }: Props) {
  const { t } = useT();
  const chipClass = TYPE_STYLES[type] ?? TYPE_STYLES.invoice;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`receipts.type.${type}`)}
    </span>
  );
}
