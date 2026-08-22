"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import type { Props } from "./types";
import { MonthlySection } from "./MonthlySection";
import { HourlyBanksSection } from "./HourlyBanksSection";
import { OneTimeSection } from "./OneTimeSection";
import { PaymentsSection } from "./PaymentsSection";
import { EmailHistorySection } from "./EmailHistorySection";

export function ClientBillingTab({
  clientId,
  clientName,
  clientEmail = null,
  billingAccount,
  payments,
  burnByBank = null,
  burnEnabled = false,
  remindersEnabled = false,
  manualContactEnabled = false,
}: Props) {
  // Bumped after any successful manual send so the email-history table refetches.
  const [emailRefreshKey, setEmailRefreshKey] = useState(0);
  const onContactSent = () => setEmailRefreshKey((k) => k + 1);

  if (!billingAccount) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-amber-600 font-medium">No billing account found for this client.</p>
        <p className="mt-1 text-xs text-muted-foreground">This should be created automatically when a client is added.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        Currency: <strong>{billingAccount.defaultCurrency}</strong> · Amounts shown are reference placeholders only — not verified accounting figures.
      </div>

      <MonthlySection clientId={clientId} items={billingAccount.monthlyBillingItems} currency={billingAccount.defaultCurrency} />
      <Separator />
      <HourlyBanksSection
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        banks={billingAccount.hourlyBanks}
        currency={billingAccount.defaultCurrency}
        burnByBank={burnByBank}
        burnEnabled={burnEnabled}
        manualContactEnabled={manualContactEnabled}
        onContactSent={onContactSent}
      />
      <Separator />
      <OneTimeSection clientId={clientId} charges={billingAccount.oneTimeCharges} />
      <Separator />
      <PaymentsSection
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        payments={payments}
        monthlyItems={billingAccount.monthlyBillingItems}
        hourlyBanks={billingAccount.hourlyBanks}
        remindersEnabled={remindersEnabled}
        manualContactEnabled={manualContactEnabled}
        onContactSent={onContactSent}
      />

      <Separator />
      <EmailHistorySection clientId={clientId} refreshKey={emailRefreshKey} />
    </div>
  );
}
