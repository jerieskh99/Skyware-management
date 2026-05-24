import { describe, it, expect } from "vitest";
import { isoWeekRange } from "@/lib/client-health/compute";

describe("isoWeekRange — Asia/Jerusalem", () => {
  it("returns Monday 00:00 local for a Wednesday mid-day", () => {
    // Wed 2026-05-20 12:00 UTC. In Asia/Jerusalem (UTC+3 in May), this is
    // 15:00 local Wednesday. Monday of that week is 2026-05-18 00:00 local.
    const now = new Date("2026-05-20T12:00:00Z");
    const { periodStart, periodEnd } = isoWeekRange(now, "Asia/Jerusalem");
    // 2026-05-18 00:00 Asia/Jerusalem = 2026-05-17 21:00 UTC (UTC+3).
    expect(periodStart.toISOString()).toBe("2026-05-17T21:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-05-24T21:00:00.000Z");
  });

  it("returns the same week when called on Monday 00:30 local", () => {
    // Mon 2026-05-18 00:30 Asia/Jerusalem = Sun 2026-05-17 21:30 UTC (UTC+3).
    const now = new Date("2026-05-17T21:30:00Z");
    const { periodStart } = isoWeekRange(now, "Asia/Jerusalem");
    // Should be Monday 2026-05-18 00:00 local, i.e. 2026-05-17 21:00 UTC.
    expect(periodStart.toISOString()).toBe("2026-05-17T21:00:00.000Z");
  });

  it("snaps Sunday 23:59 local to the START of the calendar week (previous Monday)", () => {
    // Sun 2026-05-17 23:59 Asia/Jerusalem = Sun 2026-05-17 20:59 UTC (UTC+3).
    // Sunday is day 6 in our (Mon=0) reckoning, so Monday is 6 days back:
    // 2026-05-11.
    const now = new Date("2026-05-17T20:59:00Z");
    const { periodStart } = isoWeekRange(now, "Asia/Jerusalem");
    // 2026-05-11 00:00 Asia/Jerusalem = 2026-05-10 21:00 UTC.
    expect(periodStart.toISOString()).toBe("2026-05-10T21:00:00.000Z");
  });

  it("handles month rollover (first Monday of a month)", () => {
    // Tue 2026-06-02 09:00 Asia/Jerusalem = 2026-06-02 06:00 UTC.
    // Monday of that week is 2026-06-01.
    const now = new Date("2026-06-02T06:00:00Z");
    const { periodStart, periodEnd } = isoWeekRange(now, "Asia/Jerusalem");
    expect(periodStart.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-06-07T21:00:00.000Z");
  });

  it("periodEnd is exactly 7 * 86400000 ms after periodStart", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const { periodStart, periodEnd } = isoWeekRange(now, "Asia/Jerusalem");
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(7 * 86_400_000);
  });

  it("defaults to Asia/Jerusalem when no timezone argument is given", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const a = isoWeekRange(now);
    const b = isoWeekRange(now, "Asia/Jerusalem");
    expect(a.periodStart.toISOString()).toBe(b.periodStart.toISOString());
  });
});
