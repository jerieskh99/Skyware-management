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
    // The view exists, but it belongs to a different user — every read filtered
    // by `userId` should miss.
    prisma.savedView.findFirst.mockResolvedValue(null);
    prisma.savedView.updateMany.mockResolvedValue({ count: 0 });
    prisma.savedView.deleteMany.mockResolvedValue({ count: 0 });
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
