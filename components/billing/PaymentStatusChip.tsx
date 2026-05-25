"use client";

import type { PaymentStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  draft:               "bg-muted text-muted-foreground border-border",
  sent_to_client:      "bg-blue-50 text-blue-700 border-blue-200",
  waiting_for_payment: "bg-amber-50 text-amber-700 border-amber-200",
  partially_paid:      "bg-orange-50 text-orange-700 border-orange-200",
  paid:                "bg-green-50 text-green-700 border-green-200",
  overdue:             "bg-red-50 text-red-700 border-red-200",
  cancelled:           "bg-muted text-muted-foreground/60 border-border",
};

interface Props {
  status: PaymentStatus;
  className?: string;
}

export function PaymentStatusChip({ status, className = "" }: Props) {
  const { t } = useT();
  const chipClass = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`payment.status.${status}`)}
    </span>
  );
}
