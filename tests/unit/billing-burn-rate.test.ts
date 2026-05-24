import { describe, it, expect } from "vitest";
import { computeBurnFor } from "@/lib/billing/queries";

function usageAt(year: number, month: number, minutes: number) {
  return { minutesUsed: minutes, usedAt: new Date(Date.UTC(year, month - 1, 15)) };
}

describe("computeBurnFor — empty / no usage", () => {
  it("no usage rows returns zeros and a null projection (with totalMinutes)", () => {
    const out = computeBurnFor({ totalHoursPurchasedMinutes: 1200 }, []);
    expect(out).toEqual({
      monthsObserved: 0,
      minutesUsedTotal: 0,
      avgMonthlyMinutes: 0,
      remainingMinutes: 1200,
      projectedMonthsRemaining: null,
    });
  });

  it("no usage and null totalMinutes returns zeros and null projection", () => {
    const out = computeBurnFor({ totalHoursPurchasedMinutes: null }, []);
    expect(out.remainingMinutes).toBe(0);
    expect(out.projectedMonthsRemaining).toBeNull();
  });
});

describe("computeBurnFor — avg = 0 edge", () => {
  it("avgMonthlyMinutes is 0 only when monthsObserved is 0", () => {
    // monthsObserved > 0 implies at least one usage row contributes minutes.
    const out = computeBurnFor({ totalHoursPurchasedMinutes: 600 }, [
      usageAt(2026, 4, 0),
    ]);
    // Single row, zero minutes — monthsObserved = 1, total = 0, avg = 0.
    expect(out.monthsObserved).toBe(1);
    expect(out.minutesUsedTotal).toBe(0);
    expect(out.avgMonthlyMinutes).toBe(0);
    // Projection must be null when avg is 0 to avoid division by zero.
    expect(out.projectedMonthsRemaining).toBeNull();
  });
});

describe("computeBurnFor — 3 months observed", () => {
  it("computes average and projection across distinct months", () => {
    const out = computeBurnFor({ totalHoursPurchasedMinutes: 1200 }, [
      usageAt(2026, 1, 100), // Jan
      usageAt(2026, 2, 200), // Feb
      usageAt(2026, 2, 100), // Feb (same month)
      usageAt(2026, 3, 300), // Mar
    ]);
    // 3 distinct months, total = 700, avg = 700/3 ≈ 233.33
    expect(out.monthsObserved).toBe(3);
    expect(out.minutesUsedTotal).toBe(700);
    expect(out.avgMonthlyMinutes).toBeCloseTo(233.33, 1);
    expect(out.remainingMinutes).toBe(500); // 1200 - 700
    // projectedMonthsRemaining = 500 / 233.33 ≈ 2.14
    expect(out.projectedMonthsRemaining).not.toBeNull();
    expect(out.projectedMonthsRemaining!).toBeCloseTo(2.14, 1);
  });

  it("clamps remainingMinutes at 0 when used exceeds purchased", () => {
    const out = computeBurnFor({ totalHoursPurchasedMinutes: 100 }, [
      usageAt(2026, 1, 50),
      usageAt(2026, 2, 100), // 150 > 100
    ]);
    expect(out.minutesUsedTotal).toBe(150);
    expect(out.remainingMinutes).toBe(0);
    // remaining 0 / avg 75 = 0 projected months
    expect(out.projectedMonthsRemaining).toBe(0);
  });

  it("treats null totalHoursPurchasedMinutes as 0 for remaining math", () => {
    const out = computeBurnFor({ totalHoursPurchasedMinutes: null }, [
      usageAt(2026, 1, 60),
    ]);
    expect(out.remainingMinutes).toBe(0);
    // avg > 0 but remaining is 0, so projection is 0.
    expect(out.projectedMonthsRemaining).toBe(0);
  });
});
