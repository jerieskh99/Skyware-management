import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/knowledge/[slug]/review/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(slug: string, body: unknown) {
  return new Request(`http://localhost/api/knowledge/${slug}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SLUG = "vpn-howto";

describe("POST /api/knowledge/[slug]/review — reviewer decision", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
    prisma.notification.create.mockResolvedValue({ id: "n-1" });
  });

  it("approves a pending review and transitions the article to 'approved'", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-1",
      slug: SLUG,
      title: "VPN how-to",
      status: "pending_review",
      authorUserId: "u-1",
    });

    // Two findFirst calls: the take-over lookup AND the decideReview lookup.
    prisma.knowledgeArticleReview.findFirst
      .mockResolvedValueOnce({ id: "rev-1", reviewerUserId: "admin-1" })
      .mockResolvedValueOnce({ id: "rev-1", reviewerUserId: "admin-1" });
    prisma.knowledgeArticleReview.update.mockResolvedValueOnce({});
    prisma.knowledgeArticle.update.mockResolvedValue({});

    const res = await POST(
      makeReq(SLUG, { decision: "approved", comment: "Looks good" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);

    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { status: string; lastReviewedAt: Date; reviewerUserId: string };
    };
    expect(updateCall.data.status).toBe("approved");
    expect(updateCall.data.lastReviewedAt).toBeInstanceOf(Date);
    expect(updateCall.data.reviewerUserId).toBe("admin-1");

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("knowledge.article.review_decided");
  });

  it("rejects the author trying to review their own article (422)", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-2",
      slug: SLUG,
      title: "X",
      status: "pending_review",
      authorUserId: "admin-1", // same as caller
    });

    const res = await POST(
      makeReq(SLUG, { decision: "approved" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });

  it("forbids a non-admin reviewer in V1", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-2" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-3",
      slug: SLUG,
      title: "X",
      status: "pending_review",
      authorUserId: "u-1",
    });

    const res = await POST(
      makeReq(SLUG, { decision: "approved" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(403);
  });

  it("sends a changes_requested decision back to draft", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce({
      id: "art-4",
      slug: SLUG,
      title: "X",
      status: "pending_review",
      authorUserId: "u-1",
    });
    // Three findFirst calls in this path:
    //   1) cycle check (selects cycleNumber),
    //   2) take-over lookup (selects id + reviewerUserId),
    //   3) decideReview lookup (selects id + reviewerUserId).
    prisma.knowledgeArticleReview.findFirst
      .mockResolvedValueOnce({ cycleNumber: 1 })
      .mockResolvedValueOnce({ id: "rev-1", reviewerUserId: "admin-1" })
      .mockResolvedValueOnce({ id: "rev-1", reviewerUserId: "admin-1" });
    prisma.knowledgeArticleReview.update.mockResolvedValueOnce({});
    prisma.knowledgeArticle.update.mockResolvedValue({});

    const res = await POST(
      makeReq(SLUG, { decision: "changes_requested", comment: "Add steps" }),
      makeParams(SLUG),
    );
    expect(res.status).toBe(200);

    const updateCall = prisma.knowledgeArticle.update.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateCall.data.status).toBe("draft");
  });
});
