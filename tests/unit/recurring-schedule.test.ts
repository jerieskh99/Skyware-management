import { describe, it, expect } from "vitest";
import { computeNextRunAt } from "@/lib/recurring/schedule";

const TZ = "Asia/Jerusalem";

describe("computeNextRunAt", () => {
  it("daily — same day if anchor still in the future", () => {
    // 2026-05-24 03:00 UTC = 06:00 Asia/Jerusalem (IDT, UTC+3)
    const from = new Date("2026-05-24T03:00:00Z");
    const next = computeNextRunAt(from, "daily", { minuteOfDay: 9 * 60 }, TZ);
    // 09:00 Asia/Jerusalem on 2026-05-24 = 06:00 UTC.
    expect(next.toISOString()).toBe("2026-05-24T06:00:00.000Z");
  });

  it("daily — rolls to next day if anchor already passed today", () => {
    // 2026-05-24 12:00 UTC = 15:00 Asia/Jerusalem.
    const from = new Date("2026-05-24T12:00:00Z");
    const next = computeNextRunAt(from, "daily", { minuteOfDay: 9 * 60 }, TZ);
    expect(next.toISOString()).toBe("2026-05-25T06:00:00.000Z");
  });

  it("weekly — picks the next occurrence of the day-of-week", () => {
    // 2026-05-24 is a Sunday in Asia/Jerusalem (weekday 0).
    const from = new Date("2026-05-24T03:00:00Z");
    // Anchor Wednesday (3) at 10:00 IDT.
    const next = computeNextRunAt(from, "weekly", { dayOfWeek: 3, minuteOfDay: 10 * 60 }, TZ);
    // Wed 2026-05-27 10:00 IDT = 07:00 UTC.
    expect(next.toISOString()).toBe("2026-05-27T07:00:00.000Z");
  });

  it("weekly — rolls a full week when same weekday but anchor already passed", () => {
    // 2026-05-24 12:00 UTC = 15:00 Asia/Jerusalem Sunday.
    const from = new Date("2026-05-24T12:00:00Z");
    const next = computeNextRunAt(from, "weekly", { dayOfWeek: 0, minuteOfDay: 9 * 60 }, TZ);
    // Next Sunday 2026-05-31 09:00 IDT = 06:00 UTC.
    expect(next.toISOString()).toBe("2026-05-31T06:00:00.000Z");
  });

  it("biweekly — rolls two weeks when same weekday but anchor passed", () => {
    const from = new Date("2026-05-24T12:00:00Z");
    const next = computeNextRunAt(from, "biweekly", { dayOfWeek: 0, minuteOfDay: 9 * 60 }, TZ);
    // Two Sundays later: 2026-06-07 09:00 IDT = 06:00 UTC.
    expect(next.toISOString()).toBe("2026-06-07T06:00:00.000Z");
  });

  it("monthly — picks day-of-month inside the same month if still upcoming", () => {
    const from = new Date("2026-05-24T03:00:00Z");
    const next = computeNextRunAt(from, "monthly", { dayOfMonth: 27, minuteOfDay: 8 * 60 }, TZ);
    // 2026-05-27 08:00 IDT = 05:00 UTC.
    expect(next.toISOString()).toBe("2026-05-27T05:00:00.000Z");
  });

  it("monthly — rolls to next month when day-of-month already passed", () => {
    const from = new Date("2026-05-24T03:00:00Z");
    const next = computeNextRunAt(from, "monthly", { dayOfMonth: 5, minuteOfDay: 8 * 60 }, TZ);
    // 2026-06-05 08:00 IDT = 05:00 UTC.
    expect(next.toISOString()).toBe("2026-06-05T05:00:00.000Z");
  });

  it("quarterly — rolls +3 months when day already passed in current month", () => {
    const from = new Date("2026-05-24T03:00:00Z");
    const next = computeNextRunAt(from, "quarterly", { dayOfMonth: 5, minuteOfDay: 8 * 60 }, TZ);
    // From May, +3 = August 2026.
    expect(next.toISOString()).toBe("2026-08-05T05:00:00.000Z");
  });

  it("rejects an invalid minuteOfDay", () => {
    expect(() => computeNextRunAt(new Date(), "daily", { minuteOfDay: 9999 }, TZ)).toThrow();
  });

  it("rejects an invalid dayOfWeek", () => {
    expect(() =>
      computeNextRunAt(new Date(), "weekly", { dayOfWeek: 9, minuteOfDay: 60 }, TZ)
    ).toThrow();
  });

  it("rejects an invalid dayOfMonth", () => {
    expect(() =>
      computeNextRunAt(new Date(), "monthly", { dayOfMonth: 30, minuteOfDay: 60 }, TZ)
    ).toThrow();
  });
});
