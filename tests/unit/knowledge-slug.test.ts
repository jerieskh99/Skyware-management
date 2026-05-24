import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/knowledge/slug";

describe("slugify", () => {
  it("lowercases ASCII and replaces whitespace with dashes", () => {
    expect(slugify("Server Down")).toBe("server-down");
    expect(slugify("  Migration  Guide  ")).toBe("migration-guide");
  });

  it("collapses runs of dashes and trims edges", () => {
    expect(slugify("a -- b -- c")).toBe("a-b-c");
    expect(slugify("---Hello---")).toBe("hello");
  });

  it("folds common diacritics", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
    expect(slugify("naïveté")).toBe("naivete");
  });

  it("preserves Hebrew letters", () => {
    // "מדריך השרת" -> "מדריך-השרת"
    expect(slugify("מדריך השרת")).toBe("מדריך-השרת");
  });

  it("mixes Hebrew and ASCII", () => {
    expect(slugify("Setup הוראות")).toBe("setup-הוראות");
  });

  it("strips punctuation but keeps digits", () => {
    expect(slugify("Release v1.2.3!")).toBe("release-v1-2-3");
    expect(slugify("api/v1: rate limits")).toBe("api-v1-rate-limits");
  });

  it("returns empty string for input with no allowed characters", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("!@#$%^&*()")).toBe("");
  });

  it("truncates to 80 chars and trims trailing dash", () => {
    const long = "a".repeat(90);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toBe("a".repeat(80));
  });

  it("does not split mid-dash when truncating", () => {
    // Build a string that hits the 80-char boundary on a dash, then ensure
    // trailing dash is stripped.
    const pieces = "word-".repeat(20); // 100 chars: 20 groups of "word-"
    const slug = slugify(pieces);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});
