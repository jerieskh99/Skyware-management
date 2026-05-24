import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { getSelfStats } from "@/lib/statistics/queries";

const CALLER_ID = "emp-helpdesk-1";
const OTHER_ID = "emp-helpdesk-2";

describe("getSelfStats — scope is restricted to the caller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("passes the caller's userId on every job-scoped query and never queries jobs for other users", async () => {
    // All counts / aggregates resolve harmlessly; we assert on call args.
    prisma.job.count.mockResolvedValue(0);
    prisma.jobStatusEvent.count.mockResolvedValue(0);
    prisma.job.aggregate.mockResolvedValue({ _sum: { timeSpentMinutes: 0 } });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.job.findMany.mockResolvedValue([]);
    prisma.client.findMany.mockResolvedValue([]);

    await getSelfStats(CALLER_ID, 30);

    // Active count call.
    const activeCall = prisma.job.count.mock.calls[0]?.[0] as {
      where: { assignedEmployeeId: string };
    };
    expect(activeCall.where.assignedEmployeeId).toBe(CALLER_ID);

    // Completed-in-window call.
    const completedCall = prisma.job.count.mock.calls[1]?.[0] as {
      where: { assignedEmployeeId: string };
    };
    expect(completedCall.where.assignedEmployeeId).toBe(CALLER_ID);

    // Reopened events call must filter via job → assignedEmployeeId.
    const reopenCall = prisma.jobStatusEvent.count.mock.calls[0]?.[0] as {
      where: { job: { assignedEmployeeId: string } };
    };
    expect(reopenCall.where.job.assignedEmployeeId).toBe(CALLER_ID);

    // Hours aggregate.
    const hoursCall = prisma.job.aggregate.mock.calls[0]?.[0] as {
      where: { assignedEmployeeId: string };
    };
    expect(hoursCall.where.assignedEmployeeId).toBe(CALLER_ID);

    // currentlyWorking findMany.
    const wkCall = prisma.job.findMany.mock.calls[0]?.[0] as {
      where: { assignedEmployeeId: string };
    };
    expect(wkCall.where.assignedEmployeeId).toBe(CALLER_ID);

    // Every job.count / aggregate / findMany call must scope to CALLER_ID.
    for (const call of prisma.job.count.mock.calls) {
      const arg = call[0] as { where: { assignedEmployeeId?: string } };
      expect(arg.where.assignedEmployeeId).toBe(CALLER_ID);
      expect(arg.where.assignedEmployeeId).not.toBe(OTHER_ID);
    }
    for (const call of prisma.job.aggregate.mock.calls) {
      const arg = call[0] as { where: { assignedEmployeeId?: string } };
      expect(arg.where.assignedEmployeeId).toBe(CALLER_ID);
    }
    for (const call of prisma.job.findMany.mock.calls) {
      const arg = call[0] as { where: { assignedEmployeeId?: string } };
      expect(arg.where.assignedEmployeeId).toBe(CALLER_ID);
    }
  });

  it("does not return rows for other users even if Prisma returns mixed data", async () => {
    prisma.job.count.mockResolvedValue(1);
    prisma.jobStatusEvent.count.mockResolvedValue(0);
    prisma.job.aggregate.mockResolvedValue({ _sum: { timeSpentMinutes: 120 } });

    // PERCENTILE_CONT raw-SQL result and delayed-raw result.
    prisma.$queryRaw
      .mockResolvedValueOnce([{ n: BigInt(5), avg_h: 2.5, median_h: 2.0, p90_h: 5.0 }])
      .mockResolvedValueOnce([]);

    // currentlyWorking — must return only what Prisma gives us; the scope filter
    // already lives on the WHERE clause, so the mock represents the post-filter
    // page. We pass a single legitimate row.
    prisma.job.findMany.mockResolvedValue([
      {
        id: "job-mine",
        publicNumber: "J-1001",
        title: "My open ticket",
        priority: "high",
        severity: "moderate",
        status: "working_on_it",
        slaTargetMinutes: 240,
        assignedTimestamp: new Date(),
        client: { companyName: "Acme" },
      },
    ]);
    prisma.client.findMany.mockResolvedValue([]);

    const result = await getSelfStats(CALLER_ID, 30);

    expect(result.activeCount).toBe(1);
    expect(result.completedInWindow).toBe(1);
    expect(result.hoursReportedInWindow).toBe(2);
    expect(result.completionSampleSize).toBe(5);
    expect(result.medianCompletionHours).toBe(2.0);
    expect(result.p90CompletionHours).toBe(5.0);

    // currentlyWorking carries the single row through unchanged.
    expect(result.currentlyWorking).toHaveLength(1);
    expect(result.currentlyWorking[0]?.id).toBe("job-mine");

    // delayedMine should be empty (raw query returned []).
    expect(result.delayedMine).toEqual([]);
  });
});
