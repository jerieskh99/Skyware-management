import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH, DELETE } from "@/app/api/saved-views/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const URL_BASE = "http://localhost/api/saved-views";
const OTHER_USER_VIEW_ID = "view-belongs-to-someone-else";

function patchRequest(id: string, body: unknown) {
  return new Request(`${URL_BASE}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(id: string) {
  return new Request(`${URL_BASE}/${id}`, { method: "DELETE" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Cross-user access to /api/saved-views/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    // The view exists but belongs to a different user. A non-admin non-owner
    // is rejected by `canManageTeamView` and the route converts that to 404.
    prisma.savedView.findFirst.mockResolvedValue({
      id: OTHER_USER_VIEW_ID,
      userId: "some-other-user",
      createdById: "some-other-user",
      scope: "jobs",
      name: "Their view",
      isDefault: false,
      visibility: "personal",
    });
  });

  it("PATCH returns 404 (not 403) for a view owned by another user", async () => {
    const res = await PATCH(
      patchRequest(OTHER_USER_VIEW_ID, { name: "hijack" }),
      makeParams(OTHER_USER_VIEW_ID),
    );
    expect(res.status).toBe(404);

    // No mutation, no audit row should have been written.
    expect(prisma.savedView.update).not.toHaveBeenCalled();
    expect(prisma.savedView.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("DELETE returns 404 (not 403) for a view owned by another user", async () => {
    const res = await DELETE(deleteRequest(OTHER_USER_VIEW_ID), makeParams(OTHER_USER_VIEW_ID));
    expect(res.status).toBe(404);

    expect(prisma.savedView.delete).not.toHaveBeenCalled();
    expect(prisma.savedView.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
