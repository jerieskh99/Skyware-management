import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST as archivePOST } from "@/app/api/knowledge/[slug]/archive/route";
import { POST as rescindPOST } from "@/app/api/knowledge/[slug]/rescind/route";
import { POST as unArchivePOST } from "@/app/api/knowledge/[slug]/un-archive/route";
import { POST as unApprovePOST } from "@/app/api/knowledge/[slug]/un-approve/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string, body?: unknown) {
  return new Request(`http://localhost/api/knowledge/${slug}/x`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

describe("archive / rescind / un-archive / un-approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("archive: admin sends a published article to archived", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      status: "published",
    });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-1",
      slug: SLUG,
      title: "T",
      status: "archived",
    });

    const res = await archivePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
    const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(audit.data.action).toBe("knowledge.article.archived");
  });

  it("archive: non-admin gets 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    const res = await archivePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("archive: cannot archive a draft (422 via state machine)", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      status: "draft",
    });
    const res = await archivePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("rescind: admin rescinds a published article with a reason; audit carries the reason", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      status: "published",
    });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-3",
      slug: SLUG,
      title: "T",
      status: "archived",
    });
    const res = await rescindPOST(
      makeReq(SLUG, { reason: "Procedure was wrong" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);
    const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; diffJson: { reason: { new: string } } };
    };
    expect(audit.data.action).toBe("knowledge.article.rescinded");
    expect(audit.data.diffJson.reason.new).toBe("Procedure was wrong");
  });

  it("rescind: non-admin gets 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    const res = await rescindPOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
  });

  it("un-archive: admin sends archived back to draft", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-4",
      status: "archived",
    });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-4",
      slug: SLUG,
      title: "T",
      status: "draft",
    });
    const res = await unArchivePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
    const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(audit.data.action).toBe("knowledge.article.un_archived");
  });

  it("un-archive: non-admin gets 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    const res = await unArchivePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
  });

  it("un-approve: admin pulls approved back to pending_review", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-5",
      status: "approved",
    });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-5",
      slug: SLUG,
      title: "T",
      status: "pending_review",
    });
    const res = await unApprovePOST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
    const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(audit.data.action).toBe("knowledge.article.un_approved");
  });
});
