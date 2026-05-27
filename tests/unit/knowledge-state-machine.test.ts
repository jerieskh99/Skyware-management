import { describe, it, expect } from "vitest";
import type { KnowledgeArticleStatus } from "@prisma/client";
import {
  ALLOWED_TRANSITIONS,
  actionFor,
  isAllowedTransition,
  nextStates,
  ruleFor,
} from "@/lib/knowledge/state-machine";

const ALL_STATUSES: KnowledgeArticleStatus[] = [
  "draft",
  "ai_structured",
  "pending_review",
  "approved",
  "published",
  "archived",
];

describe("ALLOWED_TRANSITIONS", () => {
  it("encodes the 9 transitions from review_workflow §1", () => {
    expect(ALLOWED_TRANSITIONS.length).toBe(9);
  });

  it("every rule has a known from, to, action, and who", () => {
    for (const rule of ALLOWED_TRANSITIONS) {
      expect(ALL_STATUSES).toContain(rule.from);
      expect(ALL_STATUSES).toContain(rule.to);
      expect(["admin", "author", "reviewer"]).toContain(rule.who);
      expect(typeof rule.action).toBe("string");
    }
  });
});

describe("isAllowedTransition - happy paths", () => {
  it("draft -> ai_structured (author runs AI)", () => {
    expect(isAllowedTransition("draft", "ai_structured")).toBe(true);
  });
  it("draft -> pending_review (author submits)", () => {
    expect(isAllowedTransition("draft", "pending_review")).toBe(true);
  });
  it("ai_structured -> pending_review (author submits after AI)", () => {
    expect(isAllowedTransition("ai_structured", "pending_review")).toBe(true);
  });
  it("pending_review -> approved (reviewer approves)", () => {
    expect(isAllowedTransition("pending_review", "approved")).toBe(true);
  });
  it("pending_review -> draft (reviewer requests changes)", () => {
    expect(isAllowedTransition("pending_review", "draft")).toBe(true);
  });
  it("approved -> published (publish)", () => {
    expect(isAllowedTransition("approved", "published")).toBe(true);
  });
  it("approved -> pending_review (admin un-approves)", () => {
    expect(isAllowedTransition("approved", "pending_review")).toBe(true);
  });
  it("published -> archived (admin archives)", () => {
    expect(isAllowedTransition("published", "archived")).toBe(true);
  });
  it("archived -> draft (admin resurrects)", () => {
    expect(isAllowedTransition("archived", "draft")).toBe(true);
  });
});

describe("isAllowedTransition - disallowed transitions", () => {
  it("rejects archived -> published directly", () => {
    expect(isAllowedTransition("archived", "published")).toBe(false);
  });
  it("rejects pending_review -> published (must go through approved)", () => {
    expect(isAllowedTransition("pending_review", "published")).toBe(false);
  });
  it("rejects published -> draft (must go through pending_review via re-verify)", () => {
    expect(isAllowedTransition("published", "draft")).toBe(false);
  });
  it("rejects draft -> approved (must go through pending_review)", () => {
    expect(isAllowedTransition("draft", "approved")).toBe(false);
  });
  it("rejects draft -> published (no bypass path)", () => {
    expect(isAllowedTransition("draft", "published")).toBe(false);
  });
  it("rejects approved -> archived (must go through published or stay approved)", () => {
    // approved -> archived is NOT in the explicit list per the brief; archives
    // happen from published (or from draft via the no-op archive path that is
    // out of scope for state-machine V1).
    expect(isAllowedTransition("approved", "archived")).toBe(false);
  });
  it("rejects no-op transitions (state -> same state)", () => {
    for (const s of ALL_STATUSES) {
      expect(isAllowedTransition(s, s)).toBe(false);
    }
  });
});

describe("nextStates", () => {
  it("draft has two forward edges (ai_structured, pending_review)", () => {
    const states = nextStates("draft");
    expect(states).toContain("ai_structured");
    expect(states).toContain("pending_review");
    expect(states.length).toBe(2);
  });

  it("pending_review has two edges (approved, draft)", () => {
    const states = nextStates("pending_review");
    expect(states).toContain("approved");
    expect(states).toContain("draft");
    expect(states.length).toBe(2);
  });

  it("published has one edge (archived)", () => {
    expect(nextStates("published")).toEqual(["archived"]);
  });

  it("archived has one edge (draft, admin only)", () => {
    expect(nextStates("archived")).toEqual(["draft"]);
  });

  it("ai_structured has one edge (pending_review)", () => {
    expect(nextStates("ai_structured")).toEqual(["pending_review"]);
  });
});

describe("actionFor", () => {
  it("returns the action label for legal edges", () => {
    expect(actionFor("draft", "pending_review")).toBe("submit_for_review");
    expect(actionFor("pending_review", "approved")).toBe("approve");
    expect(actionFor("pending_review", "draft")).toBe("request_changes");
    expect(actionFor("approved", "published")).toBe("publish");
    expect(actionFor("approved", "pending_review")).toBe("un_approve");
    expect(actionFor("published", "archived")).toBe("archive");
    expect(actionFor("archived", "draft")).toBe("un_archive");
    expect(actionFor("draft", "ai_structured")).toBe("ai_structure");
  });

  it("returns null for disallowed edges", () => {
    expect(actionFor("draft", "approved")).toBeNull();
    expect(actionFor("archived", "published")).toBeNull();
    expect(actionFor("draft", "draft")).toBeNull();
  });
});

describe("ruleFor", () => {
  it("returns the full rule including who", () => {
    expect(ruleFor("pending_review", "approved")?.who).toBe("reviewer");
    expect(ruleFor("approved", "pending_review")?.who).toBe("admin");
    expect(ruleFor("archived", "draft")?.who).toBe("admin");
    expect(ruleFor("draft", "ai_structured")?.who).toBe("author");
  });

  it("returns null for unknown edges", () => {
    expect(ruleFor("draft", "approved")).toBeNull();
  });
});
