import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sinceDate } from "@/lib/statistics/queries";

describe("sinceDate — window helper used by getSelfStats / getOverviewKpis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor at a known wall-clock moment so we get deterministic results
    // regardless of where the test machine runs.
    vi.setSystemTime(new Date("2026-05-24T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when days is undefined (all-time window)", () => {
    expect(sinceDate(undefined)).toBeUndefined();
  });

  it("returns undefined when days is 0 (falsy → no window)", () => {
    expect(sinceDate(0)).toBeUndefined();
  });

  it("returns a Date floored to midnight, days back from now", () => {
    const d = sinceDate(7);
    expect(d).toBeInstanceOf(Date);
    // 7 days back from May 24 = May 17. Floored to midnight (local TZ).
    expect(d?.getDate()).toBe(17);
    expect(d?.getHours()).toBe(0);
    expect(d?.getMinutes()).toBe(0);
    expect(d?.getSeconds()).toBe(0);
    expect(d?.getMilliseconds()).toBe(0);
  });

  it("respects different windows", () => {
    const w30 = sinceDate(30);
    const w90 = sinceDate(90);
    expect(w30).toBeDefined();
    expect(w90).toBeDefined();
    expect(w90!.getTime()).toBeLessThan(w30!.getTime());
  });
});
