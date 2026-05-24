import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSlaDefaults, FALLBACK_PRIORITY_SLA_MINUTES } from "@/lib/sla";
import { prisma, resetPrisma } from "../helpers/prisma";

describe("getSlaDefaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns the hardcoded fallback when the table is empty", async () => {
    prisma.slaDefaults.findMany.mockResolvedValueOnce([]);
    const out = await getSlaDefaults();
    expect(out).toEqual(FALLBACK_PRIORITY_SLA_MINUTES);
  });

  it("overlays DB rows on top of the fallback", async () => {
    prisma.slaDefaults.findMany.mockResolvedValueOnce([
      { priority: "urgent", targetMinutes: 30 },
      { priority: "normal", targetMinutes: 600 },
    ]);
    const out = await getSlaDefaults();
    expect(out.urgent).toBe(30);
    expect(out.normal).toBe(600);
    // Other priorities still use the fallback values.
    expect(out.high).toBe(FALLBACK_PRIORITY_SLA_MINUTES.high);
    expect(out.low).toBe(FALLBACK_PRIORITY_SLA_MINUTES.low);
  });

  it("returns a fresh object each call (no shared mutable reference)", async () => {
    prisma.slaDefaults.findMany.mockResolvedValue([]);
    const a = await getSlaDefaults();
    const b = await getSlaDefaults();
    expect(a).not.toBe(b);
    a.urgent = 9999;
    expect(b.urgent).not.toBe(9999);
  });
});
