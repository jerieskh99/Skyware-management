import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/hub/[scope]/take/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

const JOB_ID = "00000000-0000-0000-0000-000000000abc";
const URL = "http://localhost/api/hub/helpdesk/take";

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ scope: "helpdesk" }) };
}

describe("POST /api/hub/[scope]/take", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
  });

  it("returns 409 when the job is no longer available (race condition)", async () => {
    // updateMany returns count=0 — the conditional update did not match.
    prisma.job.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams());

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/no longer available/i);

    // Side-effects must not have been written when the conditional update misses.
    expect(prisma.jobStatusEvent.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 and writes the audit row when the job is available", async () => {
    prisma.job.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.jobStatusEvent.create.mockResolvedValueOnce({ id: "evt-1" });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });
    prisma.job.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: "taken",
      assignedEmployeeId: "emp-helpdesk-1",
    });

    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe(JOB_ID);
    expect(body.status).toBe("taken");

    expect(prisma.job.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.jobStatusEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("job.taken_from_hub");
    expect(auditCall.data.entityType).toBe("Job");
    expect(auditCall.data.entityId).toBe(JOB_ID);
  });
});
