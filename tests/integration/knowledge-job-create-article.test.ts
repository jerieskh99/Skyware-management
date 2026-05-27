import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/jobs/[id]/create-knowledge-article/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

function makeReq(id: string, body?: unknown) {
  return new Request(`http://localhost/api/jobs/${id}/create-knowledge-article`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const JOB_ID = "00000000-0000-0000-0000-00000000abcd";

describe("POST /api/jobs/[id]/create-knowledge-article", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prisma.auditLog.create.mockResolvedValue({ id: "a-1" });
  });

  it("creates a pre-filled draft from a reviewed job", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }));

    prisma.job.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      publicNumber: "SKY-0001",
      title: "VPN client disconnected after office migration",
      status: "reviewed",
      assignedEmployeeId: "u-1",
      workReport: {
        id: "wr-1",
        summary: "Found stale route, flushed and reconfigured.",
      },
    });

    // generateUniqueSlugFromJob lookup
    prisma.knowledgeArticle.findUnique.mockResolvedValueOnce(null);

    prisma.knowledgeArticle.create.mockResolvedValueOnce({
      id: "art-1",
      slug: "lesson-sky-0001-abcde",
    });
    prisma.knowledgeArticleRevision.create.mockResolvedValueOnce({ id: "r-1" });

    const res = await POST(makeReq(JOB_ID), makeParams(JOB_ID));
    expect(res.status).toBe(201);

    const createCall = prisma.knowledgeArticle.create.mock.calls[0]?.[0] as {
      data: {
        kind: string;
        sourceJobId: string;
        sourceWorkReportId: string;
        body: string;
      };
    };
    expect(createCall.data.kind).toBe("internal_task_lesson");
    expect(createCall.data.sourceJobId).toBe(JOB_ID);
    expect(createCall.data.sourceWorkReportId).toBe("wr-1");
    expect(createCall.data.body).toContain("Found stale route");
    expect(createCall.data.body).toContain("Problem");
    expect(createCall.data.body).toContain("Verification");
  });

  it("returns 422 when the job is not 'done' or 'reviewed'", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));

    prisma.job.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      publicNumber: "SKY-0002",
      title: "In flight",
      status: "in_progress",
      assignedEmployeeId: "admin-1",
      workReport: null,
    });

    const res = await POST(makeReq(JOB_ID), makeParams(JOB_ID));
    expect(res.status).toBe(422);
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });

  it("forbids a different (non-admin, non-assignee) employee", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "u-2" }));

    prisma.job.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      publicNumber: "SKY-0003",
      title: "Other's job",
      status: "reviewed",
      assignedEmployeeId: "u-1", // not the caller
      workReport: { id: "wr-1", summary: "..." },
    });

    const res = await POST(makeReq(JOB_ID), makeParams(JOB_ID));
    expect(res.status).toBe(403);
    expect(prisma.knowledgeArticle.create).not.toHaveBeenCalled();
  });
});
