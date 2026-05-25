import { describe, it, expect } from "vitest";
import {
  getActiveCountryCode,
  getCountryProfile,
} from "@/lib/compliance/country";

const il = getCountryProfile("IL");

// Three sentinel dates straddling the two thresholds.
//   - BEFORE_JAN_2026: before any threshold is active.
//   - BETWEEN: after Jan 1 2026 IST midnight, before Jun 1 2026 IST midnight.
//   - AFTER_JUN_2026: after both transitions.
const BEFORE_JAN_2026 = new Date("2025-12-15T00:00:00Z");
const AT_JAN_2026 = new Date("2025-12-31T22:00:00Z"); // exactly 2026-01-01 00:00 IL.
const JUST_BEFORE_JAN_2026 = new Date("2025-12-31T21:59:59Z");
const BETWEEN = new Date("2026-03-15T12:00:00Z");
const AT_JUN_2026 = new Date("2026-05-31T21:00:00Z"); // exactly 2026-06-01 00:00 IL.
const JUST_BEFORE_JUN_2026 = new Date("2026-05-31T20:59:59Z");
const AFTER_JUN_2026 = new Date("2026-09-01T12:00:00Z");

describe("IL country profile - shape", () => {
  it("exposes the V1 constants", () => {
    expect(il.code).toBe("IL");
    expect(il.defaultVatBasisPoints).toBe(1800);
    expect(il.defaultCurrency).toBe("ILS");
    expect(il.documentLanguageDefault).toBe("he");
    expect(il.numberingResetAnnually).toBe(false);
    expect(il.retentionYears).toBe(7);
  });

  it("declares the allocation-eligible document types", () => {
    expect(il.allocationAppliesTo).toEqual([
      "tax_invoice",
      "tax_invoice_receipt",
    ]);
  });
});

describe("IL country profile - getAllocationThreshold (applicable types)", () => {
  for (const type of ["tax_invoice", "tax_invoice_receipt"] as const) {
    it(`returns null for ${type} before any schedule entry`, () => {
      expect(il.getAllocationThreshold(BEFORE_JAN_2026, type)).toBeNull();
      expect(il.getAllocationThreshold(JUST_BEFORE_JAN_2026, type)).toBeNull();
    });

    it(`returns 10_000_00 minor units for ${type} at 2026-01-01 IL midnight`, () => {
      expect(il.getAllocationThreshold(AT_JAN_2026, type)).toBe(10_000_00);
    });

    it(`returns 10_000_00 for ${type} between the two transitions`, () => {
      expect(il.getAllocationThreshold(BETWEEN, type)).toBe(10_000_00);
    });

    it(`returns 10_000_00 for ${type} just before 2026-06-01 IL midnight`, () => {
      expect(il.getAllocationThreshold(JUST_BEFORE_JUN_2026, type)).toBe(
        10_000_00,
      );
    });

    it(`returns 5_000_00 for ${type} at 2026-06-01 IL midnight`, () => {
      expect(il.getAllocationThreshold(AT_JUN_2026, type)).toBe(5_000_00);
    });

    it(`returns 5_000_00 for ${type} after 2026-06-01`, () => {
      expect(il.getAllocationThreshold(AFTER_JUN_2026, type)).toBe(5_000_00);
    });
  }
});

describe("IL country profile - getAllocationThreshold (non-applicable types)", () => {
  for (const type of [
    "proforma_invoice",
    "receipt",
    "invoice",
    "credit_note",
  ] as const) {
    it(`returns null for ${type} regardless of date`, () => {
      expect(il.getAllocationThreshold(BEFORE_JAN_2026, type)).toBeNull();
      expect(il.getAllocationThreshold(AT_JAN_2026, type)).toBeNull();
      expect(il.getAllocationThreshold(BETWEEN, type)).toBeNull();
      expect(il.getAllocationThreshold(AT_JUN_2026, type)).toBeNull();
      expect(il.getAllocationThreshold(AFTER_JUN_2026, type)).toBeNull();
    });
  }
});

describe("getCountryProfile - guardrails", () => {
  it("throws on the _OTHER placeholder (TS name: OTHER)", () => {
    expect(() => getCountryProfile("OTHER")).toThrow(
      /not yet supported/i,
    );
  });
});

describe("getActiveCountryCode", () => {
  it("returns IL for the IL enum value", () => {
    expect(getActiveCountryCode("IL")).toBe("IL");
  });

  it("falls back to IL when CompanySettings.country is null/undefined", () => {
    expect(getActiveCountryCode(null)).toBe("IL");
    expect(getActiveCountryCode(undefined)).toBe("IL");
  });

  it("falls back to IL for an unsupported enum value", () => {
    expect(getActiveCountryCode("OTHER")).toBe("IL");
  });
});
