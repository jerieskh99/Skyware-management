import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/[slug]/publish/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeRequest(slug: string) {
  return new Request(`http://localhost/api/knowledge/${slug}/publish`, {
    method: "POST",
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("POST /api/knowledge/[slug]/publish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("returns 403 for non-admin callers", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    const res = await POST(makeRequest("vpn-howto"), makeParams("vpn-howto"));
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("sets status=published and stamps publishedAt when previously null", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    // Slug lookup outside the transaction.
    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({ id: "art-1" }) // slug lookup in route
      .mockResolvedValueOnce({ id: "art-1", status: "draft", publishedAt: null });

    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-1",
      slug: "vpn-howto",
      title: "VPN",
      body: "...",
      summary: null,
      status: "published",
      visibility: "internal",
      publishedAt: new Date("2026-05-24T12:00:00Z"),
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: { id: "admin-1", displayName: "Admin" },
      relatedClient: null,
      tags: [],
    });

    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-1" });

    const res = await POST(makeRequest("vpn-howto"), makeParams("vpn-howto"));
    expect(res.status).toBe(200);

    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; publishedAt: Date };
    };
    expect(updateCall.where.id).toBe("art-1");
    expect(updateCall.data.status).toBe("published");
    expect(updateCall.data.publishedAt).toBeInstanceOf(Date);

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("knowledge.published");
    expect(auditCall.data.entityId).toBe("art-1");
  });

  it("keeps the existing publishedAt on a re-publish", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    const firstPublished = new Date("2026-04-01T08:00:00Z");
    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({ id: "art-2" })
      .mockResolvedValueOnce({
        id: "art-2",
        status: "draft",
        publishedAt: firstPublished,
      });

    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-2",
      slug: "x",
      title: "x",
      body: "x",
      summary: null,
      status: "published",
      visibility: "internal",
      publishedAt: firstPublished,
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: { id: "admin-1", displayName: "Admin" },
      relatedClient: null,
      tags: [],
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-2" });

    await POST(makeRequest("x"), makeParams("x"));

    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { publishedAt: Date };
    };
    expect(updateCall.data.publishedAt).toEqual(firstPublished);
  });

  it("returns 404 when the slug does not exist", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("missing"), makeParams("missing"));
    expect(res.status).toBe(404);
  });
});
