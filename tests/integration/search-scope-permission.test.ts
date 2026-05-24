import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/search/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeRequest(url: string) {
  return new Request(url);
}

describe("GET /api/search — scope permission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 when an employee requests scope=clients", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));

    const res = await GET(
      makeRequest("http://localhost/api/search?q=acme&scope=clients")
    );

    expect(res.status).toBe(403);
    // The admin gate fires before any DB lookup.
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty clients bucket when an employee searches scope=all", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    prisma.job.findMany.mockResolvedValueOnce([]);
    // `scope=all` calls searchClients which short-circuits for non-admins;
    // it must NOT touch prisma.client.
    prisma.communicationChannel.findMany.mockResolvedValueOnce([]);

    const res = await GET(
      makeRequest("http://localhost/api/search?q=acme&scope=all")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scope: string;
      results: {
        clients?: { items: unknown[]; nextCursor: string | null };
      };
    };
    expect(body.scope).toBe("all");
    expect(body.results.clients).toEqual({ items: [], nextCursor: null });
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with results when an admin requests scope=clients", async () => {
    mockAuthAs(makeAdminSession());
    prisma.client.findMany.mockResolvedValueOnce([
      {
        id: "client-1",
        companyName: "Acme Ltd.",
        contactPerson: "Jane Roe",
        email: "j@acme.test",
        status: "active",
      },
    ]);

    const res = await GET(
      makeRequest("http://localhost/api/search?q=acme&scope=clients")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scope: string;
      results: { clients: { items: { id: string }[] } };
    };
    expect(body.scope).toBe("clients");
    expect(body.results.clients.items).toHaveLength(1);
    expect(body.results.clients.items[0]?.id).toBe("client-1");
    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
  });
});
