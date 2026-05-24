import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH, DELETE } from "@/app/api/saved-views/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const URL_BASE = "http://localhost/api/saved-views";
const TEAM_VIEW = "team-view-owned-by-someone-else";

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

describe("Admin can edit/delete team views owned by another user", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("admin renames a team view owned by someone else", async () => {
    mockAuthAs(makeAdminSession());
    const row = {
      id: TEAM_VIEW,
      userId: "someone-else",
      createdById: "someone-else",
      scope: "jobs",
      name: "Old name",
      isDefault: false,
      visibility: "team",
    };
    prisma.savedView.findFirst
      .mockResolvedValueOnce(row) // PATCH route lookup
      .mockResolvedValueOnce(row) // updateForUser existence
      .mockResolvedValueOnce({ ...row, name: "Admin renamed", filterJson: {} }); // updateForUser re-read
    prisma.savedView.update.mockResolvedValueOnce({ id: TEAM_VIEW, name: "Admin renamed" });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      patchRequest(TEAM_VIEW, { name: "Admin renamed" }),
      makeParams(TEAM_VIEW),
    );

    expect(res.status).toBe(200);
    const updateCall = prisma.savedView.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { name: string };
    };
    expect(updateCall.where.id).toBe(TEAM_VIEW);
    expect(updateCall.data.name).toBe("Admin renamed");
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("admin deletes a team view owned by someone else", async () => {
    mockAuthAs(makeAdminSession());
    const row = {
      id: TEAM_VIEW,
      userId: "someone-else",
      createdById: "someone-else",
      scope: "jobs",
      name: "Team alerts",
      visibility: "team",
    };
    prisma.savedView.findFirst
      .mockResolvedValueOnce(row) // DELETE route lookup
      .mockResolvedValueOnce(row); // deleteForUser existence
    prisma.savedView.delete.mockResolvedValueOnce({ id: TEAM_VIEW });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await DELETE(deleteRequest(TEAM_VIEW), makeParams(TEAM_VIEW));
    expect(res.status).toBe(204);
    expect(prisma.savedView.delete).toHaveBeenCalledWith({ where: { id: TEAM_VIEW } });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("non-admin non-owner gets 404 on a team view they don't own", async () => {
    mockAuthAs(makeEmployeeSession({ department: "it" }, { id: "emp-it-1" }));
    prisma.savedView.findFirst.mockResolvedValue({
      id: TEAM_VIEW,
      userId: "someone-else",
      createdById: "someone-else",
      scope: "jobs",
      name: "Team alerts",
      isDefault: false,
      visibility: "team",
    });

    const res = await PATCH(
      patchRequest(TEAM_VIEW, { name: "hijack" }),
      makeParams(TEAM_VIEW),
    );
    expect(res.status).toBe(404);
    expect(prisma.savedView.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
