import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/jobs/[id]/transitions/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

const JOB_ID = "00000000-0000-0000-0000-000000000job";
const URL = `http://localhost/api/jobs/${JOB_ID}/transitions`;

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: JOB_ID }) };
}

/** Shape that satisfies what `getJobForUser` + the transition handler read. */
function jobFixture(status: string) {
  return {
    id: JOB_ID,
    status,
    assignedEmployeeId: null,
    firstResponseAt: null,
    startedTimestamp: null,
    department: { id: "dept-1", key: "helpdesk" },
    client: { id: "client-1", companyName: "Acme" },
    assignedEmployee: null,
    createdBy: { id: "admin-1", username: "admin.ceo", displayName: "CEO" },
    tags: [],
    statusEvents: [],
    workReport: null,
    timeSessions: [],
    _count: { statusEvents: 0 },
  };
}

describe("POST /api/jobs/[id]/transitions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
  });

  it("returns 422 for an invalid transition (new -> done)", async () => {
    prisma.job.findUnique.mockResolvedValueOnce(jobFixture("new"));

    const res = await POST(makeRequest({ toStatus: "done" }), makeParams());

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not permitted/i);

    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(prisma.jobStatusEvent.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 for a valid transition (new -> assigned by admin)", async () => {
    prisma.job.findUnique.mockResolvedValueOnce(jobFixture("new"));
    prisma.job.update.mockResolvedValueOnce({
      id: JOB_ID,
      status: "assigned",
      assignedEmployeeId: "emp-helpdesk-1",
    });
    prisma.jobStatusEvent.create.mockResolvedValueOnce({ id: "evt-1" });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(
      makeRequest({
        toStatus: "assigned",
        assignedEmployeeId: "11111111-1111-1111-1111-111111111111",
      }),
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe(JOB_ID);
    expect(body.status).toBe("assigned");

    expect(prisma.job.update).toHaveBeenCalledTimes(1);
    expect(prisma.jobStatusEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("job.status_changed");
    expect(auditCall.data.entityType).toBe("Job");
    expect(auditCall.data.entityId).toBe(JOB_ID);
  });
});
