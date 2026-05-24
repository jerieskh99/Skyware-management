"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkPaidSheet } from "./MarkPaidSheet";
import type { PaymentStatus, Currency } from "@prisma/client";
import { Pencil } from "lucide-react";

interface Payment {
  id: string;
  status: PaymentStatus;
  amountPlaceholder: number | null;
  currency: Currency;
  issuedDate: Date | string;
  dueDate: Date | string | null;
  sourceType: string;
  client: { id: string; companyName: string };
  sourceMonthly: { serviceName: string } | null;
}

export function BillingPageActions({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);

  if (payment.status === "paid" || payment.status === "cancelled") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        <Pencil className="me-1 h-3 w-3" /> Update
      </Button>
      {open && (
        <MarkPaidSheet
          payment={payment}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
