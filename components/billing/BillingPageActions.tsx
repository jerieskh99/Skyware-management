"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkPaidSheet } from "./MarkPaidSheet";
import { ManualContactDialog } from "./ManualContactDialog";
import type { PaymentStatus, Currency } from "@prisma/client";
import { Pencil, Mail } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { formatDateIL } from "@/lib/format";

interface Payment {
  id: string;
  status: PaymentStatus;
  amountPlaceholder: number | null;
  currency: Currency;
  issuedDate: Date | string;
  dueDate: Date | string | null;
  reference?: string | null;
  sourceType: string;
  client: { id: string; companyName: string };
  sourceMonthly: { serviceName: string } | null;
}

export function BillingPageActions({
  payment,
  manualContactEnabled = false,
}: {
  payment: Payment;
  manualContactEnabled?: boolean;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const terminal = payment.status === "paid" || payment.status === "cancelled";

  // Payment-scoped render vars for the templates (client_name + company_name +
  // contact_url are filled server-side).
  const handle = payment.reference || `PMT-${payment.id.slice(0, 8)}`;
  const vars: Record<string, string> = { payment_public_number: handle, currency: payment.currency };
  if (payment.amountPlaceholder != null) vars.amount = (payment.amountPlaceholder / 100).toFixed(2);
  if (payment.dueDate) {
    vars.due_date = formatDateIL(new Date(payment.dueDate), locale);
    const days = Math.floor((Date.now() - new Date(payment.dueDate).getTime()) / 86_400_000);
    vars.days_overdue = String(Math.max(0, days));
  }

  return (
    <div className="flex items-center gap-2">
      {manualContactEnabled && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setContactOpen(true)}
        >
          <Mail className="me-1 h-3 w-3" /> {t("billing.contactClient")}
        </Button>
      )}

      {terminal ? (
        !manualContactEnabled && <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setOpen(true)}
        >
          <Pencil className="me-1 h-3 w-3" /> Update
        </Button>
      )}

      {open && (
        <MarkPaidSheet payment={payment} onClose={() => setOpen(false)} />
      )}

      {manualContactEnabled && contactOpen && (
        <ManualContactDialog
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          clientId={payment.client.id}
          clientName={payment.client.companyName}
          hasEmail
          paymentId={payment.id}
          defaultTemplateKind="payment_reminder_client"
          vars={vars}
        />
      )}
    </div>
  );
}
