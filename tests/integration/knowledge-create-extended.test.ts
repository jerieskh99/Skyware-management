import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/knowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/knowledge — extended create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("creates a draft how_to_guide with the new fields and writes revision v1", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    // Slug-generation lookup returns null (unique).
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);
    prisma.knowledgeArticle.create.mockResolvedValueOnce({
      id: "art-1",
      slug: "the-vpn-howto",
      title: "The VPN how-to",
      kind: "how_to_guide",
      status: "draft",
    });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({
      id: "rev-1",
    });

    const res = await POST(
      jsonReq({
        title: "The VPN how-to",
        body: "Step one. Step two. " + "Lorem ipsum ".repeat(40),
        kind: "how_to_guide",
        summary: "Setting up the VPN client",
        whyItMatters: "Onboarding tech is repeated weekly.",
        reliabilityTier: "validated",
      }),
    );
    expect(res.status).toBe(201);

    const createCall = prisma.knowledgeArticle.create.mock.calls[0]?.[0] as {
      data: { kind: string; status: string; reliabilityTier: string };
    };
    expect(createCall.data.kind).toBe("how_to_guide");
    expect(createCall.data.status).toBe("draft");
    expect(createCall.data.reliabilityTier).toBe("validated");
    expect(prisma.knowledgeArticleRevision.create).toHaveBeenCalledTimes(1);

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("knowledge.article.created");
  });

  it("returns 409 with the existing slug when external URL hash already exists", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    // Duplicate match.
    prisma.knowledgeArticle.findFirst.mockResolvedValueOnce({
      id: "existing-id",
      slug: "existing-slug",
      title: "Existing article",
    });

    const res = await POST(
      jsonReq({
        title: "MS docs on Outlook",
        body: "Reference body content here. " + "Lorem ipsum ".repeat(20),
        kind: "external_reference",
        summary: "Microsoft Outlook reference",
        externalSource: "Microsoft Docs",
        externalUrl: "https://learn.microsoft.com/en-us/outlook/configure",
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      existing: { slug: string };
    };
    expect(body.error).toBe("external_url_duplicate");
    expect(body.existing.slug).toBe("existing-slug");
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });

  it("forbids non-admins from creating admin-only kinds (process_policy_note)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    const res = await POST(
      jsonReq({
        title: "Some policy",
        body: "Some policy body text.",
        kind: "process_policy_note",
      }),
    );
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed external URL with 400 (not 409)", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    const res = await POST(
      jsonReq({
        title: "Bad URL ref",
        body: "Some content here. " + "Lorem ".repeat(20),
        kind: "external_reference",
        externalUrl: "javascript:alert(1)",
        externalSource: "Bad",
      }),
    );
    expect(res.status).toBe(400);
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });

  it("defaults reliabilityTier to 'single_source' for how_to_guide when omitted", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);
    prisma.knowledgeArticle.create.mockResolvedValueOnce({
      id: "art-1",
      slug: "default-tier-howto",
      title: "Default tier howto",
      kind: "how_to_guide",
      status: "draft",
    });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-1" });

    const res = await POST(
      jsonReq({
        title: "Default tier howto",
        body: "Body content here for the article.",
        kind: "how_to_guide",
      }),
    );
    expect(res.status).toBe(201);

    const createCall = prisma.knowledgeArticle.create.mock.calls[0]?.[0] as {
      data: { reliabilityTier: string };
    };
    expect(createCall.data.reliabilityTier).toBe("single_source");
  });

  it("defaults reliabilityTier to 'validated' for architecture_decision when omitted", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);
    prisma.knowledgeArticle.create.mockResolvedValueOnce({
      id: "art-2",
      slug: "default-tier-adr",
      title: "Default tier ADR",
      kind: "architecture_decision",
      status: "draft",
    });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-2" });

    const res = await POST(
      jsonReq({
        title: "Default tier ADR",
        body: "Body content here for the architecture decision.",
        kind: "architecture_decision",
      }),
    );
    expect(res.status).toBe(201);

    const createCall = prisma.knowledgeArticle.create.mock.calls[0]?.[0] as {
      data: { reliabilityTier: string };
    };
    expect(createCall.data.reliabilityTier).toBe("validated");
  });

  it("does not override an explicit client-supplied reliabilityTier", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);
    prisma.knowledgeArticle.create.mockResolvedValueOnce({
      id: "art-3",
      slug: "explicit-tier-adr",
      title: "Explicit tier ADR",
      kind: "architecture_decision",
      status: "draft",
    });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-3" });

    const res = await POST(
      jsonReq({
        title: "Explicit tier ADR",
        body: "Body content here for the architecture decision.",
        kind: "architecture_decision",
        reliabilityTier: "verified",
      }),
    );
    expect(res.status).toBe(201);

    const createCall = prisma.knowledgeArticle.create.mock.calls[0]?.[0] as {
      data: { reliabilityTier: string };
    };
    expect(createCall.data.reliabilityTier).toBe("verified");
  });
});
