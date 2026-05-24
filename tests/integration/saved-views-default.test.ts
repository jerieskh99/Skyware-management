import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/saved-views/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL_BASE = "http://localhost/api/saved-views";
const VIEW_ID = "view-default-1";
const USER_ID = "emp-helpdesk-1";

function patchRequest(id: string, body: unknown) {
  return new Request(`${URL_BASE}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Set default saved view", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
  });

  it("clears prior personal defaults in the same scope before setting the new one", async () => {
    prisma.savedView.findFirst
      // PATCH route's existence + manage check
      .mockResolvedValueOnce({
        id: VIEW_ID,
        userId: USER_ID,
        createdById: USER_ID,
        scope: "jobs",
        name: "Urgent",
        isDefault: false,
        visibility: "personal",
      })
      // updateForUser existence lookup
      .mockResolvedValueOnce({
        id: VIEW_ID,
        userId: USER_ID,
        createdById: USER_ID,
        visibility: "personal",
      })
      // updateForUser re-read after no-op patch
      .mockResolvedValueOnce({
        id: VIEW_ID,
        userId: USER_ID,
        scope: "jobs",
        name: "Urgent",
        filterJson: {},
        visibility: "personal",
        isDefault: false,
        createdById: USER_ID,
      })
      // setDefaultForUser target lookup
      .mockResolvedValueOnce({
        id: VIEW_ID,
        userId: USER_ID,
        createdById: USER_ID,
        visibility: "personal",
      })
      // setDefaultForUser final select after pinning
      .mockResolvedValueOnce({
        id: VIEW_ID,
        userId: USER_ID,
        scope: "jobs",
        name: "Urgent",
        filterJson: {},
        visibility: "personal",
        isDefault: true,
        createdById: USER_ID,
      });

    // setDefaultForUser personal clearing updateMany
    prisma.savedView.updateMany.mockResolvedValueOnce({ count: 1 });

    prisma.savedView.update.mockResolvedValueOnce({
      id: VIEW_ID,
      isDefault: true,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      patchRequest(VIEW_ID, { isDefault: true }),
      makeParams(VIEW_ID),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; isDefault: boolean };
    expect(body.id).toBe(VIEW_ID);
    expect(body.isDefault).toBe(true);

    // The personal clearing updateMany must scope to (userId, scope, visibility=personal)
    // and exclude the view being pinned.
    const clearingCall = prisma.savedView.updateMany.mock.calls[0]?.[0] as {
      where: {
        userId: string;
        scope: string;
        visibility: string;
        isDefault: boolean;
        NOT: { id: string };
      };
      data: { isDefault: boolean };
    };
    expect(clearingCall.where.userId).toBe(USER_ID);
    expect(clearingCall.where.scope).toBe("jobs");
    expect(clearingCall.where.visibility).toBe("personal");
    expect(clearingCall.where.isDefault).toBe(true);
    expect(clearingCall.where.NOT.id).toBe(VIEW_ID);
    expect(clearingCall.data.isDefault).toBe(false);

    // The new default is set via savedView.update.
    expect(prisma.savedView.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.savedView.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { isDefault: boolean };
    };
    expect(updateCall.where.id).toBe(VIEW_ID);
    expect(updateCall.data.isDefault).toBe(true);

    // Everything happened inside a single $transaction call.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
