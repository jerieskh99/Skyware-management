import type { BankBurn } from "@/lib/billing/queries";
import type { MonthlyBillingStatus, HourlyBankStatus, PaymentStatus, Currency, LatenessUnit } from "@prisma/client";

export interface MonthlyItem {
  id: string;
  serviceName: string;
  priceAmountPlaceholder: number | null;
  currency: Currency;
  billingCycle: string;
  startDate: string | Date;
  endDate: string | Date | null;
  status: MonthlyBillingStatus;
}

export interface HourlyUsage {
  id: string;
  minutesUsed: number;
  usedAt: string | Date;
  note: string | null;
  jobId: string;
}

export interface HourlyBank {
  id: string;
  totalHoursPurchasedMinutes: number | null;
  pricePerHourPlaceholder: number | null;
  totalPaymentPlaceholder: number | null;
  currency: Currency;
  purchaseDate: string | Date;
  expiryDate: string | Date | null;
  status: HourlyBankStatus;
  alertThresholdPercent: number;
  usages: HourlyUsage[];
}

export interface OneTimeCharge {
  id: string;
  jobNameSnapshot: string;
  priceAmountPlaceholder: number | null;
  currency: Currency;
  dateCreated: string | Date;
  job: { id: string; publicNumber: string; title: string };
  payment: { id: string; status: PaymentStatus } | null;
}

export interface PaymentRow {
  id: string;
  sourceType: string;
  amountPlaceholder: number | null;
  currency: Currency;
  issuedDate: string | Date;
  dueDate: string | Date | null;
  paidDate: string | Date | null;
  status: PaymentStatus;
  method: string | null;
  reference: string | null;
  notes: string | null;
  latenessAmount: number | null;
  latenessUnit: LatenessUnit | null;
  latenessNotifyAdminFirst: boolean;
  autoSendAfterMinutes: number | null;
  sourceMonthly: { id: string; serviceName: string } | null;
  createdBy: { displayName: string };
}

export interface BillingAccount {
  id: string;
  defaultCurrency: Currency;
  monthlyBillingItems: MonthlyItem[];
  hourlyBanks: HourlyBank[];
  oneTimeCharges: OneTimeCharge[];
}

export interface Props {
  clientId: string;
  clientName: string;
  /** Client email; manual-contact is disabled when absent. */
  clientEmail?: string | null;
  billingAccount: BillingAccount | null;
  payments: PaymentRow[];
  /** Per-bank burn projection. Keyed by bank id. `null` means the strip is off. */
  burnByBank?: Record<string, BankBurn> | null;
  /** When false, burn projection lines are hidden. */
  burnEnabled?: boolean;
  /** Gates the per-payment reminder-rule editor. */
  remindersEnabled?: boolean;
  /** Gates the "Contact client" buttons. */
  manualContactEnabled?: boolean;
}
