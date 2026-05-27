import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/knowledge/pending-review-count/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

describe("GET /api/knowledge/pending-review-count", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  it("returns 401 for unauthenticated callers", async () => {
    mockAuthAs(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prisma.knowledgeArticle.count).not.toHaveBeenCalled();
  });

  it("returns 404 when the knowledge feature flag is off", async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    const res = await GET();
    expect(res.status).toBe(404);
    expect(prisma.knowledgeArticle.count).not.toHaveBeenCalled();
  });

  it("returns { count: 0 } for non-admin callers without querying", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(0);
    expect(prisma.knowledgeArticle.count).not.toHaveBeenCalled();
  });

  it("returns the queue size for admins, excluding their own authored articles", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.knowledgeArticle.count.mockResolvedValueOnce(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(3);

    const callArg = prisma.knowledgeArticle.count.mock.calls[0]?.[0] as {
      where: { status: string; authorUserId: { not: string } };
    };
    expect(callArg.where.status).toBe("pending_review");
    expect(callArg.where.authorUserId).toEqual({ not: "admin-1" });
  });
});
