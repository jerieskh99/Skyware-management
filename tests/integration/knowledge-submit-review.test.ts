import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/[slug]/submit-review/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string) {
  return new Request(`http://localhost/api/knowledge/${slug}/submit-review`, {
    method: "POST",
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

const VALID_HOWTO_BODY =
  "This how-to walks through configuring the corporate VPN client end to end. " +
  "Make sure you have admin rights on the laptop and a working network connection. " +
  "Step one is downloading the installer from the company portal under the IT section. " +
  "Step two is launching the installer with admin privileges. " +
  "Step three is entering the company gateway URL and your SSO credentials when prompted. " +
  "Verification is confirmed by browsing to the internal-only intranet page that loads only when the tunnel is active. " +
  "If the tunnel does not come up immediately, check the firewall rules and confirm split tunneling is not blocking the corporate range. " +
  "Lorem ipsum ".repeat(120);

describe("POST /api/knowledge/[slug]/submit-review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
  });

  it("submits a draft article for review and fans out to admins", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: SLUG,
      title: "Configure the VPN end-to-end for new technicians",
      summary:
        "Setup, verification, and troubleshooting for the corporate VPN client. " +
        "Includes installer, SSO, and internal-page check.",
      body: VALID_HOWTO_BODY,
      kind: "how_to_guide",
      status: "draft",
      authorUserId: "u-1",
      externalUrl: null,
      externalSource: null,
      tags: [{ tagId: "t-1" }],
    });

    prisma.user.findMany.mockResolvedValueOnce([
      { id: "admin-1" },
      { id: "admin-2" },
    ]);
    prisma.knowledgeArticleReview.findFirst.mockResolvedValueOnce(null);
    prisma.knowledgeArticleReview.create.mockResolvedValueOnce({
      id: "rev-1",
      cycleNumber: 1,
    });
    prisma.knowledgeArticle.update.mockResolvedValue({});

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticleReview.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("knowledge.article.submitted_for_review");
  });

  it("returns 422 with the issue list when submission fails validators", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      slug: SLUG,
      title: "Too short",
      summary: null,
      body: "Just a few words",
      kind: "how_to_guide",
      status: "draft",
      authorUserId: "u-1",
      externalUrl: null,
      externalSource: null,
      tags: [],
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: string;
      issues: Array<{ code: string }>;
    };
    expect(body.error).toBe("validation_failed");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("forbids non-authors (non-admin) from submitting another user's draft", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-2" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      slug: SLUG,
      title: "Article belonging to another author",
      summary: "blah blah blah blah blah blah blah blah blah",
      body: VALID_HOWTO_BODY,
      kind: "how_to_guide",
      status: "draft",
      authorUserId: "u-1",
      externalUrl: null,
      externalSource: null,
      tags: [{ tagId: "t-1" }],
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("returns 422 when the article is not in a submittable status", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-4",
      slug: SLUG,
      title: "Already published",
      summary: "summary text long enough to pass the basic length check 123",
      body: VALID_HOWTO_BODY,
      kind: "how_to_guide",
      status: "published",
      authorUserId: "admin-1",
      externalUrl: null,
      externalSource: null,
      tags: [{ tagId: "t-1" }],
    });

    const res = await POST(makeReq(SLUG), makeParams(SLUG));
    expect(res.status).toBe(422);
  });
});
