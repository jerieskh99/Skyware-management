import { describe, it, expect } from "vitest";
import { triggerDateFor, daysOverdue } from "@/lib/billing/reminders";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("triggerDateFor", () => {
  it("adds N days to the due date", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    const t = triggerDateFor({
      dueDate: due,
      latenessAmount: 7,
      latenessUnit: "days",
    });
    expect(t).not.toBeNull();
    expect(t!.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("adds N weeks to the due date", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    const t = triggerDateFor({
      dueDate: due,
      latenessAmount: 2,
      latenessUnit: "weeks",
    });
    expect(t).not.toBeNull();
    // 2 weeks = 14 days.
    expect(t!.getTime()).toBe(due.getTime() + 14 * DAY_MS);
    expect(t!.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("1 week equals 7 days exactly", () => {
    const due = new Date("2026-03-10T00:00:00.000Z");
    const week = triggerDateFor({ dueDate: due, latenessAmount: 1, latenessUnit: "weeks" });
    const sevenDays = triggerDateFor({ dueDate: due, latenessAmount: 7, latenessUnit: "days" });
    expect(week!.getTime()).toBe(sevenDays!.getTime());
  });

  it("returns null when dueDate is missing", () => {
    expect(
      triggerDateFor({ dueDate: null, latenessAmount: 7, latenessUnit: "days" }),
    ).toBeNull();
  });

  it("returns null when latenessAmount is missing", () => {
    expect(
      triggerDateFor({
        dueDate: new Date("2026-01-01"),
        latenessAmount: null,
        latenessUnit: "days",
      }),
    ).toBeNull();
  });

  it("returns null when latenessUnit is missing", () => {
    expect(
      triggerDateFor({
        dueDate: new Date("2026-01-01"),
        latenessAmount: 7,
        latenessUnit: null,
      }),
    ).toBeNull();
  });

  it("crosses a month boundary correctly with days", () => {
    const due = new Date("2026-01-28T00:00:00.000Z");
    const t = triggerDateFor({ dueDate: due, latenessAmount: 5, latenessUnit: "days" });
    expect(t!.toISOString()).toBe("2026-02-02T00:00:00.000Z");
  });
});

describe("daysOverdue", () => {
  it("returns 0 when not yet due", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const due = new Date("2026-01-10T00:00:00.000Z");
    expect(daysOverdue({ dueDate: due }, now)).toBe(0);
  });

  it("returns 0 exactly on the due date", () => {
    const d = new Date("2026-01-10T00:00:00.000Z");
    expect(daysOverdue({ dueDate: d }, d)).toBe(0);
  });

  it("floors partial days", () => {
    const due = new Date("2026-01-10T00:00:00.000Z");
    const now = new Date("2026-01-11T12:00:00.000Z"); // 1.5 days later
    expect(daysOverdue({ dueDate: due }, now)).toBe(1);
  });

  it("counts whole overdue days", () => {
    const due = new Date("2026-01-10T00:00:00.000Z");
    const now = new Date("2026-01-20T00:00:00.000Z");
    expect(daysOverdue({ dueDate: due }, now)).toBe(10);
  });

  it("returns 0 when dueDate is null", () => {
    expect(daysOverdue({ dueDate: null }, new Date())).toBe(0);
  });
});
