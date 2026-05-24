import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, PUT } from "@/app/api/admin/company-settings/route";
import { SINGLETON_ID } from "@/lib/company-settings/queries";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/admin/company-settings";

function putRequest(body: unknown) {
  return new Request(URL, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FULL_ROW = {
  id: SINGLETON_ID,
  legalNameEn: "Skyware IT LTD",
  legalNameHe: null,
  companyNumber: null,
  vatNumber: null,
  timezone: "Asia/Jerusalem",
  defaultVatBasisPoints: 1800,
  defaultCurrency: "ILS" as const,
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
  updatedByUserId: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/admin/company-settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when no session", async () => {
    mockAuthAs(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(prisma.companySettings.findUnique).not.toHaveBeenCalled();
  });

  it("returns the singleton row for admins", async () => {
    mockAuthAs(makeAdminSession());
    prisma.companySettings.findUnique.mockResolvedValueOnce(FULL_ROW);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; legalNameEn: string };
    expect(body.id).toBe(SINGLETON_ID);
    expect(body.legalNameEn).toBe("Skyware IT LTD");
  });

  it("returns {} when the singleton has never been written", async () => {
    mockAuthAs(makeAdminSession());
    prisma.companySettings.findUnique.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});

describe("PUT /api/admin/company-settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 for non-admin users", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await PUT(putRequest({ legalNameEn: "Acme" }));
    expect(res.status).toBe(403);
    expect(prisma.companySettings.upsert).not.toHaveBeenCalled();
  });

  it("upserts the row and writes an audit entry for admins", async () => {
    mockAuthAs(makeAdminSession());
    prisma.companySettings.findUnique.mockResolvedValueOnce(null);
    prisma.companySettings.upsert.mockResolvedValueOnce({
      ...FULL_ROW,
      legalNameEn: "Acme",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-1" });

    const res = await PUT(putRequest({ legalNameEn: "Acme" }));
    expect(res.status).toBe(200);

    expect(prisma.companySettings.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prisma.companySettings.upsert.mock.calls[0]?.[0] as {
      where: { id: string };
      update: { legalNameEn: string; updatedByUserId: string };
    };
    expect(upsertArg.where.id).toBe(SINGLETON_ID);
    expect(upsertArg.update.legalNameEn).toBe("Acme");
    expect(upsertArg.update.updatedByUserId).toBe("admin-1");

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditArg.data.action).toBe("company_settings.updated");
    expect(auditArg.data.entityType).toBe("CompanySettings");
    expect(auditArg.data.entityId).toBe(SINGLETON_ID);
  });

  it("returns 400 when defaultVatBasisPoints is out of range", async () => {
    mockAuthAs(makeAdminSession());
    const res = await PUT(putRequest({ defaultVatBasisPoints: 99999 }));
    expect(res.status).toBe(400);
    expect(prisma.companySettings.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid email", async () => {
    mockAuthAs(makeAdminSession());
    const res = await PUT(putRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(prisma.companySettings.upsert).not.toHaveBeenCalled();
  });
});
