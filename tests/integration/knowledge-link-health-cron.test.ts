import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const URL_ROUTE = "http://localhost/api/cron/knowledge-link-health";

function makeRequest() {
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { authorization: "Bearer s3cret" },
  });
}

describe("POST /api/cron/knowledge-link-health", () => {
  const originalSecret = process.env["CRON_SECRET"];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    process.env["CRON_SECRET"] = "s3cret";
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
    prisma.notification.create.mockResolvedValue({ id: "n-1" });
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env["CRON_SECRET"];
    } else {
      process.env["CRON_SECRET"] = originalSecret;
    }
  });

  it("returns 401 when neither bearer token nor admin session is present", async () => {
    mockAuthAs(null);
    const { POST } = await import("@/app/api/cron/knowledge-link-health/route");
    const res = await POST(new Request(URL_ROUTE, { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("notifies on broken links and audits each scan", async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-broken",
        slug: "broken",
        title: "Broken link article",
        externalUrl: "https://example.com/broken",
        reviewerUserId: "admin-1",
      },
      {
        id: "art-ok",
        slug: "ok",
        title: "Working link article",
        externalUrl: "https://example.com/ok",
        reviewerUserId: "admin-1",
      },
    ]);
    // No prior link_broken notifications: dedup lookup returns null.
    prisma.notification.findFirst.mockResolvedValue(null);

    // Mock the global fetch used by checkUrlHealth.
    let fetchCalls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls += 1;
      const u = String(url);
      if (u.includes("broken")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200 });
    }) as typeof globalThis.fetch;

    const { POST } = await import("@/app/api/cron/knowledge-link-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; broken: number; deduped: number };
    };
    expect(body.summary).toEqual({ scanned: 2, broken: 1, deduped: 0 });
    expect(fetchCalls).toBe(2);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);

    // Audit row written per article scan.
    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(
      auditActions.filter((a) => a === "knowledge.article.link_health_checked").length,
    ).toBe(2);
  });

  it("handles fetch errors as broken links without throwing", async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-err",
        slug: "err",
        title: "Error link article",
        externalUrl: "https://example.com/timeout",
        reviewerUserId: "admin-1",
      },
    ]);
    prisma.notification.findFirst.mockResolvedValue(null);

    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof globalThis.fetch;

    const { POST } = await import("@/app/api/cron/knowledge-link-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; broken: number; deduped: number };
    };
    expect(body.summary.broken).toBe(1);
    expect(body.summary.deduped).toBe(0);
  });

  it("dedup: suppresses a broken-link notification within the 7-day window", async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValueOnce([
      {
        id: "art-still-broken",
        slug: "still-broken",
        title: "Already-notified broken link",
        externalUrl: "https://example.com/broken",
        reviewerUserId: "admin-1",
      },
    ]);
    // Existing recent notification: dedup short-circuits.
    prisma.notification.findFirst.mockResolvedValue({ id: "n-existing" });

    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 404 }),
    ) as typeof globalThis.fetch;

    const { POST } = await import("@/app/api/cron/knowledge-link-health/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { scanned: number; broken: number; deduped: number };
    };
    expect(body.summary).toEqual({ scanned: 1, broken: 1, deduped: 1 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
