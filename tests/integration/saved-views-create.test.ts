import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST, GET } from "@/app/api/saved-views/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL = "http://localhost/api/saved-views";
const USER_ID = "emp-helpdesk-1";

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

describe("POST /api/saved-views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
  });

  it("returns 400 on missing scope", async () => {
    const res = await POST(postRequest({ name: "x", filterJson: {} }));
    expect(res.status).toBe(400);
    expect(prisma.savedView.create).not.toHaveBeenCalled();
  });

  it("creates a personal view, audits it, and returns 201", async () => {
    prisma.savedView.create.mockResolvedValueOnce({
      id: "view-1",
      userId: USER_ID,
      scope: "jobs",
      name: "Urgent",
      filterJson: { priority: "urgent" },
      visibility: "personal",
      isDefault: false,
      createdById: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(
      postRequest({
        scope: "jobs",
        name: "Urgent",
        filterJson: { priority: "urgent" },
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe("view-1");
    expect(body.name).toBe("Urgent");

    expect(prisma.savedView.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.savedView.create.mock.calls[0]?.[0] as {
      data: { userId: string; createdById: string; scope: string; visibility: string };
    };
    expect(createArg.data.userId).toBe(USER_ID);
    expect(createArg.data.createdById).toBe(USER_ID);
    expect(createArg.data.scope).toBe("jobs");
    expect(createArg.data.visibility).toBe("personal");

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditArg.data.action).toBe("saved_view.created");
    expect(auditArg.data.entityType).toBe("SavedView");
    expect(auditArg.data.entityId).toBe("view-1");
  });
});

describe("GET /api/saved-views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
  });

  it("returns 400 on unknown scope", async () => {
    const res = await GET(getRequest("nonsense"));
    expect(res.status).toBe(400);
    expect(prisma.savedView.findMany).not.toHaveBeenCalled();
  });

  it("returns the calling user's views and team views in the requested scope", async () => {
    prisma.savedView.findMany.mockResolvedValueOnce([
      {
        id: "v1",
        userId: USER_ID,
        scope: "jobs",
        name: "A",
        filterJson: {},
        visibility: "personal",
        isDefault: true,
        createdById: USER_ID,
      },
    ]);

    const res = await GET(getRequest("jobs"));
    expect(res.status).toBe(200);

    const findArg = prisma.savedView.findMany.mock.calls[0]?.[0] as {
      where: { scope: string; OR: Array<{ userId?: string; visibility?: string }> };
    };
    expect(findArg.where.scope).toBe("jobs");
    expect(findArg.where.OR).toEqual([{ userId: USER_ID }, { visibility: "team" }]);
  });
});
