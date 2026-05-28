"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ReminderStatusChip } from "./ReminderStatusChip";
import { ReminderDecisionDialog, type ReminderDTO } from "./ReminderDecisionDialog";
import { useT } from "@/lib/i18n/client";
import { formatCurrency, formatCurrencyILS, formatDateIL, formatDateTimeIL } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { LatenessUnit } from "@prisma/client";
// lucide-react@0.469.0 ships a corrupt build missing dist/esm/icons/gavel.js
// (the .js.map is present but the .js is not), which breaks the webpack
// build. Scale is a present, semantically-equivalent "review/decide" icon.
import { Scale } from "lucide-react";

function paymentHandle(reference: string | null, id: string): string {
  return reference || `PMT-${id.slice(0, 8)}`;
}

function fmtAmount(amount: number | null, currency: string, locale: Locale): string {
  if (amount === null) return "—";
  if (currency === "ILS") return formatCurrencyILS(amount, locale);
  return formatCurrency(amount, currency, locale);
}

function latenessSummary(
  amount: number | null,
  unit: LatenessUnit | null,
  t: (k: string) => string,
): string {
  if (amount === null || unit === null) return t("billing.lateness.summaryNone");
  const key = unit === "weeks" ? "billing.lateness.summaryWeeks" : "billing.lateness.summaryDays";
  return t(key).replace("{{amount}}", String(amount));
}

interface Props {
  reminders: ReminderDTO[];
}

export function ReminderQueueTable({ reminders }: Props) {
  const { t, locale } = useT();
  const [active, setActive] = useState<ReminderDTO | null>(null);

  return (
    <>
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billingReminders.colClient")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billingReminders.colPayment")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billingReminders.colAmount")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">{t("billingReminders.colDue")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">{t("billingReminders.colRule")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("billingReminders.colScheduled")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billingReminders.colStatus")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billingReminders.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reminders.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${r.client.id}?tab=billing`} className="font-medium hover:underline">
                      {r.client.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {paymentHandle(r.payment.reference, r.payment.id)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {fmtAmount(r.payment.amount, r.payment.currency, locale)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {r.payment.dueDate ? formatDateIL(new Date(r.payment.dueDate), locale) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                    {latenessSummary(r.payment.latenessAmount, r.payment.latenessUnit, t)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                    {r.scheduledFor ? formatDateTimeIL(new Date(r.scheduledFor), locale) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ReminderStatusChip status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActive(r)}>
                      <Scale className="me-1 h-3 w-3" /> {t("billingReminders.review")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {active && (
        <ReminderDecisionDialog
          reminder={active}
          open={active !== null}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
