import type {
  Prisma,
  ReceiptDocument,
  ReceiptDocumentStatus,
  ReceiptDocumentType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  getActiveCountryCode,
  getCountryProfile,
} from "@/lib/compliance/country";
import { ReceiptStateError, ReceiptValidationError } from "./errors";

/**
 * Domain queries for the receipts module: list/get plus draft CRUD.
 *
 * Finalize, cancel, credit-note, and allocation stay in their own files
 * (`finalize.ts`, `cancel.ts`, `credit-note.ts`, `allocation.ts`). This file
 * does NOT reserve document numbers; numbering is the exclusive responsibility
 * of `finalizeReceipt`.
 *
 * Internal-testing-only per docs/audit-2026-05-billing/asking_an_accountant.md.
 * Production issuance stays locked behind the three-gate model
 * (implementation_plan.md §6.5).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface DescriptionLine {
  description: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
}

export interface ListReceiptsFilters {
  status?: ReceiptDocumentStatus;
  type?: ReceiptDocumentType;
  year?: number;
  clientId?: string;
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Page size; defaults to 20, capped at 100. */
  perPage?: number;
}

export interface ListReceiptsResult {
  items: ReceiptDocument[];
  total: number;
  page: number;
  perPage: number;
}

export interface CreateReceiptDraftInput {
  type: ReceiptDocumentType;
  clientId: string;
  paymentId?: string | null;
  issueDate: Date;
  paymentDate?: Date | null;
  descriptionLines: DescriptionLine[];
  amountBeforeVat?: number | null;
  /** VAT rate in basis points (1800 = 18.00%). Defaults from CompanySettings. */
  vatRateBasisPoints?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  paymentMethod?: string | null;
  reference?: string | null;
  currency?: "ILS" | "USD" | "EUR";
  /** Decimal string (e.g. "3.654321") for non-ILS rows. */
  exchangeRate?: string | null;
  notes?: string | null;
  language?: "he" | "en";
}

export interface UpdateReceiptDraftInput {
  type?: ReceiptDocumentType;
  paymentId?: string | null;
  issueDate?: Date;
  paymentDate?: Date | null;
  descriptionLines?: DescriptionLine[];
  amountBeforeVat?: number | null;
  vatRateBasisPoints?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  paymentMethod?: string | null;
  reference?: string | null;
  currency?: "ILS" | "USD" | "EUR";
  exchangeRate?: string | null;
  notes?: string | null;
  language?: "he" | "en";
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;

/**
 * List receipts with optional filters. Newest issued first.
 *
 * `year` filters on `documentNumberYear` when present, so drafts (whose year is
 * still null) are excluded by a `year` filter. Callers wanting "drafts for the
 * 2026 books" should combine `status=draft` and `year=2026` only if the draft
 * editor stamps the year early; today drafts have no year until finalize.
 */
export async function listReceipts(
  filters: ListReceiptsFilters,
): Promise<ListReceiptsResult> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(filters.perPage ?? DEFAULT_PER_PAGE)),
  );

  const where: Prisma.ReceiptDocumentWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.year !== undefined) where.documentNumberYear = filters.year;
  if (filters.clientId) where.clientId = filters.clientId;

  const [items, total] = await Promise.all([
    prisma.receiptDocument.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.receiptDocument.count({ where }),
  ]);

  return { items, total, page, perPage };
}

