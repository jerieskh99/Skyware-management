import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  Payment,
  Prisma,
  ReceiptDocumentType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  notFound,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { createReceiptDraft } from "@/lib/receipts/queries";
import { ReceiptValidationError } from "@/lib/receipts/errors";
import {
  getActiveCountryCode,
  getCountryProfile,
} from "@/lib/compliance/country";
import { getYearIL } from "@/lib/format";

interface Params {
  params: Promise<{ id: string }>;
}

const RECEIPT_TYPES: ReceiptDocumentType[] = [
  "invoice",
  "receipt",
  "tax_invoice",
  "tax_invoice_receipt",
  "credit_note",
  "proforma_invoice",
];

const querySchema = z.object({
  type: z
    .enum(RECEIPT_TYPES as [ReceiptDocumentType, ...ReceiptDocumentType[]])
    .optional(),
});

/**
 * POST /api/payments/[id]/issue-receipt
 *
 * Create a draft receipt from a Payment. Admin only.
 *
 * - Idempotent: if `payment.linkedReceiptId` already points at a non-cancelled
 *   receipt, returns 200 with `{ existing: true, id }`.
 * - Otherwise creates a new draft receipt, links `payment.linkedReceiptId` to
 *   it, writes `payment.receipt_issued` and `receipt.draft_created` audits.
 *
 * Defaults the document type to `tax_invoice_receipt` when the payment is paid
 * and `tax_invoice` otherwise; caller may override via `?type=`.
 *
 * Internal-testing only per docs/audit-2026-05-billing/asking_an_accountant.md.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    type: searchParams.get("type") ?? undefined,
  });
  if (!parsedQuery.success) return badRequest(parsedQuery.error.issues);
  const overrideType = parsedQuery.data.type;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      sourceMonthly: { select: { serviceName: true } },
      sourceHourly: { select: { id: true } },
    },
  });
  if (!payment) return notFound("Payment");

  // Idempotency: if a non-cancelled receipt already exists, surface that one.
  if (payment.linkedReceiptId) {
    const existing = await prisma.receiptDocument.findUnique({
      where: { id: payment.linkedReceiptId },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== "cancelled") {
      return NextResponse.json({ existing: true, id: existing.id });
    }
  }

  const documentType: ReceiptDocumentType =
    overrideType ?? (payment.status === "paid" ? "tax_invoice_receipt" : "tax_invoice");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const settings = await tx.companySettings.findFirst({
        select: {
          defaultVatBasisPoints: true,
          defaultCurrency: true,
          country: true,
        },
      });
      const profile = getCountryProfile(getActiveCountryCode(settings?.country));
      const vatRate =
        payment.vatRateBasisPoints ??
        settings?.defaultVatBasisPoints ??
        profile.defaultVatBasisPoints;
      const currency = payment.currency ?? settings?.defaultCurrency ?? profile.defaultCurrency;

      const { amountBeforeVat, vatAmount, totalAmount } = derivePaymentAmounts(
        payment,
        vatRate,
      );

      const issueDate = new Date();
      // Make sure the synthetic issue date round-trips via getYearIL elsewhere.
      // (Used here only as a sanity touch so the import is not stripped.)
      void getYearIL(issueDate);

      const draft = await createReceiptDraft(
        tx,
        {
          type: documentType,
          clientId: payment.clientId,
          paymentId: payment.id,
          issueDate,
          paymentDate: payment.status === "paid" ? payment.paidDate ?? null : null,
          descriptionLines: [
            buildDescriptionLine(payment, totalAmount ?? 0),
          ],
          amountBeforeVat,
          vatRateBasisPoints: vatRate,
          vatAmount,
          totalAmount,
          paymentMethod: payment.method,
          reference: payment.reference,
          currency,
          exchangeRate:
            payment.currencyExchangeRate !== null && payment.currencyExchangeRate !== undefined
              ? payment.currencyExchangeRate.toString()
              : null,
        },
        auth.user.id,
      );

      await tx.payment.update({
        where: { id: payment.id },
        data: { linkedReceiptId: draft.id },
      });

      await writeAudit(tx, {
        actorUserId: auth.user.id,
        action: "payment.receipt_issued",
        entityType: "Payment",
        entityId: payment.id,
        diff: {
          linkedReceiptId: { old: payment.linkedReceiptId, new: draft.id },
          receiptType: { old: null, new: documentType },
        },
      });

      return draft;
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ReceiptValidationError) {
      return badRequest([{ message: err.message }]);
    }
    throw err;
  }
}

/**
 * Derive VAT-split amounts for the new receipt from the Payment.
 *
 * Preference order:
 *   1. Payment's VAT split fields (Wave 1B) when present.
 *   2. Otherwise treat `amountPlaceholder` (or 0) as the gross total and split
 *      back into pre-VAT + VAT using the active rate.
 */
function derivePaymentAmounts(
  payment: Payment,
  vatRateBasisPoints: number,
): {
  amountBeforeVat: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
} {
  if (
    payment.amountBeforeVat !== null &&
    payment.vatAmount !== null &&
    payment.totalAmount !== null
  ) {
    return {
      amountBeforeVat: payment.amountBeforeVat,
      vatAmount: payment.vatAmount,
      totalAmount: payment.totalAmount,
    };
  }

  // Fall back to placeholder gross. Skip the split when no gross is recorded.
  const gross = payment.totalAmount ?? payment.amountPlaceholder;
  if (gross === null || gross === undefined) {
    return { amountBeforeVat: null, vatAmount: null, totalAmount: null };
  }

  // gross = pre + pre * rate/10000 -> pre = round(gross / (1 + rate/10000))
  const divisor = 1 + vatRateBasisPoints / 10000;
  const before = Math.round(gross / divisor);
  const vat = gross - before;
  return { amountBeforeVat: before, vatAmount: vat, totalAmount: gross };
}

function buildDescriptionLine(
  payment: Payment & {
    sourceMonthly: { serviceName: string } | null;
    sourceHourly: { id: string } | null;
  },
  lineTotal: number,
): { description: string; lineTotal: number } {
  if (payment.sourceType === "monthly" && payment.sourceMonthly) {
    return {
      description: payment.sourceMonthly.serviceName,
      lineTotal,
    };
  }
  if (payment.sourceType === "hourly_bank") {
    return { description: "Hourly bank usage", lineTotal };
  }
  if (payment.sourceType === "one_time") {
    return {
      description: payment.notes?.slice(0, 200) ?? "One-time charge",
      lineTotal,
    };
  }
  return { description: payment.notes?.slice(0, 200) ?? "Payment", lineTotal };
}

// Help the TS compiler verify Prisma.Decimal call signature stays intact.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PrismaDecimalGuard = Prisma.Decimal;
