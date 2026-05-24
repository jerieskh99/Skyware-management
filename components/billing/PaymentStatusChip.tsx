import type { PaymentStatus } from "@prisma/client";

const CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  draft:               { label: "Draft",           className: "bg-muted text-muted-foreground border-border" },
  sent_to_client:      { label: "Sent",             className: "bg-blue-50 text-blue-700 border-blue-200" },
  waiting_for_payment: { label: "Awaiting payment", className: "bg-amber-50 text-amber-700 border-amber-200" },
  partially_paid:      { label: "Partial",          className: "bg-orange-50 text-orange-700 border-orange-200" },
  paid:                { label: "Paid",             className: "bg-green-50 text-green-700 border-green-200" },
  overdue:             { label: "Overdue",          className: "bg-red-50 text-red-700 border-red-200" },
  cancelled:           { label: "Cancelled",        className: "bg-muted text-muted-foreground/60 border-border" },
};

interface Props {
  status: PaymentStatus;
  className?: string;
}

export function PaymentStatusChip({ status, className = "" }: Props) {
  const { label, className: chipClass } = CONFIG[status] ?? CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass} ${className}`}
    >
      {label}
    </span>
  );
}
