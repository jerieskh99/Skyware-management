"use client";

import type { ReceiptDocumentStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const STATUS_STYLES: Record<ReceiptDocumentStatus, string> = {
  draft:     "bg-muted text-muted-foreground border-border",
  finalized: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-muted text-muted-foreground/60 border-border line-through",
};

interface Props {
  status: ReceiptDocumentStatus;
  className?: string;
}

export function ReceiptStatusChip({ status, className = "" }: Props) {
  const { t } = useT();
  const chipClass = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`receipts.status.${status}`)}
    </span>
  );
}
