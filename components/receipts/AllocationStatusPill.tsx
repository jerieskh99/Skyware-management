"use client";

import type { AllocationStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const ALLOCATION_STYLES: Record<AllocationStatus, string> = {
  not_required: "bg-muted text-muted-foreground border-border",
  pending:      "bg-amber-50 text-amber-700 border-amber-200",
  issued:       "bg-green-50 text-green-700 border-green-200",
  failed:       "bg-red-50 text-red-700 border-red-200",
};

const ALLOCATION_LABELS: Record<AllocationStatus, string> = {
  not_required: "receipts.allocation.notRequired",
  pending:      "receipts.allocation.pending",
  issued:       "receipts.allocation.issued",
  failed:       "receipts.allocation.failed",
};

interface Props {
  status: AllocationStatus;
  className?: string;
}

export function AllocationStatusPill({ status, className = "" }: Props) {
  const { t } = useT();
  const chipClass = ALLOCATION_STYLES[status] ?? ALLOCATION_STYLES.not_required;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(ALLOCATION_LABELS[status])}
    </span>
  );
}
