import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyILS,
  formatDateIL,
  formatDateTimeIL,
  getYearIL,
} from "@/lib/format";

describe("formatCurrencyILS", () => {
  it("formats 0 agorot as 0.00 in he-IL", () => {
    const out = formatCurrencyILS(0, "he");
    // Currency symbol placement varies by ICU; assert key fragments.
    expect(out).toContain("0.00");
    expect(out).toMatch(/₪|ILS|ש/);
  });

  it("formats 1234567 agorot (12,345.67 ILS)", () => {
    const out = formatCurrencyILS(1_234_567, "en");
    expect(out).toContain("12,345.67");
  });

  it("formats negative minor units with a minus sign", () => {
    const out = formatCurrencyILS(-50_00, "en");
    expect(out).toContain("50.00");
    // Both "-" and "(" (accounting) are acceptable negative markers across ICU.
    expect(out).toMatch(/-|\(/);
  });
});

describe("formatCurrency (arbitrary code)", () => {
  it("formats 100_00 USD in en-IL", () => {
    const out = formatCurrency(100_00, "USD", "en");
    expect(out).toContain("100.00");
    expect(out).toMatch(/\$|USD/);
  });
});

describe("formatDateIL", () => {
  it("renders Asia/Jerusalem date for a UTC midnight input", () => {
    // 2026-01-01 00:00 UTC = 2026-01-01 02:00 Asia/Jerusalem (IST, UTC+02:00).
    const d = new Date("2026-01-01T00:00:00Z");
    expect(formatDateIL(d, "he")).toBe("01/01/2026");
  });

  it("renders English locale with month abbreviation", () => {
    const d = new Date("2026-03-15T10:00:00Z");
    expect(formatDateIL(d, "en")).toBe("15 Mar 2026");
  });
});

describe("formatDateTimeIL", () => {
  it("renders Asia/Jerusalem date+time", () => {
    // 2026-01-01 08:30 UTC = 2026-01-01 10:30 IST.
    const d = new Date("2026-01-01T08:30:00Z");
    expect(formatDateTimeIL(d, "he")).toBe("01/01/2026 10:30");
  });
});

describe("getYearIL - year-boundary correctness", () => {
  it("returns 2026 for a mid-year UTC date", () => {
    expect(getYearIL(new Date("2026-06-15T12:00:00Z"))).toBe(2026);
  });

  it("returns 2027 for 2026-12-31 23:30 UTC because IL midnight has already passed", () => {
    // 2026-12-31 23:30 UTC = 2027-01-01 01:30 Asia/Jerusalem.
    // This is the exact bug the change in `reserveNumber` closes: a UTC-hosted
    // server finalizing a receipt here must record the row under 2027, not
    // 2026.
    expect(getYearIL(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });

  it("returns 2026 for 2026-01-01 00:00 UTC (still 2026 in IL, 02:00 IST)", () => {
    expect(getYearIL(new Date("2026-01-01T00:00:00Z"))).toBe(2026);
  });

  it("returns 2025 for 2025-12-31 21:00 UTC (23:00 IST still 2025)", () => {
    expect(getYearIL(new Date("2025-12-31T21:00:00Z"))).toBe(2025);
  });

  it("returns 2026 for 2025-12-31 22:30 UTC (00:30 IST already 2026)", () => {
    expect(getYearIL(new Date("2025-12-31T22:30:00Z"))).toBe(2026);
  });
});
