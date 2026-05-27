import { describe, it, expect } from "vitest";
import {
  countBodyWords,
  isReadyToSubmit,
  validateForSubmit,
} from "@/lib/knowledge/validators";

const BASE = {
  title: "How to reset a stuck print spooler",
  summary:
    "A repeatable recipe for clearing the Windows print spooler when it gets jammed",
  body: "Lorem ipsum dolor sit amet ".repeat(50), // 250 words
  tagsCount: 2,
  externalUrl: null,
  externalSource: null,
};

describe("countBodyWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countBodyWords("one two three")).toBe(3);
  });

  it("ignores fenced code blocks", () => {
    const body = "before\n```\nthis is code\n```\nafter";
    expect(countBodyWords(body)).toBe(2);
  });

  it("returns 0 for empty", () => {
    expect(countBodyWords("")).toBe(0);
  });
});

describe("validateForSubmit - title", () => {
  it("rejects a too-short title", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      title: "short",
    });
    expect(issues.some((i) => i.code === "title_too_short")).toBe(true);
  });

  it("passes an 8-char title", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      title: "12345678",
    });
    expect(issues.some((i) => i.code === "title_too_short")).toBe(false);
  });
});

describe("validateForSubmit - summary", () => {
  it("rejects a too-short summary", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      summary: "tiny",
    });
    expect(issues.some((i) => i.code === "summary_too_short")).toBe(true);
  });

  it("rejects null summary", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      summary: null,
    });
    expect(issues.some((i) => i.code === "summary_too_short")).toBe(true);
  });
});

describe("validateForSubmit - body word floor per kind", () => {
  it("how_to_guide: 200 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      body: "word ".repeat(199),
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
    const issuesOk = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      body: "word ".repeat(200),
    });
    expect(issuesOk.some((i) => i.code === "body_too_short")).toBe(false);
  });

  it("internal_task_lesson: 80 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "internal_task_lesson",
      body: "word ".repeat(79),
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
    const ok = validateForSubmit({
      ...BASE,
      kind: "internal_task_lesson",
      body: "word ".repeat(80),
    });
    expect(ok.some((i) => i.code === "body_too_short")).toBe(false);
  });

  it("external_reference: 40 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "external_reference",
      body: "word ".repeat(39),
      externalUrl: "https://example.com/article",
      externalSource: "Example Publication",
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
  });

  it("troubleshooting_note: 80 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "troubleshooting_note",
      body: "word ".repeat(40),
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
  });

  it("architecture_decision: 150 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "architecture_decision",
      body: "word ".repeat(100),
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
  });

  it("process_policy_note: 150 words required", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "process_policy_note",
      body: "word ".repeat(100),
    });
    expect(issues.some((i) => i.code === "body_too_short")).toBe(true);
  });
});

describe("validateForSubmit - tags", () => {
  it("rejects when tags is 0", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "how_to_guide",
      tagsCount: 0,
    });
    expect(issues.some((i) => i.code === "no_tags")).toBe(true);
  });
});

describe("validateForSubmit - external_reference specific rules", () => {
  it("requires externalUrl", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "external_reference",
      body: "word ".repeat(45),
      externalUrl: null,
      externalSource: "Vendor docs",
    });
    expect(issues.some((i) => i.code === "external_missing_url")).toBe(true);
  });

  it("requires externalSource", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "external_reference",
      body: "word ".repeat(45),
      externalUrl: "https://example.com/",
      externalSource: null,
    });
    expect(issues.some((i) => i.code === "external_missing_source")).toBe(true);
  });

  it("rejects a non-http(s) URL", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "external_reference",
      body: "word ".repeat(45),
      externalUrl: "javascript:alert(1)",
      externalSource: "x",
    });
    expect(issues.some((i) => i.code === "external_bad_url")).toBe(true);
  });

  it("accepts a well-formed external_reference payload", () => {
    const issues = validateForSubmit({
      ...BASE,
      kind: "external_reference",
      body: "word ".repeat(45),
      externalUrl: "https://example.com/article",
      externalSource: "Example Publication",
    });
    expect(issues).toEqual([]);
  });
});

describe("isReadyToSubmit", () => {
  it("returns true on a fully valid payload", () => {
    expect(
      isReadyToSubmit({
        ...BASE,
        kind: "how_to_guide",
      }),
    ).toBe(true);
  });

  it("returns false on a payload with issues", () => {
    expect(
      isReadyToSubmit({
        ...BASE,
        kind: "how_to_guide",
        tagsCount: 0,
      }),
    ).toBe(false);
  });
});
