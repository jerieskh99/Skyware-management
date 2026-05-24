import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST, GET } from "@/app/api/saved-views/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/saved-views";

function postRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(scope: string) {
  return new Request(`${URL}?scope=${scope}`);
}

describe("Team-shared saved views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("a logged-in user creates a team view when the flag is on", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    // Feature-flag lookup for saved_views_team_shared_enabled.
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });
    prisma.savedView.create.mockResolvedValueOnce({
      id: "team-view-1",
      userId: "emp-helpdesk-1",
      scope: "jobs",
      name: "Team Urgent",
      filterJson: { priority: "urgent" },
      visibility: "team",
      isDefault: false,
      createdById: "emp-helpdesk-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(
      postRequest({
        scope: "jobs",
        name: "Team Urgent",
        filterJson: { priority: "urgent" },
        visibility: "team",
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; visibility: string };
    expect(body.id).toBe("team-view-1");
    expect(body.visibility).toBe("team");

    const createArg = prisma.savedView.create.mock.calls[0]?.[0] as {
      data: { visibility: string; isTeam: boolean };
    };
    expect(createArg.data.visibility).toBe("team");
    expect(createArg.data.isTeam).toBe(true);
  });

  it("another user sees the team view on GET", async () => {
    // Caller is a different user; the listVisibleTo OR clause must include
    // team views in addition to the caller's own.
    mockAuthAs(makeEmployeeSession({ department: "it" }, { id: "emp-it-1" }));
    prisma.savedView.findMany.mockResolvedValueOnce([
      {
        id: "team-view-1",
        userId: "emp-helpdesk-1",
        scope: "jobs",
        name: "Team Urgent",
        filterJson: { priority: "urgent" },
        visibility: "team",
        isDefault: false,
        createdById: "emp-helpdesk-1",
      },
    ]);

    const res = await GET(getRequest("jobs"));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; visibility: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("team-view-1");
    expect(rows[0]?.visibility).toBe("team");

    const findArg = prisma.savedView.findMany.mock.calls[0]?.[0] as {
      where: { scope: string; OR: Array<{ userId?: string; visibility?: string }> };
    };
    expect(findArg.where.scope).toBe("jobs");
    expect(findArg.where.OR).toContainEqual({ userId: "emp-it-1" });
    expect(findArg.where.OR).toContainEqual({ visibility: "team" });
  });
});
