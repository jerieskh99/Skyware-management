"use client";

import type { PaymentReminderStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";

const STATUS_STYLES: Record<PaymentReminderStatus, string> = {
  scheduled:      "bg-blue-50 text-blue-700 border-blue-200",
  admin_notified: "bg-amber-50 text-amber-700 border-amber-200",
  approved:       "bg-indigo-50 text-indigo-700 border-indigo-200",
  delayed:        "bg-orange-50 text-orange-700 border-orange-200",
  cancelled:      "bg-muted text-muted-foreground/60 border-border",
  sent:           "bg-green-50 text-green-700 border-green-200",
  send_failed:    "bg-red-50 text-red-700 border-red-200",
  bounced:        "bg-red-50 text-red-700 border-red-200",
};

interface Props {
  status: PaymentReminderStatus;
  className?: string;
}

export function ReminderStatusChip({ status, className = "" }: Props) {
  const { t } = useT();
  const chipClass = STATUS_STYLES[status] ?? STATUS_STYLES.scheduled;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {t(`billingReminders.status.${status}`)}
    </span>
  );
}
