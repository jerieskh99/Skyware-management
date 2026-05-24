import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/saved-views/route";
import { PATCH } from "@/app/api/saved-views/[id]/route";
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

function patchRequest(id: string, body: unknown) {
  return new Request(`${URL}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("saved_views_team_shared_enabled flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    // Flag returns null/disabled.
    prisma.featureFlag.findUnique.mockResolvedValue(null);
  });

  it("POST with visibility=team returns 400", async () => {
    const res = await POST(
      postRequest({
        scope: "jobs",
        name: "Team",
        filterJson: { x: "1" },
        visibility: "team",
      }),
    );
    expect(res.status).toBe(400);
    expect(prisma.savedView.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("PATCH that flips visibility to team returns 400", async () => {
    const res = await PATCH(
      patchRequest("v1", { visibility: "team" }),
      makeParams("v1"),
    );
    expect(res.status).toBe(400);
    expect(prisma.savedView.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("POST with visibility=personal still works when flag is off", async () => {
    prisma.savedView.create.mockResolvedValueOnce({
      id: "v-personal-1",
      userId: "emp-helpdesk-1",
      scope: "jobs",
      name: "Mine",
      filterJson: {},
      visibility: "personal",
      isDefault: false,
      createdById: "emp-helpdesk-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(
      postRequest({
        scope: "jobs",
        name: "Mine",
        filterJson: {},
        visibility: "personal",
      }),
    );
    expect(res.status).toBe(201);
  });
});
