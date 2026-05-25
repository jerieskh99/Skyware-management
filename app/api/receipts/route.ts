import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  ReceiptDocumentStatus,
  ReceiptDocumentType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  createReceiptDraft,
  listReceipts,
} from "@/lib/receipts/queries";
import { ReceiptValidationError } from "@/lib/receipts/errors";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RECEIPT_TYPES: ReceiptDocumentType[] = [
  "invoice",
  "receipt",
  "tax_invoice",
  "tax_invoice_receipt",
  "credit_note",
  "proforma_invoice",
];

const RECEIPT_STATUSES: ReceiptDocumentStatus[] = [
  "draft",
  "finalized",
  "cancelled",
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

const createSchema = z.object({
  type: z.enum(RECEIPT_TYPES as [ReceiptDocumentType, ...ReceiptDocumentType[]]),
  clientId: z.string().uuid(),
  paymentId: z.string().uuid().nullable().optional(),
  issueDate: dateString,
  paymentDate: dateString.nullable().optional(),
  descriptionLines: z.array(lineSchema).min(1),
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
// GET /api/receipts
// ---------------------------------------------------------------------------

/**
 * List receipts. Admin only. Filterable by status, type, year, and clientId.
 * Pagination is 1-based via `page`/`perPage` (defaults 1/20, cap 100).
 *
 * Returns `{ items, total, page, perPage, totalPages }` so the UI can render a
 * pager without a second round-trip for the count.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status") as ReceiptDocumentStatus | null;
  const type = searchParams.get("type") as ReceiptDocumentType | null;
  const yearStr = searchParams.get("year");
  const clientId = searchParams.get("clientId");
  const pageStr = searchParams.get("page");
  const perPageStr = searchParams.get("perPage");

  if (status && !RECEIPT_STATUSES.includes(status)) {
    return badRequest([{ path: ["status"], message: "Invalid status" }]);
  }
  if (type && !RECEIPT_TYPES.includes(type)) {
    return badRequest([{ path: ["type"], message: "Invalid type" }]);
  }

  let year: number | undefined;
  if (yearStr) {
    const parsed = Number(yearStr);
    if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2999) {
      return badRequest([{ path: ["year"], message: "Invalid year" }]);
    }
    year = parsed;
  }

  if (clientId) {
    const ok = z.string().uuid().safeParse(clientId);
    if (!ok.success) {
      return badRequest([{ path: ["clientId"], message: "Invalid clientId" }]);
    }
  }

  const page = pageStr ? Math.max(1, Number(pageStr) || 1) : 1;
  const perPage = perPageStr ? Math.max(1, Number(perPageStr) || 20) : 20;

  const result = await listReceipts({
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(clientId ? { clientId } : {}),
    page,
    perPage,
  });

  return NextResponse.json({
    ...result,
    totalPages: Math.max(1, Math.ceil(result.total / result.perPage)),
  });
}

// ---------------------------------------------------------------------------
// POST /api/receipts
// ---------------------------------------------------------------------------

/**
 * Create a draft receipt. Admin only.
 *
 * The draft path is open during internal testing per
 * docs/audit-2026-05-billing/asking_an_accountant.md §3. Only the finalize
 * endpoint is gated by `receipt_finalize_enabled`; drafts may always be
 * created so QA can exercise the editor surface.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // Confirm the client exists before opening a transaction; cheap fast-fail.
  const client = await prisma.client.findUnique({
    where: { id: d.clientId },
    select: { id: true },
  });
  if (!client) return badRequest([{ path: ["clientId"], message: "Client not found" }]);

  if (d.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: d.paymentId },
      select: { id: true },
    });
    if (!payment) return badRequest([{ path: ["paymentId"], message: "Payment not found" }]);
  }

  try {
    const created = await prisma.$transaction((tx) =>
      createReceiptDraft(
        tx,
        {
          type: d.type,
          clientId: d.clientId,
          paymentId: d.paymentId ?? null,
          issueDate: new Date(d.issueDate),
          paymentDate: d.paymentDate ? new Date(d.paymentDate) : null,
          descriptionLines: d.descriptionLines,
          amountBeforeVat: d.amountBeforeVat ?? null,
          vatRateBasisPoints: d.vatRateBasisPoints ?? null,
          vatAmount: d.vatAmount ?? null,
          totalAmount: d.totalAmount ?? null,
          paymentMethod: d.paymentMethod ?? null,
          reference: d.reference ?? null,
          ...(d.currency ? { currency: d.currency } : {}),
          exchangeRate: d.exchangeRate ?? null,
          notes: d.notes ?? null,
          ...(d.language ? { language: d.language } : {}),
        },
        auth.user.id,
      ),
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof ReceiptValidationError) {
      return badRequest([{ message: err.message }]);
    }
    throw err;
  }
}
