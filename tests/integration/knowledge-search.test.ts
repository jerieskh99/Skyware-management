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

describe("GET /api/search?scope=knowledge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("returns 403 when the knowledge flag is off", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

    const res = await GET(
      makeRequest("http://localhost/api/search?q=vpn&scope=knowledge"),
    );
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.findMany).not.toHaveBeenCalled();
  });

  it("admin scope=knowledge: returns admin_only and internal hits", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-1",
        slug: "vpn-howto",
        title: "VPN how-to",
        summary: "Configure the VPN.",
        visibility: "internal",
        updatedAt: new Date(),
      },
      {
        id: "art-2",
        slug: "ops-secrets",
        title: "Ops secrets",
        summary: null,
        visibility: "admin_only",
        updatedAt: new Date(),
      },
    ]);

    const res = await GET(
      makeRequest("http://localhost/api/search?q=vpn&scope=knowledge"),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      results: { knowledge: { items: Array<{ id: string; visibility: string }> } };
    };
    expect(body.results.knowledge.items).toHaveLength(2);
    expect(body.results.knowledge.items[0]?.id).toBe("art-1");

    const findCall = prisma.knowledgeArticle.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<unknown> };
    };
    // Verify the AND has a status:published clause but NO visibility filter.
    const whereJson = JSON.stringify(findCall.where);
    expect(whereJson).toContain('"status":"published"');
    expect(whereJson).not.toContain('"visibility":"internal"');
  });

  it("employee scope=knowledge: pushes visibility=internal into the where clause", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([]);

    await GET(makeRequest("http://localhost/api/search?q=vpn&scope=knowledge"));

    const findCall = prisma.knowledgeArticle.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    const whereJson = JSON.stringify(findCall.where);
    expect(whereJson).toContain('"visibility":"internal"');
    expect(whereJson).toContain('"status":"published"');
  });

  it("scope=all: includes the knowledge bucket when the flag is on", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.job.findMany.mockResolvedValueOnce([]);
    prisma.communicationChannel.findMany.mockResolvedValueOnce([]);
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-1",
        slug: "x",
        title: "X",
        summary: null,
        visibility: "internal",
        updatedAt: new Date(),
      },
    ]);

    const res = await GET(makeRequest("http://localhost/api/search?q=vpn&scope=all"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { knowledge?: { items: Array<{ id: string }> } };
    };
    expect(body.results.knowledge?.items).toHaveLength(1);
    expect(body.results.knowledge?.items[0]?.id).toBe("art-1");
  });

  it("scope=all: omits the knowledge bucket when the flag is off", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

    prisma.job.findMany.mockResolvedValueOnce([]);
    prisma.communicationChannel.findMany.mockResolvedValueOnce([]);
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeRequest("http://localhost/api/search?q=vpn&scope=all"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { knowledge?: unknown };
    };
    expect(body.results.knowledge).toBeUndefined();
  });
});
