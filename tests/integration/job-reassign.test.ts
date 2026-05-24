import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/jobs/[id]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

const JOB_ID = "00000000-0000-0000-0000-000000000job";
const OLD_ASSIGNEE_ID = "11111111-1111-1111-1111-111111111111";
const NEW_ASSIGNEE_ID = "22222222-2222-2222-2222-222222222222";
const URL = `http://localhost/api/jobs/${JOB_ID}`;

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: JOB_ID }) };
}

function jobFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB_ID,
    publicNumber: "JOB-001",
    title: "Server down",
    status: "assigned",
    priority: "high",
    severity: "major",
    assignedEmployeeId: OLD_ASSIGNEE_ID,
    department: { id: "dept-1", key: "helpdesk" },
    client: { id: "client-1", companyName: "Acme" },
    assignedEmployee: {
      id: OLD_ASSIGNEE_ID,
      username: "old.user",
      displayName: "Old User",
    },
    createdBy: { id: "admin-1", username: "admin.ceo", displayName: "CEO" },
    tags: [],
    statusEvents: [],
    workReport: null,
    timeSessions: [],
    relatedPosts: [],
    linkedPayment: null,
    _count: { statusEvents: 0 },
    ...overrides,
  };
}

describe("PATCH /api/jobs/[id] (reassign)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 for an employee (non-admin)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));

    const res = await PATCH(
      makeRequest({ assignedEmployeeId: NEW_ASSIGNEE_ID }),
      makeParams()
    );

    expect(res.status).toBe(403);
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("admin reassign updates the job, writes audit, and notifies the new assignee when the flag is on", async () => {
    mockAuthAs(makeAdminSession());

    // getJobForUser → findUnique
    prisma.job.findUnique.mockResolvedValueOnce(jobFixture());

    // Inside the transaction: update + audit + notify
    prisma.job.update.mockResolvedValueOnce({
      id: JOB_ID,
      publicNumber: "JOB-001",
      title: "Server down",
      assignedEmployeeId: NEW_ASSIGNEE_ID,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    // Notification trigger reads the feature flag — ON.
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });
    prisma.notification.create.mockResolvedValueOnce({ id: "notif-1" });

    const res = await PATCH(
      makeRequest({ assignedEmployeeId: NEW_ASSIGNEE_ID }),
      makeParams()
    );

    expect(res.status).toBe(200);

    // Job updated with the new assignee + new assigned timestamp.
    expect(prisma.job.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.job.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { assignedEmployeeId: string; assignedTimestamp: Date };
    };
    expect(updateCall.where.id).toBe(JOB_ID);
    expect(updateCall.data.assignedEmployeeId).toBe(NEW_ASSIGNEE_ID);
    expect(updateCall.data.assignedTimestamp).toBeInstanceOf(Date);

    // Audit row written.
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; entityId: string };
    };
    expect(auditCall.data.action).toBe("job.updated");
    expect(auditCall.data.entityType).toBe("Job");
    expect(auditCall.data.entityId).toBe(JOB_ID);

    // Notification written to the new assignee.
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    const notifCall = prisma.notification.create.mock.calls[0]?.[0] as {
      data: { userId: string; kind: string; link: string };
    };
    expect(notifCall.data.userId).toBe(NEW_ASSIGNEE_ID);
    expect(notifCall.data.kind).toBe("job_assigned");
    expect(notifCall.data.link).toBe(`/my-jobs/${JOB_ID}`);
  });

  it("does not notify when the new assignee is the same as the previous one", async () => {
    mockAuthAs(makeAdminSession());

    prisma.job.findUnique.mockResolvedValueOnce(jobFixture());
    prisma.job.update.mockResolvedValueOnce({
      id: JOB_ID,
      publicNumber: "JOB-001",
      title: "Server down",
      assignedEmployeeId: OLD_ASSIGNEE_ID,
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-2" });
    prisma.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });

    const res = await PATCH(
      makeRequest({ assignedEmployeeId: OLD_ASSIGNEE_ID }),
      makeParams()
    );

    expect(res.status).toBe(200);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
