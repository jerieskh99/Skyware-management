import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/knowledge/[slug]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * Wave 3 widened PATCH: authors / admins can now patch `kind`,
 * `reliabilityTier`, `externalSource`, and `externalUrl` on a draft. The
 * route enforces:
 *   - `reliabilityTier` is admin-only,
 *   - `kind` and `externalUrl` may only change while in draft / ai_structured,
 *   - changing `externalUrl` re-runs canonicalize + duplicate check (409).
 */

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

describe("PATCH /api/knowledge/[slug] — widened fields", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("admin can update reliabilityTier on a draft", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({
        id: "art-1",
        title: "T",
        body: "B",
        summary: "S",
        whyItMatters: null,
        visibility: "internal",
        relatedClientId: null,
        status: "draft",
        authorUserId: "u-1",
        kind: "how_to_guide",
        reliabilityTier: "single_source",
        externalSource: null,
        externalUrl: null,
        externalUrlHash: null,
      })
      .mockResolvedValueOnce({
        id: "art-1",
        slug: SLUG,
        title: "T",
        body: "B",
        kind: "how_to_guide",
        status: "draft",
        visibility: "internal",
        reliabilityTier: "validated",
        author: { id: "u-1", displayName: "U" },
      });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({});

    const res = await PATCH(
      makeReq(SLUG, { reliabilityTier: "validated" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);
    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { reliabilityTier?: string };
    };
    expect(updateCall.data.reliabilityTier).toBe("validated");
  });

  it("non-admin cannot change reliabilityTier (returns 403)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      title: "T",
      body: "B",
      summary: "S",
      whyItMatters: null,
      visibility: "internal",
      relatedClientId: null,
      status: "draft",
      authorUserId: "u-1",
      kind: "how_to_guide",
      reliabilityTier: "single_source",
      externalSource: null,
      externalUrl: null,
      externalUrlHash: null,
    });

    const res = await PATCH(
      makeReq(SLUG, { reliabilityTier: "validated" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("author can update kind on a draft", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({
        id: "art-1",
        title: "T",
        body: "B",
        summary: "S",
        whyItMatters: null,
        visibility: "internal",
        relatedClientId: null,
        status: "draft",
        authorUserId: "u-1",
        kind: "how_to_guide",
        reliabilityTier: "single_source",
        externalSource: null,
        externalUrl: null,
        externalUrlHash: null,
      })
      .mockResolvedValueOnce({
        id: "art-1",
        slug: SLUG,
        title: "T",
        body: "B",
        kind: "troubleshooting_note",
        status: "draft",
        visibility: "internal",
        author: { id: "u-1", displayName: "U" },
      });
    prisma.knowledgeArticle.update.mockResolvedValueOnce({});

    const res = await PATCH(
      makeReq(SLUG, { kind: "troubleshooting_note" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);
    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { kind?: string };
    };
    expect(updateCall.data.kind).toBe("troubleshooting_note");
  });

  it("author can replace externalUrl on a draft (canonicalize + no dup)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique
      .mockResolvedValueOnce({
        id: "art-1",
        title: "T",
        body: "B",
        summary: "S",
        whyItMatters: null,
        visibility: "internal",
        relatedClientId: null,
        status: "draft",
        authorUserId: "u-1",
        kind: "external_reference",
        reliabilityTier: "single_source",
        externalSource: "Old source",
        externalUrl: "https://old.example.com/page",
        externalUrlHash: "deadbeef-old-hash",
      })
      .mockResolvedValueOnce({
        id: "art-1",
        slug: SLUG,
        title: "T",
        body: "B",
        kind: "external_reference",
        status: "draft",
        visibility: "internal",
        externalUrl: "https://new.example.com/page",
        author: { id: "u-1", displayName: "U" },
      });
    // No duplicate hit on the new URL.
    prisma.knowledgeArticle.findFirst.mockResolvedValueOnce(null);
    prisma.knowledgeArticle.update.mockResolvedValueOnce({});

    const res = await PATCH(
      makeReq(SLUG, { externalUrl: "https://new.example.com/page" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);
    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { externalUrl?: string | null; externalUrlHash?: string | null };
    };
    expect(updateCall.data.externalUrl).toBe("https://new.example.com/page");
    expect(typeof updateCall.data.externalUrlHash).toBe("string");
  });

  it("rejects externalUrl change with 409 when another non-archived article holds the same canonical URL", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      title: "T",
      body: "B",
      summary: "S",
      whyItMatters: null,
      visibility: "internal",
      relatedClientId: null,
      status: "draft",
      authorUserId: "u-1",
      kind: "external_reference",
      reliabilityTier: "single_source",
      externalSource: null,
      externalUrl: "https://old.example.com/page",
      externalUrlHash: "deadbeef-old-hash",
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValueOnce({
      id: "art-other",
      slug: "other-article",
      title: "Other",
    });

    const res = await PATCH(
      makeReq(SLUG, { externalUrl: "https://new.example.com/page" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("duplicate_external_url");
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("rejects changing kind on a published article with 422", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      title: "T",
      body: "B",
      summary: "S",
      whyItMatters: null,
      visibility: "internal",
      relatedClientId: null,
      status: "published",
      authorUserId: "u-1",
      kind: "how_to_guide",
      reliabilityTier: "single_source",
      externalSource: null,
      externalUrl: null,
      externalUrlHash: null,
    });

    const res = await PATCH(
      makeReq(SLUG, { kind: "troubleshooting_note" }),
      makeParams(SLUG),
    );
    // Published articles cannot be edited at all (canEditDraft returns false
    // and the route emits 422 for non-author-editable statuses).
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });
});