export async function getReceipt(id: string): Promise<ReceiptDocument | null> {
  return prisma.receiptDocument.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a draft receipt. Numbering is NOT reserved here; only `finalizeReceipt`
 * advances `ReceiptDocumentSequence`. Defaults for VAT rate, currency, and
 * language come from `CompanySettings` (or the country profile when the
 * singleton row is missing).
 *
 * Auto-fills `vatAmount` and `totalAmount` when only the pre-VAT amount and
 * rate were supplied so the editor can produce a math-consistent draft from a
 * minimal payload.
 */
export async function createReceiptDraft(
  tx: DbClient,
  input: CreateReceiptDraftInput,
  actorUserId: string,
): Promise<ReceiptDocument> {
  if (!input.descriptionLines.length) {
    throw new ReceiptValidationError("descriptionLines required");
  }

  const settings = await tx.companySettings.findFirst({
    select: {
      defaultVatBasisPoints: true,
      defaultCurrency: true,
      country: true,
    },
  });
  const profile = getCountryProfile(getActiveCountryCode(settings?.country));

  const vatRate =
    input.vatRateBasisPoints ?? settings?.defaultVatBasisPoints ?? profile.defaultVatBasisPoints;
  const currency = input.currency ?? settings?.defaultCurrency ?? profile.defaultCurrency;
  const language = input.language ?? profile.documentLanguageDefault;

  const { amountBeforeVat, vatAmount, totalAmount } = deriveAmounts({
    amountBeforeVat: input.amountBeforeVat ?? null,
    vatAmount: input.vatAmount ?? null,
    totalAmount: input.totalAmount ?? null,
    vatRateBasisPoints: vatRate,
  });

  const data: Prisma.ReceiptDocumentUncheckedCreateInput = {
    type: input.type,
    clientId: input.clientId,
    paymentId: input.paymentId ?? null,
    status: "draft",
    issueDate: input.issueDate,
    paymentDate: input.paymentDate ?? null,
    descriptionLines: input.descriptionLines as unknown as Prisma.InputJsonValue,
    amountBeforeVat,
    vatRateBasisPoints: vatRate,
    vatAmount,
    totalAmount,
    paymentMethod: (input.paymentMethod as Prisma.ReceiptDocumentUncheckedCreateInput["paymentMethod"]) ?? null,
    reference: input.reference ?? null,
    currency,
    notes: input.notes ?? null,
    language,
    allocationStatus: "not_required",
    exchangeRate: input.exchangeRate ?? null,
  };

  const created = await tx.receiptDocument.create({ data });

  await writeAudit(tx as Prisma.TransactionClient, {
    actorUserId,
    action: "receipt.draft_created",
    entityType: "ReceiptDocument",
    entityId: created.id,
    diff: {
      type: { old: null, new: created.type },
      clientId: { old: null, new: created.clientId },
      status: { old: null, new: created.status },
    },
  });

  return created;
}

/**
 * Edit a draft receipt. Rejects with `ReceiptStateError` on non-draft rows so
 * the route layer maps it to 422 (matching the existing finalize/cancel error
 * surface). Auto-recomputes `vatAmount`/`totalAmount` when the patch leaves
 * those fields off but supplies the pre-VAT and rate.
 */
export async function updateReceiptDraft(
  tx: DbClient,
  id: string,
  patch: UpdateReceiptDraftInput,
  actorUserId: string,
): Promise<ReceiptDocument> {
  const existing = await tx.receiptDocument.findUnique({ where: { id } });
  if (!existing) throw new ReceiptStateError("receipt not found");
  if (existing.status !== "draft") {
    throw new ReceiptStateError("must be draft");
  }

  if (patch.descriptionLines !== undefined && !patch.descriptionLines.length) {
    throw new ReceiptValidationError("descriptionLines required");
  }

  const nextVatRate = patch.vatRateBasisPoints ?? existing.vatRateBasisPoints;
  const merged = deriveAmounts({
    amountBeforeVat:
      patch.amountBeforeVat !== undefined ? patch.amountBeforeVat : existing.amountBeforeVat,
    vatAmount: patch.vatAmount !== undefined ? patch.vatAmount : existing.vatAmount,
    totalAmount: patch.totalAmount !== undefined ? patch.totalAmount : existing.totalAmount,
    vatRateBasisPoints: nextVatRate,
  });

  const data: Prisma.ReceiptDocumentUncheckedUpdateInput = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  // Pass scalar patch fields through, recording a diff entry for each.
  const scalarKeys: Array<keyof UpdateReceiptDraftInput> = [
    "type",
    "paymentId",
    "issueDate",
    "paymentDate",
    "paymentMethod",
    "reference",
    "currency",
    "exchangeRate",
    "notes",
    "language",
    "vatRateBasisPoints",
  ];
  for (const key of scalarKeys) {
    if (patch[key] === undefined) continue;
    const oldVal = (existing as unknown as Record<string, unknown>)[key] ?? null;
    const newVal = patch[key] ?? null;
    (data as Record<string, unknown>)[key] = newVal;
    diff[key] = { old: oldVal, new: newVal };
  }

  if (patch.descriptionLines !== undefined) {
    data.descriptionLines = patch.descriptionLines as unknown as Prisma.InputJsonValue;
    diff.descriptionLines = {
      old: existing.descriptionLines,
      new: patch.descriptionLines,
    };
  }

  // Always reconcile money fields together so a partial patch does not leave
  // the row in a math-inconsistent state.
  if (
    patch.amountBeforeVat !== undefined ||
    patch.vatAmount !== undefined ||
    patch.totalAmount !== undefined ||
    patch.vatRateBasisPoints !== undefined
  ) {
    if (merged.amountBeforeVat !== existing.amountBeforeVat) {
      data.amountBeforeVat = merged.amountBeforeVat;
      diff.amountBeforeVat = { old: existing.amountBeforeVat, new: merged.amountBeforeVat };
    }
    if (merged.vatAmount !== existing.vatAmount) {
      data.vatAmount = merged.vatAmount;
      diff.vatAmount = { old: existing.vatAmount, new: merged.vatAmount };
    }
    if (merged.totalAmount !== existing.totalAmount) {
      data.totalAmount = merged.totalAmount;
      diff.totalAmount = { old: existing.totalAmount, new: merged.totalAmount };
    }
  }

  const updated = await tx.receiptDocument.update({ where: { id }, data });

  await writeAudit(tx as Prisma.TransactionClient, {
    actorUserId,
    action: "receipt.draft_updated",
    entityType: "ReceiptDocument",
    entityId: id,
    diff,
  });

  return updated;
}

/**
 * Delete a draft receipt. Non-draft rows raise `ReceiptStateError` so the
 * route returns 422 (a DB trigger from Wave 1 also blocks DELETE on finalized
 * rows; this is the friendly path).
 */
export async function deleteReceiptDraft(
  tx: DbClient,
  id: string,
  actorUserId: string,
): Promise<void> {
  const existing = await tx.receiptDocument.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, clientId: true },
  });
  if (!existing) throw new ReceiptStateError("receipt not found");
  if (existing.status !== "draft") {
    throw new ReceiptStateError("must be draft");
  }

  await tx.receiptDocument.delete({ where: { id } });

  await writeAudit(tx as Prisma.TransactionClient, {
    actorUserId,
    action: "receipt.draft_deleted",
    entityType: "ReceiptDocument",
    entityId: id,
    diff: {
      status: { old: existing.status, new: null },
      type: { old: existing.type, new: null },
      clientId: { old: existing.clientId, new: null },
    },
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface AmountInputs {
  amountBeforeVat: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  vatRateBasisPoints: number;
}

interface AmountOutputs {
  amountBeforeVat: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
}

/**
 * Fill in the math triangle (amountBeforeVat, vatAmount, totalAmount) when the
 * caller supplied a subset. Mirrors the DB-level `receipt_finalized_vat_sum_chk`
 * relation (total = before + vat) so drafts saved through this path are ready
 * to finalize.
 *
 * Auto-fill rules:
 *   - amountBeforeVat + rate present, vatAmount null    -> compute vat
 *   - amountBeforeVat + vatAmount present, total null   -> compute total
 *   - vatAmount auto-filled + total still null          -> compute total too
 * Nothing is changed when the caller passed an explicit value.
 */
function deriveAmounts(inputs: AmountInputs): AmountOutputs {
  const { amountBeforeVat } = inputs;
  let vatAmount = inputs.vatAmount;
  let totalAmount = inputs.totalAmount;

  if (
    amountBeforeVat !== null &&
    inputs.vatRateBasisPoints !== null &&
    vatAmount === null
  ) {
    vatAmount = Math.round((amountBeforeVat * inputs.vatRateBasisPoints) / 10000);
  }

  if (amountBeforeVat !== null && vatAmount !== null && totalAmount === null) {
    totalAmount = amountBeforeVat + vatAmount;
  }

  return { amountBeforeVat, vatAmount, totalAmount };
}
