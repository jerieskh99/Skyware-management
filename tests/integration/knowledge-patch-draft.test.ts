import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/knowledge/[slug]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string, body: unknown) {
  return new Request(`http://localhost/api/knowledge/${slug}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

describe("PATCH /api/knowledge/[slug] — draft editing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("writes a revision when title changes on a draft owned by the caller", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique
      // PATCH route: load existing
      .mockResolvedValueOnce({
        id: "art-1",
        title: "Original title",
        body: "Original body",
        summary: "Original summary",
        whyItMatters: null,
        visibility: "internal",
        relatedClientId: null,
        status: "draft",
        authorUserId: "u-1",
      })
      // writeRevision: load currentVersion
      .mockResolvedValueOnce({ id: "art-1", currentVersion: 1 })
      // getArticleDetail at the end of the transaction
      .mockResolvedValueOnce({
        id: "art-1",
        slug: SLUG,
        title: "New title",
        body: "Original body",
        summary: "Original summary",
        whyItMatters: null,
        kind: "how_to_guide",
        status: "draft",
        visibility: "internal",
        author: { id: "u-1", displayName: "U" },
      });

    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-2" });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({});

    const res = await PATCH(makeReq(SLUG, { title: "New title" }), makeParams(SLUG));
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticleRevision.create).toHaveBeenCalledTimes(1);
    const revCall = prisma.knowledgeArticleRevision.create.mock.calls[0]?.[0] as {
      data: { version: number; title: string };
    };
    expect(revCall.data.version).toBe(2);
    expect(revCall.data.title).toBe("New title");
  });

  it("returns 422 when the article is in pending_review (not a draft)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      title: "T",
      body: "B",
      summary: "S",
      whyItMatters: null,
      visibility: "internal",
      relatedClientId: null,
      status: "pending_review",
      authorUserId: "u-1",
    });

    const res = await PATCH(makeReq(SLUG, { title: "New" }), makeParams(SLUG));
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a different employee tries to edit a draft they did not author", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-2" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      title: "T",
      body: "B",
      summary: "S",
      whyItMatters: null,
      visibility: "internal",
      relatedClientId: null,
      status: "draft",
      authorUserId: "u-1",
    });

    const res = await PATCH(makeReq(SLUG, { title: "Steal" }), makeParams(SLUG));
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("admin can edit any draft", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({
        id: "art-4",
        title: "T",
        body: "B",
        summary: "S",
        whyItMatters: null,
        visibility: "internal",
        relatedClientId: null,
        status: "draft",
        authorUserId: "u-1",
      })
      .mockResolvedValueOnce({ id: "art-4", currentVersion: 1 })
      .mockResolvedValueOnce({
        id: "art-4",
        slug: SLUG,
        title: "T",
        body: "New body content",
        status: "draft",
        visibility: "internal",
        author: { id: "u-1", displayName: "U" },
      });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r" });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({});

    const res = await PATCH(
      makeReq(SLUG, { body: "New body content" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);
  });
});
