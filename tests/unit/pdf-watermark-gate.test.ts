import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @/lib/feature-flags BEFORE importing the gate so the gate sees this mock.
const getFeatureFlag = vi.fn<(key: string) => Promise<boolean>>();
vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlag: (key: string) => getFeatureFlag(key),
}));

import { WATERMARK_TEXT_BILINGUAL } from "@/lib/pdf/render";
import { isCleanProductionIssuance } from "@/lib/compliance/gates";

const ENV_KEY = "ALLOW_PRODUCTION_ISSUANCE";

describe("watermark text constant", () => {
  it("matches the exact bilingual draft string the renderer stamps", () => {
    expect(WATERMARK_TEXT_BILINGUAL).toBe(
      "DRAFT - NOT FOR PRODUCTION / טיוטה - לא להפקה",
    );
  });

  it("contains both English and Hebrew labels separated by ' / '", () => {
    expect(WATERMARK_TEXT_BILINGUAL).toMatch(/DRAFT/);
    expect(WATERMARK_TEXT_BILINGUAL).toMatch(/טיוטה/);
    expect(WATERMARK_TEXT_BILINGUAL.split(" / ")).toHaveLength(2);
  });
});

describe("isCleanProductionIssuance - any false gate keeps watermark on", () => {
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    getFeatureFlag.mockReset();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
  });

  function flagMap(map: Record<string, boolean>) {
    getFeatureFlag.mockImplementation(async (key: string) => map[key] ?? false);
  }

  it("returns false when env is off, regardless of flags", async () => {
    delete process.env[ENV_KEY];
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
  });

  it("returns false when receipt_finalize_enabled is off", async () => {
    process.env[ENV_KEY] = "true";
    flagMap({
      receipt_finalize_enabled: false,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
  });

  it("returns false when pdf_watermark_disabled is off", async () => {
    process.env[ENV_KEY] = "true";
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: false,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
  });

  it("returns true only when all three gates pass", async () => {
    process.env[ENV_KEY] = "true";
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(true);
  });
});
