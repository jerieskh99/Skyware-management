import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/admin/sla-defaults/[priority]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, makeEmployeeSession, mockAuthAs } from "../helpers/session";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/sla-defaults/urgent", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(priority = "urgent") {
  return { params: Promise.resolve({ priority }) };
}

describe("PATCH /api/admin/sla-defaults/[priority]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("rejects non-admin with 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await PATCH(makeRequest({ targetMinutes: 90 }), makeParams());
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated with 401", async () => {
    mockAuthAs(null);
    const res = await PATCH(makeRequest({ targetMinutes: 90 }), makeParams());
    expect(res.status).toBe(401);
  });

  it("rejects an unknown priority with 400", async () => {
    mockAuthAs(makeAdminSession());
    const res = await PATCH(makeRequest({ targetMinutes: 90 }), makeParams("super-urgent"));
    expect(res.status).toBe(400);
  });

  it.each([
    [0],
    [-5],
    [7201],
    [1.5],
  ])("rejects invalid targetMinutes %p with 400", async (value) => {
    mockAuthAs(makeAdminSession());
    const res = await PATCH(makeRequest({ targetMinutes: value }), makeParams());
    expect(res.status).toBe(400);
  });

  it("upserts the row and writes one audit entry on success", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-7" }));
    prisma.slaDefaults.findUnique.mockResolvedValueOnce({
      id: "sla-1",
      targetMinutes: 60,
    });
    prisma.slaDefaults.upsert.mockResolvedValueOnce({
      id: "sla-1",
      priority: "urgent",
      targetMinutes: 45,
      updatedAt: new Date("2026-05-24T10:00:00Z"),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(makeRequest({ targetMinutes: 45 }), makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { priority: string; targetMinutes: number };
    expect(body.priority).toBe("urgent");
    expect(body.targetMinutes).toBe(45);

    expect(prisma.slaDefaults.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prisma.slaDefaults.upsert.mock.calls[0]?.[0] as {
      where: { priority: string };
      update: { targetMinutes: number; updatedByUserId: string };
      create: { priority: string; targetMinutes: number; updatedByUserId: string };
    };
    expect(upsertArg.where.priority).toBe("urgent");
    expect(upsertArg.update.targetMinutes).toBe(45);
    expect(upsertArg.update.updatedByUserId).toBe("admin-7");

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: {
        action: string;
        entityType: string;
        entityId: string;
        actorUserId: string;
        diffJson: { targetMinutes: { old: number; new: number } };
      };
    };
    expect(auditArg.data.action).toBe("sla_defaults.updated");
    expect(auditArg.data.entityType).toBe("SlaDefaults");
    expect(auditArg.data.actorUserId).toBe("admin-7");
    expect(auditArg.data.diffJson.targetMinutes).toEqual({ old: 60, new: 45 });
  });
});
