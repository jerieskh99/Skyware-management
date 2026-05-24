import { describe, it, expect } from "vitest";
import {
  deriveSlaTargetMinutes,
  computeSlaState,
  elapsedMinutes,
  FALLBACK_PRIORITY_SLA_MINUTES,
} from "@/lib/sla";

const D = FALLBACK_PRIORITY_SLA_MINUTES;

describe("deriveSlaTargetMinutes", () => {
  it("urgent + critical gives min(priority,severity) = min(60, 240) = 60", () => {
    expect(deriveSlaTargetMinutes("urgent", "critical", D)).toBe(60);
  });

  it("normal + moderate gives min(240, 4320) = 240", () => {
    expect(deriveSlaTargetMinutes("normal", "moderate", D)).toBe(240);
  });

  it("critical severity caps even a relaxed low priority (low=480, critical=240)", () => {
    expect(deriveSlaTargetMinutes("low", "critical", D)).toBe(240);
  });

  it("high priority + minor severity returns priority (120 < 10080)", () => {
    expect(deriveSlaTargetMinutes("high", "minor", D)).toBe(120);
  });

  it("respects a caller-supplied defaults map", () => {
    const custom = { ...D, urgent: 30 };
    expect(deriveSlaTargetMinutes("urgent", "minor", custom)).toBe(30);
  });
});

describe("computeSlaState", () => {
  it("0 elapsed is green", () => {
    expect(computeSlaState(0, 240)).toBe("green");
  });

  it("49% elapsed is green", () => {
    expect(computeSlaState(117, 240)).toBe("green");
  });

  it("50% elapsed is amber", () => {
    expect(computeSlaState(120, 240)).toBe("amber");
  });

  it("75% elapsed is red", () => {
    expect(computeSlaState(180, 240)).toBe("red");
  });

  it("100% elapsed is breached", () => {
    expect(computeSlaState(240, 240)).toBe("breached");
  });

  it("over 100% is still breached", () => {
    expect(computeSlaState(300, 240)).toBe("breached");
  });

  it("zero target returns green (prevents division by zero)", () => {
    expect(computeSlaState(999, 0)).toBe("green");
  });
});

describe("elapsedMinutes", () => {
  it("null start returns 0", () => {
    expect(elapsedMinutes(null)).toBe(0);
  });

  it("a recent date returns > 0", () => {
    const past = new Date(Date.now() - 10 * 60 * 1000);
    expect(elapsedMinutes(past)).toBeGreaterThanOrEqual(9);
  });
});
