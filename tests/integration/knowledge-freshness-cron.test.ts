import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const URL_ROUTE = "http://localhost/api/cron/knowledge-freshness";

function makeRequest() {
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { authorization: "Bearer s3cret" },
  });
}

const NOW = new Date("2026-05-27T12:00:00Z").getTime();

describe("POST /api/cron/knowledge-freshness", () => {
  const originalSecret = process.env["CRON_SECRET"];

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "s3cret";
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
    prisma.notification.create.mockResolvedValue({ id: "n-1" });
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) {
      delete process.env["CRON_SECRET"];
    } else {
      process.env["CRON_SECRET"] = originalSecret;
    }
  });

  it("returns 401 when the bearer token is missing and there is no admin session", async () => {
    mockAuthAs(null);
    const req = new Request(URL_ROUTE, { method: "POST" });
    const { POST } = await import("@/app/api/cron/knowledge-freshness/route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("notifies on overdue external_reference articles, skipping fresh ones", async () => {
    // Two published articles: one overdue, one fresh.
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-stale",
        slug: "stale-art",
        title: "Stale article",
        kind: "external_reference",
        publishedAt: new Date(NOW - 200 * 86400_000),
        lastReviewedAt: null,
        lastVerifiedAt: null,
        reviewerUserId: "admin-1",
      },
      {
        id: "art-fresh",
        slug: "fresh-art",
        title: "Fresh article",
        kind: "external_reference",
        publishedAt: new Date(NOW - 10 * 86400_000),
        lastReviewedAt: null,
        lastVerifiedAt: null,
        reviewerUserId: "admin-1",
      },
    ]);

    // No previous notification rows: dedup lookup returns null.
    prisma.notification.findFirst.mockResolvedValueOnce(null);
    prisma.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }]);

    const { POST } = await import("@/app/api/cron/knowledge-freshness/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; notified: number; skipped: number };
    };
    expect(body.summary).toEqual({ scanned: 2, notified: 1, skipped: 1 });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("dedup: skips articles already notified within the dedup window", async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-stale",
        slug: "stale-art",
        title: "Stale art",
        kind: "external_reference",
        publishedAt: new Date(NOW - 400 * 86400_000),
        lastReviewedAt: null,
        lastVerifiedAt: null,
        reviewerUserId: "admin-1",
      },
    ]);
    prisma.notification.findFirst.mockResolvedValueOnce({ id: "n-existing" });
    prisma.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }]);

    const { POST } = await import("@/app/api/cron/knowledge-freshness/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; notified: number; skipped: number };
    };
    expect(body.summary.notified).toBe(0);
    expect(body.summary.skipped).toBe(1);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
