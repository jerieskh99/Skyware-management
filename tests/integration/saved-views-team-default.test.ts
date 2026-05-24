import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/saved-views/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL_BASE = "http://localhost/api/saved-views";
const NEW_DEFAULT = "team-view-new";
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

describe("Team-default pin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
  });

  it("setting a second team default un-pins the first across the org", async () => {
    // The route-level findFirst, then updateForUser+setDefaultForUser lookups
    // all return the team view we're pinning.
    const teamRow = {
      id: NEW_DEFAULT,
      userId: USER_ID,
      createdById: USER_ID,
      scope: "jobs",
      name: "Team B",
      isDefault: false,
      visibility: "team",
    };
    prisma.savedView.findFirst
      .mockResolvedValueOnce(teamRow) // PATCH route lookup
      .mockResolvedValueOnce(teamRow) // updateForUser existence
      .mockResolvedValueOnce({ // updateForUser final re-read
        ...teamRow,
        filterJson: {},
      })
      .mockResolvedValueOnce(teamRow) // setDefaultForUser target lookup
      .mockResolvedValueOnce({ // setDefaultForUser final re-read
        ...teamRow,
        filterJson: {},
        isDefault: true,
      });

    // setDefaultForUser team clearing updateMany.
    prisma.savedView.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.savedView.update.mockResolvedValueOnce({
      id: NEW_DEFAULT,
      isDefault: true,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      patchRequest(NEW_DEFAULT, { isDefault: true }),
      makeParams(NEW_DEFAULT),
    );

    expect(res.status).toBe(200);

    // The team clearing updateMany must scope to (scope, visibility=team)
    // ACROSS THE ORG (no userId filter) and exclude the view being pinned.
    const clearingCall = prisma.savedView.updateMany.mock.calls[0]?.[0] as {
      where: {
        scope: string;
        visibility: string;
        isDefault: boolean;
        NOT: { id: string };
        userId?: string;
      };
      data: { isDefault: boolean };
    };
    expect(clearingCall.where.scope).toBe("jobs");
    expect(clearingCall.where.visibility).toBe("team");
    expect(clearingCall.where.isDefault).toBe(true);
    expect(clearingCall.where.NOT.id).toBe(NEW_DEFAULT);
    // Team clearing must NOT scope to a user.
    expect(clearingCall.where.userId).toBeUndefined();
    expect(clearingCall.data.isDefault).toBe(false);

    // The new default is set via savedView.update.
    expect(prisma.savedView.update).toHaveBeenCalledWith({
      where: { id: NEW_DEFAULT },
      data: { isDefault: true },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
