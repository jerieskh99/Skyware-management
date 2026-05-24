import { describe, it, expect } from "vitest";
import { bucketize, bucketRange } from "@/lib/billing/queries";

const NOW = new Date("2026-05-24T12:00:00Z");
const day = 86_400_000;

function dueDaysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * day);
}

describe("bucketize — age boundaries", () => {
  it("returns null when dueDate is null", () => {
    expect(bucketize(null, NOW)).toBeNull();
  });

  it("future due date lands in 0-30", () => {
    expect(bucketize(dueDaysAgo(-5), NOW)).toBe("0-30");
  });

  it("0 days past due is 0-30", () => {
    expect(bucketize(dueDaysAgo(0), NOW)).toBe("0-30");
  });

  it("29 days past due is 0-30", () => {
    expect(bucketize(dueDaysAgo(29), NOW)).toBe("0-30");
  });

  it("30 days past due is 0-30 (inclusive upper bound)", () => {
    expect(bucketize(dueDaysAgo(30), NOW)).toBe("0-30");
  });

  it("31 days past due is 31-60", () => {
    expect(bucketize(dueDaysAgo(31), NOW)).toBe("31-60");
  });

  it("60 days past due is 31-60", () => {
    expect(bucketize(dueDaysAgo(60), NOW)).toBe("31-60");
  });

  it("61 days past due is 61-90", () => {
    expect(bucketize(dueDaysAgo(61), NOW)).toBe("61-90");
  });

  it("89 days past due is 61-90", () => {
    expect(bucketize(dueDaysAgo(89), NOW)).toBe("61-90");
  });

  it("90 days past due is 61-90", () => {
    expect(bucketize(dueDaysAgo(90), NOW)).toBe("61-90");
  });

  it("91 days past due is 91+", () => {
    expect(bucketize(dueDaysAgo(91), NOW)).toBe("91+");
  });

  it("365 days past due is 91+", () => {
    expect(bucketize(dueDaysAgo(365), NOW)).toBe("91+");
  });
});

describe("bucketize — small list aggregation", () => {
  it("distributes a list of due dates into the right buckets", () => {
    const list: Array<{ id: string; dueDate: Date | null }> = [
      { id: "a", dueDate: dueDaysAgo(10) }, // 0-30
      { id: "b", dueDate: dueDaysAgo(30) }, // 0-30
      { id: "c", dueDate: dueDaysAgo(31) }, // 31-60
      { id: "d", dueDate: dueDaysAgo(60) }, // 31-60
      { id: "e", dueDate: dueDaysAgo(61) }, // 61-90
      { id: "f", dueDate: dueDaysAgo(90) }, // 61-90
      { id: "g", dueDate: dueDaysAgo(91) }, // 91+
      { id: "h", dueDate: dueDaysAgo(200) }, // 91+
      { id: "i", dueDate: null }, // dropped
    ];

    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "91+": 0 };
    for (const row of list) {
      const b = bucketize(row.dueDate, NOW);
      if (b) buckets[b]++;
    }

    expect(buckets).toEqual({ "0-30": 2, "31-60": 2, "61-90": 2, "91+": 2 });
  });
});

describe("bucketRange — round-trip with bucketize", () => {
  it("0-30 range matches bucketize result", () => {
    const r = bucketRange("0-30", NOW);
    expect(r.lte).toBeNull();
    // Anything from r.gte through NOW (and future) hits 0-30.
    expect(bucketize(r.gte, NOW)).toBe("0-30");
  });

  it("31-60 range start (60 days ago) is the same as bucketize boundary", () => {
    const r = bucketRange("31-60", NOW);
    expect(r.lte).not.toBeNull();
    expect(bucketize(r.gte, NOW)).toBe("31-60");
    expect(bucketize(r.lte!, NOW)).toBe("31-60");
  });

  it("91+ range goes back to epoch", () => {
    const r = bucketRange("91+", NOW);
    expect(r.gte.getTime()).toBe(0);
    expect(bucketize(r.lte!, NOW)).toBe("91+");
  });
});
