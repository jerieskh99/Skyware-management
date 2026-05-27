import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/[slug]/re-verify/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string, body?: unknown) {
  return new Request(`http://localhost/api/knowledge/${slug}/re-verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

describe("POST /api/knowledge/[slug]/re-verify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("stamps lastVerifiedAt and lastVerifiedByUserId on a published article", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      kind: "external_reference",
      status: "published",
      reliabilityTier: "single_source",
      lastVerifiedAt: null,
    });

    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-1",
      slug: SLUG,
      title: "T",
      kind: "external_reference",
      status: "published",
      reliabilityTier: "verified",
      lastVerifiedAt: new Date(),
    });

    const res = await POST(makeReq(SLUG, { reliabilityTier: "verified" }), makeParams(SLUG));
    expect(res.status).toBe(200);

    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: {
        lastVerifiedAt: Date;
        lastVerifiedByUserId: string;
        reliabilityTier?: string;
      };
    };
    expect(updateCall.data.lastVerifiedAt).toBeInstanceOf(Date);
    expect(updateCall.data.lastVerifiedByUserId).toBe("admin-1");
    expect(updateCall.data.reliabilityTier).toBe("verified");
  });

  it("returns 422 when the article is not 'published'", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      kind: "external_reference",
      status: "draft",
      reliabilityTier: "single_source",
      lastVerifiedAt: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("forbids a non-admin from re-verifying a 'process_policy_note' kind", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      kind: "process_policy_note",
      status: "published",
      reliabilityTier: "validated",
      lastVerifiedAt: null,
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
  });

  it("allows a non-admin to re-verify a 'how_to_guide' kind", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-4",
      kind: "how_to_guide",
      status: "published",
      reliabilityTier: "validated",
      lastVerifiedAt: null,
    });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({
      id: "art-4",
      slug: SLUG,
      title: "T",
      kind: "how_to_guide",
      status: "published",
      reliabilityTier: "validated",
      lastVerifiedAt: new Date(),
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
  });
});
