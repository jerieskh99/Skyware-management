import type { CompanySettings, Currency, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export type CompanySettingsPatch = Partial<{
  legalNameEn: string | null;
  legalNameHe: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  timezone: string;
  defaultVatBasisPoints: number;
  defaultCurrency: Currency;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  websiteUrl: string | null;
  receiptFooterEn: string | null;
  receiptFooterHe: string | null;
}>;

const PATCH_FIELDS = [
  "legalNameEn",
  "legalNameHe",
  "companyNumber",
  "vatNumber",
  "timezone",
  "defaultVatBasisPoints",
  "defaultCurrency",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "country",
  "websiteUrl",
  "receiptFooterEn",
  "receiptFooterHe",
] as const satisfies readonly (keyof CompanySettingsPatch)[];

export async function getCompanySettings(): Promise<CompanySettings | null> {
  return prisma.companySettings.findUnique({ where: { id: SINGLETON_ID } });
}

interface UpsertArgs {
  actorUserId: string;
  patch: CompanySettingsPatch;
}

export async function upsertCompanySettings(
  tx: Prisma.TransactionClient,
  { actorUserId, patch }: UpsertArgs,
): Promise<CompanySettings> {
  const existing = await tx.companySettings.findUnique({ where: { id: SINGLETON_ID } });

  const data: Prisma.CompanySettingsUncheckedUpdateInput = { updatedByUserId: actorUserId };
  for (const key of PATCH_FIELDS) {
    if (patch[key] !== undefined) {
      (data as Record<string, unknown>)[key] = patch[key];
    }
  }

  const row = await tx.companySettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: {
      id: SINGLETON_ID,
      updatedByUserId: actorUserId,
      ...Object.fromEntries(PATCH_FIELDS.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]])),
    } as Prisma.CompanySettingsUncheckedCreateInput,
  });

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of PATCH_FIELDS) {
    if (patch[key] === undefined) continue;
    const oldVal = existing ? (existing as unknown as Record<string, unknown>)[key] ?? null : null;
    const newVal = (row as unknown as Record<string, unknown>)[key] ?? null;
    if (oldVal !== newVal) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  await writeAudit(tx, {
    actorUserId,
    action: "company_settings.updated",
    entityType: "CompanySettings",
    entityId: row.id,
    diff,
  });

  return row;
}

export interface CompanyForReceipts {
  legalNameEn: string | null;
  legalNameHe: string | null;
  vatNumber: string | null;
  defaultVatBasisPoints: number;
  defaultCurrency: Currency;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postalCode: string | null;
    country: string;
  };
  footer: {
    en: string | null;
    he: string | null;
  };
}

export async function getCompanyForReceipts(): Promise<CompanyForReceipts | null> {
  const row = await prisma.companySettings.findUnique({
    where: { id: SINGLETON_ID },
    select: {
      legalNameEn: true,
      legalNameHe: true,
      vatNumber: true,
      defaultVatBasisPoints: true,
      defaultCurrency: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postalCode: true,
      country: true,
      receiptFooterEn: true,
      receiptFooterHe: true,
    },
  });
  if (!row) return null;
  return {
    legalNameEn: row.legalNameEn,
    legalNameHe: row.legalNameHe,
    vatNumber: row.vatNumber,
    defaultVatBasisPoints: row.defaultVatBasisPoints,
    defaultCurrency: row.defaultCurrency,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      city: row.city,
      postalCode: row.postalCode,
      country: row.country,
    },
    footer: { en: row.receiptFooterEn, he: row.receiptFooterHe },
  };
}
