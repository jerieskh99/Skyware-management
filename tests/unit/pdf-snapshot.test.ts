import { describe, it, expect } from "vitest";
import type { CompanySettings } from "@prisma/client";
import { composeSnapshot } from "@/lib/pdf/snapshot";

/**
 * Build a complete CompanySettings stub with placeholder Israeli values. The
 * snapshot composer must read every CompanySettings field that participates
 * in the rendered header; this helper keeps the shape in one place.
 */
function makeSettings(overrides: Partial<CompanySettings> = {}): CompanySettings {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    legalNameEn: "TEST Skyware IT LTD",
    legalNameHe: "TEST סקייוור איי טי בע\"מ",
    companyNumber: "TEST-000000000",
    vatNumber: "TEST-000000000",
    timezone: "Asia/Jerusalem",
    defaultVatBasisPoints: 1800,
    defaultCurrency: "ILS",
    email: "billing@example.com",
    phone: "+972-3-1234567",
    addressLine1: "1 Test Street",
    addressLine2: null,
    city: "Tel Aviv",
    postalCode: "6100000",
    country: "IL",
    websiteUrl: "https://example.com",
    receiptFooterEn: "Thank you for your business.",
    receiptFooterHe: "תודה על עסקך.",
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("composeSnapshot - shape and serialization", () => {
  it("returns a JSON-serializable shape with capturedAt and company.*", () => {
    const settings = makeSettings();
    const snap = composeSnapshot(settings);

    // Must round-trip through JSON without loss (`Json` column on Postgres).
    const round = JSON.parse(JSON.stringify(snap)) as typeof snap;
    expect(round.capturedAt).toBe(snap.capturedAt);
    expect(round.company.legalNameEn).toBe("TEST Skyware IT LTD");
    expect(round.company.vatNumber).toBe("TEST-000000000");
    expect(typeof snap.capturedAt).toBe("string");
    expect(new Date(snap.capturedAt).toString()).not.toBe("Invalid Date");

    // Every expected company field is present (no silent drift if the
    // CompanySettings model gains a field that the snapshot forgot).
    expect(Object.keys(round.company).sort()).toEqual(
      [
        "addressLine1",
        "addressLine2",
        "city",
        "companyNumber",
        "country",
        "email",
        "legalNameEn",
        "legalNameHe",
        "phone",
        "postalCode",
        "receiptFooterEn",
        "receiptFooterHe",
        "vatNumber",
        "websiteUrl",
      ].sort(),
    );
  });

  it("preserves Hebrew strings in legalNameHe across a JSON round-trip", () => {
    const heName = "סקייוור איי טי בע\"מ";
    const settings = makeSettings({ legalNameHe: heName });
    const snap = composeSnapshot(settings);
    const round = JSON.parse(JSON.stringify(snap)) as typeof snap;
    expect(round.company.legalNameHe).toBe(heName);
    // No leading/trailing whitespace stripped; no character escapes mangled.
    expect(round.company.legalNameHe).toMatch(/^ס/);
    expect(round.company.legalNameHe).toMatch(/בע\"מ$/);
  });

  it("preserves long footer text without truncation", () => {
    const longFooter = "א".repeat(1024);
    const settings = makeSettings({ receiptFooterHe: longFooter });
    const snap = composeSnapshot(settings);
    expect(snap.company.receiptFooterHe).toBe(longFooter);
    expect(snap.company.receiptFooterHe?.length).toBe(1024);
  });

  it("carries nulls through unchanged (does not coerce to empty string)", () => {
    const settings = makeSettings({
      companyNumber: null,
      vatNumber: null,
      websiteUrl: null,
    });
    const snap = composeSnapshot(settings);
    expect(snap.company.companyNumber).toBeNull();
    expect(snap.company.vatNumber).toBeNull();
    expect(snap.company.websiteUrl).toBeNull();
  });
});
