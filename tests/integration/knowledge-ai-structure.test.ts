import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/[slug]/ai-structure/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string) {
  return new Request(`http://localhost/api/knowledge/${slug}/ai-structure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "lesson-from-job";

describe("POST /api/knowledge/[slug]/ai-structure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("runs the dry-run structuring on a draft and transitions to ai_structured", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({
        id: "art-1",
        title: "Some lesson",
        body: "We fixed a VPN issue with the corporate gateway. Step one was nslookup; step two was a route table check. Lorem ipsum.",
        kind: "internal_task_lesson",
        status: "draft",
        authorUserId: "u-1",
        summary: null,
        whyItMatters: null,
        rawInputSnapshot: null,
        sourceJob: null,
      })
      // writeRevision lookup
      .mockResolvedValueOnce({ id: "art-1", currentVersion: 1 });

    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-2" });
    prisma.knowledgeArticle.update.mockResolvedValue({});

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      body: string;
      title: string;
    };
    expect(body.mode).toBe("dry_run");
    expect(body.body).toContain("## Context");

    // Article moved to ai_structured.
    const updateCalls = prisma.knowledgeArticle.update.mock.calls;
    const statusUpdate = updateCalls.find(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "ai_structured",
    );
    expect(statusUpdate).toBeDefined();

    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(auditActions).toContain("knowledge.article.ai_structured");
  });

  it("forbids running the structuring on someone else's draft", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-2" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      title: "T",
      body: "B",
      kind: "internal_task_lesson",
      status: "draft",
      authorUserId: "u-1",
      summary: null,
      whyItMatters: null,
      rawInputSnapshot: null,
      sourceJob: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
  });

  it("returns 422 ai_ineligible_kind for external_reference", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      title: "T",
      body: "B",
      kind: "external_reference",
      status: "draft",
      authorUserId: "admin-1",
      summary: null,
      whyItMatters: null,
      rawInputSnapshot: null,
      sourceJob: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; kind: string };
    expect(body.error).toBe("ai_ineligible_kind");
    expect(body.kind).toBe("external_reference");
  });

  it("returns 422 ai_ineligible_kind for architecture_decision", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-4",
      title: "T",
      body: "B",
      kind: "architecture_decision",
      status: "draft",
      authorUserId: "admin-1",
      summary: null,
      whyItMatters: null,
      rawInputSnapshot: null,
      sourceJob: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ai_ineligible_kind");
  });

  it("returns 422 ai_ineligible_kind for process_policy_note", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-5",
      title: "T",
      body: "B",
      kind: "process_policy_note",
      status: "draft",
      authorUserId: "admin-1",
      summary: null,
      whyItMatters: null,
      rawInputSnapshot: null,
      sourceJob: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ai_ineligible_kind");
  });
});
