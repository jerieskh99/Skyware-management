import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { getAdminDashboardLists } from "@/lib/dashboard/queries";

interface JobRow {
  id: string;
  publicNumber: string;
  title: string;
  priority: string;
  severity: string;
  slaTargetMinutes: number;
  assignedTimestamp: Date | null;
  client: { companyName: string } | null;
  assignedEmployee: { displayName: string } | null;
}

describe("lists.delayed — surfaces low-priority SLA breaches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("includes a low-priority breach that the old priority-then-filter shape would have missed", async () => {
    // The new query asks SQL for the breached set directly, ordered by how
    // long ago they breached. Five rows come back, including a 'low' priority
    // job that the old top-50-by-priority shape would never have ranked.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);

    prisma.job.findMany
      // 1st: reviewsPending (status = done)
      .mockResolvedValueOnce([])
      // 2nd: waitingForAdmin
      .mockResolvedValueOnce([])
      // 3rd: delayed rows hydrated from id list
      .mockResolvedValueOnce([
        rowFor("job-low",     "low",     fiveMinAgo),
        rowFor("job-urgent",  "urgent",  fiveMinAgo),
        rowFor("job-normal",  "normal",  fiveMinAgo),
        rowFor("job-high",    "high",    fiveMinAgo),
        rowFor("job-low-2",   "low",     fiveMinAgo),
      ]);

    // $queryRaw returns the ordered id list (oldest breach first). Order is
    // what the production query uses; we preserve it through the hydration.
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: "job-low" },
      { id: "job-urgent" },
      { id: "job-normal" },
      { id: "job-high" },
      { id: "job-low-2" },
    ]);

    const { delayed } = await getAdminDashboardLists();

    // The two 'low' priority breaches must be present — the bug we are fixing
    // is exactly that they used to be filtered out by the priority-first cap.
    expect(delayed.map((r) => r.id)).toContain("job-low");
    expect(delayed.map((r) => r.id)).toContain("job-low-2");

    // Five breached rows expected — the SQL LIMIT 5 returns all of them.
    expect(delayed).toHaveLength(5);

    // Order preserved from the SQL (oldest breach first).
    expect(delayed.map((r) => r.id)).toEqual([
      "job-low",
      "job-urgent",
      "job-normal",
      "job-high",
      "job-low-2",
    ]);

    // The SQL-side filter does the breach test, not JS — assert we did NOT
    // fetch a fixed top-N-by-priority slice as the old query did.
    // The 3rd findMany call should filter by id list, not order by priority.
    const delayedCall = prisma.job.findMany.mock.calls[2]?.[0] as {
      where: { id: { in: string[] } };
      orderBy?: unknown;
    };
    expect(delayedCall.where.id.in).toEqual([
      "job-low",
      "job-urgent",
      "job-normal",
      "job-high",
      "job-low-2",
    ]);
    expect(delayedCall.orderBy).toBeUndefined();
  });

  it("returns an empty delayed list when no jobs are past SLA", async () => {
    prisma.job.findMany
      .mockResolvedValueOnce([]) // reviewsPending
      .mockResolvedValueOnce([]); // waitingForAdmin
    prisma.$queryRaw.mockResolvedValueOnce([]); // no breaches

    const { delayed } = await getAdminDashboardLists();
    expect(delayed).toEqual([]);

    // We should NOT have made a hydration findMany when the id list is empty.
    expect(prisma.job.findMany).toHaveBeenCalledTimes(2);
  });
});

function rowFor(id: string, priority: string, assignedTimestamp: Date): JobRow {
  return {
    id,
    publicNumber: `J-${id}`,
    title: `Job ${id}`,
    priority,
    severity: "moderate",
    slaTargetMinutes: 60,
    assignedTimestamp,
    client: { companyName: "Acme" },
    assignedEmployee: { displayName: "Alice" },
  };
}
