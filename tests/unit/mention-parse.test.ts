import { describe, it, expect } from "vitest";
import { extractUsernames } from "@/lib/notifications/mention-parse";

describe("extractUsernames", () => {
  it("parses a single mention at start of string", () => {
    expect(extractUsernames("@helpdesk.demo can you take this?")).toEqual([
      "helpdesk.demo",
    ]);
  });

  it("parses mentions surrounded by punctuation and whitespace", () => {
    expect(extractUsernames("hi @it.demo, please ping @rnd.demo!")).toEqual([
      "it.demo",
      "rnd.demo",
    ]);
  });

  it("returns empty for text without mentions", () => {
    expect(extractUsernames("nothing to see here")).toEqual([]);
    expect(extractUsernames("")).toEqual([]);
  });

  it("ignores email addresses", () => {
    expect(extractUsernames("contact user@example.com please")).toEqual([]);
  });

  it("de-duplicates case-insensitively and preserves first-seen casing", () => {
    expect(extractUsernames("@Foo and @foo and @FOO")).toEqual(["Foo"]);
  });

  it("rejects usernames shorter than 3 chars", () => {
    expect(extractUsernames("@ab @abc @a")).toEqual(["abc"]);
  });

  it("rejects usernames longer than 50 chars", () => {
    const long = "a".repeat(60);
    expect(extractUsernames(`@${long}`)).toEqual([]);
  });

  it("does not parse @everyone or @here as magic", () => {
    // They look like valid usernames structurally — no special exclusion.
    expect(extractUsernames("hi @everyone")).toEqual(["everyone"]);
    expect(extractUsernames("hi @here")).toEqual(["here"]);
  });

  it("supports dots, underscores, and dashes", () => {
    expect(
      extractUsernames("@foo.bar @baz_qux @hello-world")
    ).toEqual(["foo.bar", "baz_qux", "hello-world"]);
  });

  it("requires the first char to be a letter", () => {
    expect(extractUsernames("@123abc")).toEqual([]);
    expect(extractUsernames("@_abc")).toEqual([]);
  });

  it("strips trailing punctuation-only suffixes", () => {
    expect(extractUsernames("ping @helpdesk.demo.")).toEqual(["helpdesk.demo"]);
    expect(extractUsernames("ping @helpdesk.demo!")).toEqual(["helpdesk.demo"]);
  });
});
