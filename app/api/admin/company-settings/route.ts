import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  getCompanySettings,
  upsertCompanySettings,
} from "@/lib/company-settings/queries";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: "Invalid email" },
  );

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || /^https?:\/\/.+/i.test(v),
    { message: "Invalid URL" },
  );

const optionalNumericId = z
  .string()
  .trim()
  .max(32)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || /^[0-9][0-9\-/. ]*$/.test(v),
    { message: "Must be numeric" },
  );

const putSchema = z.object({
  legalNameEn: optionalString(200),
  legalNameHe: optionalString(200),
  companyNumber: optionalNumericId,
  vatNumber: optionalNumericId,
  timezone: z.string().trim().min(1).max(64).optional(),
  defaultVatBasisPoints: z.number().int().min(0).max(10000).optional(),
  defaultCurrency: z.enum(["ILS", "USD", "EUR"]).optional(),
  email: optionalEmail,
  phone: optionalString(64),
  addressLine1: optionalString(200),
  addressLine2: optionalString(200),
  city: optionalString(120),
  postalCode: optionalString(32),
  country: z.string().trim().min(2).max(2).optional(),
  websiteUrl: optionalUrl,
  receiptFooterEn: optionalString(2000),
  receiptFooterHe: optionalString(2000),
});

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const row = await getCompanySettings();
  return NextResponse.json(row ?? {});
}

export async function PUT(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const row = await prisma.$transaction((tx) =>
    upsertCompanySettings(tx, { actorUserId: auth.user.id, patch: parsed.data }),
  );

  return NextResponse.json(row);
}
