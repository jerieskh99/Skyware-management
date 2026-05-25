import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @/lib/feature-flags BEFORE importing the module under test so the
// mocked getFeatureFlag is what gates.ts pulls in.
const getFeatureFlag = vi.fn<(key: string) => Promise<boolean>>();
vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlag: (key: string) => getFeatureFlag(key),
}));

import {
  envAllowsProductionIssuance,
  isCleanProductionIssuance,
} from "@/lib/compliance/gates";

const ENV_KEY = "ALLOW_PRODUCTION_ISSUANCE";

describe("envAllowsProductionIssuance", () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
  });

  it("returns false when the env var is unset", () => {
    delete process.env[ENV_KEY];
    expect(envAllowsProductionIssuance()).toBe(false);
  });

  it("returns false when the env var is the literal string 'false'", () => {
    process.env[ENV_KEY] = "false";
    expect(envAllowsProductionIssuance()).toBe(false);
  });

  it("returns false for any non-'true' truthy-looking value", () => {
    for (const v of ["1", "yes", "TRUE", "True", "on"]) {
      process.env[ENV_KEY] = v;
      expect(envAllowsProductionIssuance(), `value=${v}`).toBe(false);
    }
  });

  it("returns true only when the env var equals the exact string 'true'", () => {
    process.env[ENV_KEY] = "true";
    expect(envAllowsProductionIssuance()).toBe(true);
  });
});

describe("isCleanProductionIssuance", () => {
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

  it("returns false when env is unset (short-circuits before reading flags)", async () => {
    delete process.env[ENV_KEY];
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
    expect(getFeatureFlag).not.toHaveBeenCalled();
  });

  it("returns false when env is the string 'false'", async () => {
    process.env[ENV_KEY] = "false";
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
    expect(getFeatureFlag).not.toHaveBeenCalled();
  });

  it("returns false when env=true but receipt_finalize_enabled is false", async () => {
    process.env[ENV_KEY] = "true";
    flagMap({
      receipt_finalize_enabled: false,
      pdf_watermark_disabled: true,
    });
    await expect(isCleanProductionIssuance()).resolves.toBe(false);
  });

  it("returns false when env=true and receipt_finalize_enabled=true but pdf_watermark_disabled=false", async () => {
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

  it("reads both flags when env passes", async () => {
    process.env[ENV_KEY] = "true";
    flagMap({
      receipt_finalize_enabled: true,
      pdf_watermark_disabled: true,
    });
    await isCleanProductionIssuance();
    const keys = getFeatureFlag.mock.calls.map((c) => c[0]);
    expect(keys).toContain("receipt_finalize_enabled");
    expect(keys).toContain("pdf_watermark_disabled");
  });
});
