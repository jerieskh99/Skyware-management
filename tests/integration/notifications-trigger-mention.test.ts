import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/channels/[key]/posts/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/channels/helpdesk/posts";

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ key: "helpdesk" }) };
}

describe("POST /api/channels/[key]/posts — mention trigger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("writes one notification for the mentioned user, none for the author, when the feature flag is on", async () => {
    const author = makeEmployeeSession(
      { department: "helpdesk" },
      { id: "u-author", username: "it.demo" }
    );
    mockAuthAs(author);

    // Channel lookup — author can post here.
    prisma.communicationChannel.findUnique.mockResolvedValueOnce({
      id: "ch-helpdesk",
      key: "helpdesk",
      department: { key: "helpdesk", nameEn: "Helpdesk" },
    });

    // Post create.
    prisma.communicationPost.create.mockResolvedValueOnce({
      id: "post-1",
      channelId: "ch-helpdesk",
      authorId: "u-author",
      title: "VPN down",
      body: "ping @helpdesk.demo",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-1" });

    // Feature flag lookup performed inside the notify trigger.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

    // Username -> user resolution. Author already filtered out by the query
    // `id: { not: user.id }`, so only the mentioned user is returned.
    prisma.user.findMany.mockResolvedValueOnce([{ id: "u-helpdesk" }]);

    // Notification create.
    prisma.notification.create.mockResolvedValueOnce({ id: "n-1" });

    const res = await POST(
      makeRequest({
        title: "VPN down",
        body: "ping @helpdesk.demo and @it.demo (self) please",
      }),
      makeParams()
    );

    expect(res.status).toBe(201);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);

    const created = prisma.notification.create.mock.calls[0]?.[0] as {
      data: { userId: string; kind: string };
    };
    expect(created.data.userId).toBe("u-helpdesk");
    expect(created.data.kind).toBe("mention");

    // The user-lookup query excludes the author by id.
    const userFind = prisma.user.findMany.mock.calls[0]?.[0] as {
      where: { id: { not: string }; username: { in: string[] } };
    };
    expect(userFind.where.id).toEqual({ not: "u-author" });
    // The username list should include the mentioned name (lowercased).
    expect(userFind.where.username.in).toContain("helpdesk.demo");
    // The author's own username is also a candidate (lib doesn't pre-filter)
    // but the SQL filter strips it. That is the safe approach: filter at the DB.
    expect(userFind.where.username.in).toContain("it.demo");
  });
});
