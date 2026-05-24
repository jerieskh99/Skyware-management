import { describe, it, expect } from "vitest";
import {
  normalizeFilters,
  parseFilterJson,
  toHref,
  toQueryString,
} from "@/components/saved-views/filters";

describe("saved-views filter helpers", () => {
  it("normalizeFilters drops empty/whitespace values and trims", () => {
    const out = normalizeFilters({
      search: "  hello  ",
      priority: "",
      status: undefined,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      closed: "1",
    });
    expect(out).toEqual({ closed: "1", search: "hello" });
  });

  it("normalizeFilters sorts keys for stable serialization", () => {
    const a = normalizeFilters({ b: "2", a: "1", c: "3" });
    expect(Object.keys(a)).toEqual(["a", "b", "c"]);
  });

  it("toQueryString emits a URLSearchParams-compatible string", () => {
    expect(toQueryString({ a: "1", b: "2" })).toBe("a=1&b=2");
    expect(toQueryString({})).toBe("");
  });

  it("toHref appends ? only when there are filters", () => {
    expect(toHref("/x", {})).toBe("/x");
    expect(toHref("/x", { a: "1" })).toBe("/x?a=1");
  });

  it("parseFilterJson keeps string values and discards non-strings", () => {
    expect(parseFilterJson({ a: "1", n: 2, b: "x", o: null })).toEqual({
      a: "1",
      b: "x",
    });
    expect(parseFilterJson(null)).toEqual({});
    expect(parseFilterJson([1, 2, 3])).toEqual({});
    expect(parseFilterJson("not an object")).toEqual({});
  });
});
