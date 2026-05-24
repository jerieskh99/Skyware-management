import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as listGET, POST as listPOST } from "@/app/api/knowledge/route";
import { GET as detailGET, PATCH as detailPATCH, DELETE as detailDELETE } from "@/app/api/knowledge/[slug]/route";
import { POST as publishPOST } from "@/app/api/knowledge/[slug]/publish/route";
import { POST as archivePOST } from "@/app/api/knowledge/[slug]/archive/route";
import { POST as tagPOST, DELETE as tagDELETE } from "@/app/api/knowledge/[slug]/tags/route";
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
});
