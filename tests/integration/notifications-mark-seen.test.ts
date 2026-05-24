import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/notifications/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const NOTIF_ID = "00000000-0000-0000-0000-0000000000a1";
const URL = `http://localhost/api/notifications/${NOTIF_ID}`;

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: NOTIF_ID }) };
}

describe("PATCH /api/notifications/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 404 when the notification belongs to another user", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-alice" }));
    // findFirst is scoped by userId. A row owned by someone else returns null.
    prisma.notification.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest({ seen: true }), makeParams());

    expect(res.status).toBe(404);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 and writes an audit row when the caller owns the row", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-alice" }));

    prisma.notification.findFirst.mockResolvedValueOnce({
      id: NOTIF_ID,
      seenAt: null,
    });
    const updatedRow = {
      id: NOTIF_ID,
      userId: "u-alice",
      kind: "job_assigned",
      payload: { jobId: "j-1" },
      link: "/my-jobs/j-1",
      seenAt: new Date(),
      createdAt: new Date(),
    };
    prisma.notification.update.mockResolvedValueOnce(updatedRow);
    prisma.auditLog.create.mockResolvedValueOnce({ id: "a-1" });

    const res = await PATCH(makeRequest({ seen: true }), makeParams());

    expect(res.status).toBe(200);
    expect(prisma.notification.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("notification.seen");
    expect(auditCall.data.entityType).toBe("Notification");
    expect(auditCall.data.entityId).toBe(NOTIF_ID);
  });

  it("returns 400 when body is not { seen: true }", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-alice" }));

    const res = await PATCH(makeRequest({ seen: false }), makeParams());
    expect(res.status).toBe(400);
  });
});
