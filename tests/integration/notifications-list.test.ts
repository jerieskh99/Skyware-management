import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/notifications/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/notifications";

function makeRequest(qs = "") {
  return new Request(`${URL}${qs}`, { method: "GET" });
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns only the caller's notifications and the caller's unread count", async () => {
    const caller = makeEmployeeSession(
      { department: "helpdesk" },
      { id: "user-alice" }
    );
    mockAuthAs(caller);

    const own = [
      {
        id: "n-1",
        userId: "user-alice",
        kind: "job_assigned",
        payload: { jobId: "j-1", publicNumber: "J-001", title: "Fix VPN" },
        link: "/my-jobs/j-1",
        seenAt: null,
        createdAt: new Date(),
      },
    ];

    prisma.notification.findMany.mockResolvedValueOnce(own);
    prisma.notification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest("?limit=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; userId: string }>;
      unread: number;
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe("n-1");
    expect(body.unread).toBe(1);

    // The query must filter by the caller's id (defense-in-depth).
    const findCall = prisma.notification.findMany.mock.calls[0]?.[0] as {
      where: { userId: string };
    };
    expect(findCall.where.userId).toBe("user-alice");
    const countCall = prisma.notification.count.mock.calls[0]?.[0] as {
      where: { userId: string; seenAt: null };
    };
    expect(countCall.where.userId).toBe("user-alice");
    expect(countCall.where.seenAt).toBeNull();
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("clamps limit to a max of 50", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));
    prisma.notification.findMany.mockResolvedValueOnce([]);
    prisma.notification.count.mockResolvedValueOnce(0);

    await GET(makeRequest("?limit=999"));
    const findCall = prisma.notification.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(findCall.take).toBe(50);
  });
});
