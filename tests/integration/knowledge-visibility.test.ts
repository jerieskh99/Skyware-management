import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/knowledge/[slug]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeRequest(slug: string) {
  return new Request(`http://localhost/api/knowledge/${slug}`);
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/knowledge/[slug] — visibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    // Flag must be on for any knowledge route to be reachable.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("returns 404 to a non-admin when the article is admin_only", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: "internal-runbook",
      title: "Internal runbook",
      body: "...",
      summary: null,
      status: "published",
      visibility: "admin_only",
      publishedAt: new Date(),
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: null,
      relatedClient: null,
      tags: [],
    });

    const res = await GET(makeRequest("internal-runbook"), makeParams("internal-runbook"));
    expect(res.status).toBe(404);
  });

  it("returns 404 to a non-admin when the article is internal but a draft", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: "draft-piece",
      title: "Work in progress",
      body: "...",
      summary: null,
      status: "draft",
      visibility: "internal",
      publishedAt: null,
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: null,
      relatedClient: null,
      tags: [],
    });

    const res = await GET(makeRequest("draft-piece"), makeParams("draft-piece"));
    expect(res.status).toBe(404);
  });

  it("returns the article to an admin even when it is admin_only", async () => {
    mockAuthAs(makeAdminSession());

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: "internal-runbook",
      title: "Internal runbook",
      body: "secret steps",
      summary: null,
      status: "published",
      visibility: "admin_only",
      publishedAt: new Date(),
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: null,
      relatedClient: null,
      tags: [],
    });

    const res = await GET(makeRequest("internal-runbook"), makeParams("internal-runbook"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; visibility: string };
    expect(body.slug).toBe("internal-runbook");
    expect(body.visibility).toBe("admin_only");
  });

  it("returns the article to a non-admin when it is internal + published", async () => {
    mockAuthAs(makeEmployeeSession({ department: "it" }, { id: "u-2" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: "vpn-howto",
      title: "VPN how-to",
      body: "...",
      summary: "Configure the company VPN.",
      status: "published",
      visibility: "internal",
      publishedAt: new Date(),
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: "admin-1", displayName: "Admin" },
      lastEditedBy: null,
      relatedClient: null,
      tags: [],
    });

    const res = await GET(makeRequest("vpn-howto"), makeParams("vpn-howto"));
    expect(res.status).toBe(200);
  });
});
