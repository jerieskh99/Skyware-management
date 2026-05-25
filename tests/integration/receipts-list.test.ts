import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/receipts/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const URL_BASE = "http://localhost/api/receipts";

function makeRequest(qs = "") {
  return new Request(`${URL_BASE}${qs}`, { method: "GET" });
}

describe("GET /api/receipts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 200 with pagination metadata for admin", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findMany.mockResolvedValueOnce([]);
    prisma.receiptDocument.count.mockResolvedValueOnce(0);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
    };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(20);
    // totalPages floors at 1 even when there are zero rows.
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("passes status/type/year/clientId filters into the where clause", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findMany.mockResolvedValueOnce([]);
    prisma.receiptDocument.count.mockResolvedValueOnce(0);

    const clientId = "00000000-0000-0000-0000-000000000099";
    await GET(
      makeRequest(
        `?status=draft&type=tax_invoice&year=2026&clientId=${clientId}`,
      ),
    );

    const findCall = prisma.receiptDocument.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findCall.where).toMatchObject({
      status: "draft",
      type: "tax_invoice",
      documentNumberYear: 2026,
      clientId,
    });
  });

  it("caps perPage at 100", async () => {
    mockAuthAs(makeAdminSession());
    prisma.receiptDocument.findMany.mockResolvedValueOnce([]);
    prisma.receiptDocument.count.mockResolvedValueOnce(0);

    await GET(makeRequest("?perPage=500"));
    const findCall = prisma.receiptDocument.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(findCall.take).toBe(100);
  });

  it("returns 400 on an invalid status filter", async () => {
    mockAuthAs(makeAdminSession());
    const res = await GET(makeRequest("?status=NOPE"));
    expect(res.status).toBe(400);
    expect(prisma.receiptDocument.findMany).not.toHaveBeenCalled();
  });
});
