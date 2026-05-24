import { describe, it, expect } from "vitest";
import { buildLikePattern } from "@/lib/search/queries";

describe("buildLikePattern", () => {
  it("wraps the input with leading and trailing %", () => {
    expect(buildLikePattern("acme")).toBe("%acme%");
  });

  it("escapes literal % and _ so they match themselves", () => {
    expect(buildLikePattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("escapes a literal backslash", () => {
    expect(buildLikePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("preserves an empty string as just %%", () => {
    expect(buildLikePattern("")).toBe("%%");
  });
});
