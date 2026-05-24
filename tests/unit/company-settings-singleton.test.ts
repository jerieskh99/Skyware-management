import { describe, it, expect, beforeEach, vi } from "vitest";
import { SINGLETON_ID, upsertCompanySettings } from "@/lib/company-settings/queries";
import { prisma, resetPrisma } from "../helpers/prisma";

const ACTOR = "00000000-0000-0000-0000-000000000099";

describe("upsertCompanySettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("always writes to the singleton id", async () => {
    prisma.companySettings.findUnique.mockResolvedValueOnce(null);
    prisma.companySettings.upsert.mockResolvedValueOnce({
      id: SINGLETON_ID,
      legalNameEn: "Acme",
      legalNameHe: null,
      companyNumber: null,
      vatNumber: null,
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    await prisma.$transaction(async (tx: Parameters<typeof upsertCompanySettings>[0]) =>
      upsertCompanySettings(tx, { actorUserId: ACTOR, patch: { legalNameEn: "Acme" } }),
    );

    expect(prisma.companySettings.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.companySettings.upsert.mock.calls[0]?.[0] as {
      where: { id: string };
      create: { id: string };
    };
    expect(arg.where.id).toBe(SINGLETON_ID);
    expect(arg.create.id).toBe(SINGLETON_ID);
  });

  it("uses the singleton id even when upserting an existing row", async () => {
    prisma.companySettings.findUnique.mockResolvedValueOnce({
      id: SINGLETON_ID,
      legalNameEn: "Old",
      legalNameHe: null,
      companyNumber: null,
      vatNumber: null,
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.companySettings.upsert.mockResolvedValueOnce({
      id: SINGLETON_ID,
      legalNameEn: "New",
      legalNameHe: null,
      companyNumber: null,
      vatNumber: null,
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-2" });

    await prisma.$transaction(async (tx: Parameters<typeof upsertCompanySettings>[0]) =>
      upsertCompanySettings(tx, { actorUserId: ACTOR, patch: { legalNameEn: "New" } }),
    );

    const arg = prisma.companySettings.upsert.mock.calls[0]?.[0] as {
      where: { id: string };
    };
    expect(arg.where.id).toBe(SINGLETON_ID);
    expect(prisma.companySettings.create).not.toHaveBeenCalled();
  });

  it("never invokes create directly (would risk a second row)", async () => {
    prisma.companySettings.findUnique.mockResolvedValueOnce(null);
    prisma.companySettings.upsert.mockResolvedValueOnce({
      id: SINGLETON_ID,
      legalNameEn: null,
      legalNameHe: null,
      companyNumber: null,
      vatNumber: null,
      timezone: "Asia/Jerusalem",
      defaultVatBasisPoints: 1800,
      defaultCurrency: "ILS",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: "IL",
      websiteUrl: null,
      receiptFooterEn: null,
      receiptFooterHe: null,
      updatedByUserId: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-3" });

    await prisma.$transaction(async (tx: Parameters<typeof upsertCompanySettings>[0]) =>
      upsertCompanySettings(tx, { actorUserId: ACTOR, patch: {} }),
    );

    expect(prisma.companySettings.create).not.toHaveBeenCalled();
    expect(prisma.companySettings.createMany).not.toHaveBeenCalled();
  });
});
