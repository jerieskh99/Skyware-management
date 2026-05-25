import { NextResponse } from "next/server";
import { z } from "zod";
import type { ReceiptDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  deleteReceiptDraft,
  getReceipt,
  updateReceiptDraft,
} from "@/lib/receipts/queries";
import {
  ReceiptStateError,
  ReceiptValidationError,
} from "@/lib/receipts/errors";

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

const PAYMENT_METHODS = [
  "bank_transfer",
  "bit",
  "cheque",
  "cash",
  "credit_card",
  "other",
] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be YYYY-MM-DD",
});

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, {
  message: "Exchange rate must be a positive decimal",
});

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().int().optional(),
  lineTotal: z.number().int(),
});

const patchSchema = z.object({
  type: z.enum(RECEIPT_TYPES as [ReceiptDocumentType, ...ReceiptDocumentType[]]).optional(),
  paymentId: z.string().uuid().nullable().optional(),
  issueDate: dateString.optional(),
  paymentDate: dateString.nullable().optional(),
  descriptionLines: z.array(lineSchema).min(1).optional(),
  amountBeforeVat: z.number().int().nonnegative().nullable().optional(),
  vatRateBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  vatAmount: z.number().int().nonnegative().nullable().optional(),
  totalAmount: z.number().int().nonnegative().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).optional(),
  exchangeRate: decimalString.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  language: z.enum(["he", "en"]).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/receipts/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const row = await getReceipt(id);
  if (!row) return notFound("Receipt");
  return NextResponse.json(row);
}

// ---------------------------------------------------------------------------
// PATCH /api/receipts/[id]
// ---------------------------------------------------------------------------

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  if (d.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: d.paymentId },
      select: { id: true },
    });
    if (!payment) return badRequest([{ path: ["paymentId"], message: "Payment not found" }]);
  }

  try {
    const updated = await prisma.$transaction((tx) =>
      updateReceiptDraft(
        tx,
        id,
        {
          ...(d.type !== undefined ? { type: d.type } : {}),
          ...(d.paymentId !== undefined ? { paymentId: d.paymentId } : {}),
          ...(d.issueDate !== undefined ? { issueDate: new Date(d.issueDate) } : {}),
          ...(d.paymentDate !== undefined
            ? { paymentDate: d.paymentDate ? new Date(d.paymentDate) : null }
            : {}),
          ...(d.descriptionLines !== undefined
            ? { descriptionLines: d.descriptionLines }
            : {}),
          ...(d.amountBeforeVat !== undefined
            ? { amountBeforeVat: d.amountBeforeVat }
            : {}),
          ...(d.vatRateBasisPoints !== undefined
            ? { vatRateBasisPoints: d.vatRateBasisPoints }
            : {}),
          ...(d.vatAmount !== undefined ? { vatAmount: d.vatAmount } : {}),
          ...(d.totalAmount !== undefined ? { totalAmount: d.totalAmount } : {}),
          ...(d.paymentMethod !== undefined
            ? { paymentMethod: d.paymentMethod }
            : {}),
          ...(d.reference !== undefined ? { reference: d.reference } : {}),
          ...(d.currency !== undefined ? { currency: d.currency } : {}),
          ...(d.exchangeRate !== undefined ? { exchangeRate: d.exchangeRate } : {}),
          ...(d.notes !== undefined ? { notes: d.notes } : {}),
          ...(d.language !== undefined ? { language: d.language } : {}),
        },
        auth.user.id,
      ),
    );
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ReceiptValidationError) {
      return badRequest([{ message: err.message }]);
    }
    if (err instanceof ReceiptStateError) {
      if (err.message === "receipt not found") return notFound("Receipt");
      return unprocessable(err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/receipts/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;

  try {
    await prisma.$transaction((tx) =>
      deleteReceiptDraft(tx, id, auth.user.id),
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ReceiptStateError) {
      if (err.message === "receipt not found") return notFound("Receipt");
      return unprocessable(err.message);
    }
    throw err;
  }
}
