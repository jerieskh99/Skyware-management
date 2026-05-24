import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/admin/users/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const SELF_ID = "admin-1"; // matches makeAdminSession().id
const OTHER_ID = "00000000-0000-0000-0000-0000000other";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/users/${OTHER_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/admin/users/[id] (self-deactivation guard)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession({ id: SELF_ID }));
  });

  it("rejects an admin deactivating their own account", async () => {
    // findUnique returns the same admin row the session represents.
    prisma.user.findUnique.mockResolvedValueOnce({
      id: SELF_ID,
      displayName: "CEO",
      isActive: true,
      role: { key: "ceo" },
      department: { key: "global" },
    });

    const res = await PATCH(
      makeRequest({ isActive: false }),
      makeParams(SELF_ID)
    );

    // 422 (state invariant violation), not 400 (validation).
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/deactivate your own account/i);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows deactivating a different user", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: OTHER_ID,
      displayName: "Some Employee",
      isActive: true,
      role: { key: "employee" },
      department: { key: "helpdesk" },
    });
    prisma.user.update.mockResolvedValueOnce({ id: OTHER_ID });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await PATCH(
      makeRequest({ isActive: false }),
      makeParams(OTHER_ID)
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(OTHER_ID);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("user.updated");
    expect(auditCall.data.entityType).toBe("User");
    expect(auditCall.data.entityId).toBe(OTHER_ID);
  });
});
