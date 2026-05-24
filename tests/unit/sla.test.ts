import { describe, it, expect } from "vitest";
import {
  deriveSlaTargetMinutes,
  computeSlaState,
  elapsedMinutes,
} from "@/lib/sla";

describe("deriveSlaTargetMinutes", () => {
  it("urgent + critical gives minimum of both (240)", () => {
    expect(deriveSlaTargetMinutes("urgent", "critical")).toBe(240);
  });

  it("normal + moderate gives 4320 (72h)", () => {
    expect(deriveSlaTargetMinutes("normal", "moderate")).toBe(4320);
  });

  it("critical severity overrides low priority (returns 240 not 10080)", () => {
    expect(deriveSlaTargetMinutes("low", "critical")).toBe(240);
  });

  it("high priority but minor severity returns 1440 (24h)", () => {
    expect(deriveSlaTargetMinutes("high", "minor")).toBe(1440);
  });

  it("respects custom priority overrides", () => {
    const result = deriveSlaTargetMinutes("urgent", "minor", {
      priority: { urgent: 60 },
    });
    expect(result).toBe(60);
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
    const past = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    expect(elapsedMinutes(past)).toBeGreaterThanOrEqual(9);
  });
});
