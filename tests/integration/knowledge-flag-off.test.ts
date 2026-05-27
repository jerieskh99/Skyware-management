import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as listGET, POST as listPOST } from "@/app/api/knowledge/route";
import { GET as detailGET, PATCH as detailPATCH, DELETE as detailDELETE } from "@/app/api/knowledge/[slug]/route";
import { POST as publishPOST } from "@/app/api/knowledge/[slug]/publish/route";
import { POST as archivePOST } from "@/app/api/knowledge/[slug]/archive/route";
import { POST as tagPOST, DELETE as tagDELETE } from "@/app/api/knowledge/[slug]/tags/route";
import { POST as submitReviewPOST } from "@/app/api/knowledge/[slug]/submit-review/route";
import { POST as reviewPOST } from "@/app/api/knowledge/[slug]/review/route";
import { POST as rescindPOST } from "@/app/api/knowledge/[slug]/rescind/route";
import { POST as reVerifyPOST } from "@/app/api/knowledge/[slug]/re-verify/route";
import { POST as aiStructurePOST } from "@/app/api/knowledge/[slug]/ai-structure/route";
import { POST as unArchivePOST } from "@/app/api/knowledge/[slug]/un-archive/route";
import { POST as unApprovePOST } from "@/app/api/knowledge/[slug]/un-approve/route";
import { POST as jobToArticlePOST } from "@/app/api/jobs/[id]/create-knowledge-article/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

describe("knowledge — feature flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    // Flag off for every test in this file.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
  });

  it("GET /api/knowledge returns 404", async () => {
    const res = await listGET(new Request("http://localhost/api/knowledge"));
    expect(res.status).toBe(404);
    expect(prisma.knowledgeArticle.findMany).not.toHaveBeenCalled();
  });

  it("POST /api/knowledge returns 404 even for an admin", async () => {
    const res = await listPOST(
      jsonReq("http://localhost/api/knowledge", "POST", {
        title: "X",
        body: "X",
      }),
    );
    expect(res.status).toBe(404);
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });

  it("GET /api/knowledge/[slug] returns 404", async () => {
    const res = await detailGET(
      new Request(`http://localhost/api/knowledge/${SLUG}`),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/knowledge/[slug] returns 404", async () => {
    const res = await detailPATCH(
      jsonReq(`http://localhost/api/knowledge/${SLUG}`, "PATCH", { title: "X" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/knowledge/[slug] returns 404", async () => {
    const res = await detailDELETE(
      new Request(`http://localhost/api/knowledge/${SLUG}`, { method: "DELETE" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/publish returns 404", async () => {
    const res = await publishPOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/publish`, { method: "POST" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/archive returns 404", async () => {
    const res = await archivePOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/archive`, { method: "POST" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/tags returns 404", async () => {
    const res = await tagPOST(
      jsonReq(`http://localhost/api/knowledge/${SLUG}/tags`, "POST", {
        tagId: "00000000-0000-0000-0000-000000000001",
      }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/knowledge/[slug]/tags returns 404", async () => {
    const res = await tagDELETE(
      new Request(
        `http://localhost/api/knowledge/${SLUG}/tags?tagId=00000000-0000-0000-0000-000000000001`,
        { method: "DELETE" },
      ),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/submit-review returns 404", async () => {
    const res = await submitReviewPOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/submit-review`, { method: "POST" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/review returns 404", async () => {
    const res = await reviewPOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/rescind returns 404", async () => {
    const res = await rescindPOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/rescind`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/re-verify returns 404", async () => {
    const res = await reVerifyPOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/re-verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/ai-structure returns 404", async () => {
    const res = await aiStructurePOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/ai-structure`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/un-archive returns 404", async () => {
    const res = await unArchivePOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/un-archive`, { method: "POST" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/knowledge/[slug]/un-approve returns 404", async () => {
    const res = await unApprovePOST(
      new Request(`http://localhost/api/knowledge/${SLUG}/un-approve`, { method: "POST" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/jobs/[id]/create-knowledge-article returns 404", async () => {
    const res = await jobToArticlePOST(
      new Request("http://localhost/api/jobs/some-id/create-knowledge-article", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "some-id" }) },
    );
    expect(res.status).toBe(404);
  });
});
