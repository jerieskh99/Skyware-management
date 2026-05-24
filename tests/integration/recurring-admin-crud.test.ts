import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, makeEmployeeSession, mockAuthAs } from "../helpers/session";

const LIST_URL = "http://localhost/api/admin/recurring-templates";

function listRequest() {
  return new Request(LIST_URL, { method: "GET" });
}
function createRequest(body: unknown) {
  return new Request(LIST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function pauseRequest(id: string) {
  return new Request(`${LIST_URL}/${id}/pause`, { method: "POST" });
}
function resumeRequest(id: string) {
  return new Request(`${LIST_URL}/${id}/resume`, { method: "POST" });
}
function deleteRequest(id: string) {
  return new Request(`${LIST_URL}/${id}`, { method: "DELETE" });
}

const DEPT_HELPDESK_UUID = "11111111-1111-1111-1111-111111111111";

const validInput = {
  titleTemplate: "Weekly check {{date}}",
  departmentId: DEPT_HELPDESK_UUID,
  cadence: "weekly" as const,
  anchor: { dayOfWeek: 1, minuteOfDay: 9 * 60 },
  timezone: "Asia/Jerusalem",
};

const fakeTemplate = {
  id: "tpl-1",
  name: null,
  titleTemplate: validInput.titleTemplate,
  description: null,
  departmentId: validInput.departmentId,
  clientId: null,
  priority: "normal" as const,
  severity: "moderate" as const,
  defaultAssigneeId: null,
  cadence: validInput.cadence,
  anchor: validInput.anchor,
  timezone: validInput.timezone,
  nextRunAt: new Date("2026-05-25T06:00:00Z"),
  lastGeneratedAt: null,
  generatedCount: 0,
  status: "active" as const,
  createdByUserId: "admin-1",
  updatedByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("/api/admin/recurring-templates — CRUD permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("GET rejects unauthenticated with 401", async () => {
    mockAuthAs(null);
    const { GET } = await import("@/app/api/admin/recurring-templates/route");
    const res = await GET(listRequest());
    expect(res.status).toBe(401);
  });

  it("GET rejects non-admin with 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { GET } = await import("@/app/api/admin/recurring-templates/route");
    const res = await GET(listRequest());
    expect(res.status).toBe(403);
    expect(prisma.recurringJobTemplate.findMany).not.toHaveBeenCalled();
  });

  it("POST rejects non-admin with 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { POST } = await import("@/app/api/admin/recurring-templates/route");
    const res = await POST(createRequest(validInput));
    expect(res.status).toBe(403);
    expect(prisma.recurringJobTemplate.create).not.toHaveBeenCalled();
  });

  it("POST 400 on invalid anchor for cadence", async () => {
    mockAuthAs(makeAdminSession());
    const { POST } = await import("@/app/api/admin/recurring-templates/route");
    const res = await POST(createRequest({ ...validInput, anchor: { wrong: 1 } }));
    expect(res.status).toBe(400);
    expect(prisma.recurringJobTemplate.create).not.toHaveBeenCalled();
  });

  it("POST 201 creates a template for admin and writes audit", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-9" }));
    prisma.recurringJobTemplate.create.mockResolvedValueOnce(fakeTemplate);

    const { POST } = await import("@/app/api/admin/recurring-templates/route");
    const res = await POST(createRequest(validInput));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("tpl-1");

    expect(prisma.recurringJobTemplate.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
    expect(auditArg.data.action).toBe("recurring_template.created");
  });

  it("POST /[id]/pause flips status to paused", async () => {
    mockAuthAs(makeAdminSession());
    prisma.recurringJobTemplate.findUnique.mockResolvedValue({ id: "tpl-1", status: "active" });
    prisma.recurringJobTemplate.update.mockResolvedValueOnce({ ...fakeTemplate, status: "paused" });

    const { POST } = await import("@/app/api/admin/recurring-templates/[id]/pause/route");
    const res = await POST(new Request(`${LIST_URL}/tpl-1/pause`, { method: "POST" }), {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(200);
    const upd = prisma.recurringJobTemplate.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(upd.data.status).toBe("paused");
    const auditCalls = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(auditCalls).toContain("recurring_template.paused");
  });

  it("POST /[id]/pause rejects non-admin with 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { POST } = await import("@/app/api/admin/recurring-templates/[id]/pause/route");
    const res = await POST(pauseRequest("tpl-1"), { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST /[id]/resume recomputes nextRunAt and flips to active", async () => {
    mockAuthAs(makeAdminSession());
    prisma.recurringJobTemplate.findUnique.mockResolvedValueOnce({ id: "tpl-1" });
    prisma.recurringJobTemplate.findUnique.mockResolvedValueOnce({ ...fakeTemplate, status: "paused" });
    prisma.recurringJobTemplate.update.mockResolvedValueOnce({ ...fakeTemplate, status: "active" });

    const { POST } = await import("@/app/api/admin/recurring-templates/[id]/resume/route");
    const res = await POST(resumeRequest("tpl-1"), { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(200);
    const upd = prisma.recurringJobTemplate.update.mock.calls[0]?.[0] as { data: { status: string; nextRunAt: Date } };
    expect(upd.data.status).toBe("active");
    expect(upd.data.nextRunAt).toBeInstanceOf(Date);
  });

  it("DELETE 404 when template missing", async () => {
    mockAuthAs(makeAdminSession());
    prisma.recurringJobTemplate.findUnique.mockResolvedValueOnce(null);
    const { DELETE } = await import("@/app/api/admin/recurring-templates/[id]/route");
    const res = await DELETE(deleteRequest("nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("DELETE 200 hard-deletes and audits", async () => {
    mockAuthAs(makeAdminSession());
    prisma.recurringJobTemplate.findUnique.mockResolvedValueOnce({ id: "tpl-1" });
    prisma.recurringJobTemplate.findUnique.mockResolvedValueOnce(fakeTemplate);
    prisma.recurringJobTemplate.delete.mockResolvedValueOnce(fakeTemplate);

    const { DELETE } = await import("@/app/api/admin/recurring-templates/[id]/route");
    const res = await DELETE(deleteRequest("tpl-1"), { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(200);

    expect(prisma.recurringJobTemplate.delete).toHaveBeenCalledTimes(1);
    const auditCalls = prisma.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(auditCalls).toContain("recurring_template.deleted");
  });

  it("DELETE rejects non-admin with 403", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const { DELETE } = await import("@/app/api/admin/recurring-templates/[id]/route");
    const res = await DELETE(deleteRequest("tpl-1"), { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(403);
  });
});
