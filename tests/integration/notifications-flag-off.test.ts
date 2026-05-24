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

describe("notifications — feature flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("does not write a notification row when notifications_enabled is false", async () => {
    mockAuthAs(
      makeEmployeeSession(
        { department: "helpdesk" },
        { id: "u-author", username: "it.demo" }
      )
    );

    prisma.communicationChannel.findUnique.mockResolvedValueOnce({
      id: "ch-helpdesk",
      key: "helpdesk",
      department: { key: "helpdesk", nameEn: "Helpdesk" },
    });

    prisma.communicationPost.create.mockResolvedValueOnce({
      id: "post-2",
      channelId: "ch-helpdesk",
      authorId: "u-author",
      title: "Quiet day",
      body: "ping @helpdesk.demo",
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-2" });

    // Flag is OFF → trigger short-circuits before any DB write.
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

    // The route resolves mentioned users even when the flag is off (cheap
    // lookup, the no-op happens inside the trigger). Return an empty list so
    // the loop never even reaches the trigger.
    prisma.user.findMany.mockResolvedValueOnce([{ id: "u-helpdesk" }]);

    const res = await POST(
      makeRequest({
        title: "Quiet day",
        body: "ping @helpdesk.demo please",
      }),
      makeParams()
    );

    expect(res.status).toBe(201);
    // The notification create must NOT have been called.
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
