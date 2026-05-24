import { describe, it, expect } from "vitest";
import {
  isTransitionAllowed,
  resolveActorRelation,
  isReopening,
} from "@/lib/jobs/lifecycle";
import type { JobStatus } from "@prisma/client";

describe("isTransitionAllowed", () => {
  it("admin can transition new → assigned", () => {
    expect(isTransitionAllowed("new", "assigned", "admin").allowed).toBe(true);
  });

  it("admin can push new → available", () => {
    expect(isTransitionAllowed("new", "available", "admin").allowed).toBe(true);
  });

  it("assignee can transition assigned → working_on_it", () => {
    expect(
      isTransitionAllowed("assigned", "working_on_it", "assignee").allowed
    ).toBe(true);
  });

  it("eligible_taker cannot transition assigned → working_on_it", () => {
    const result = isTransitionAllowed("assigned", "working_on_it", "eligible_taker");
    expect(result.allowed).toBe(false);
  });

  it("eligible_taker can take from hub (available → taken)", () => {
    expect(
      isTransitionAllowed("available", "taken", "eligible_taker").allowed
    ).toBe(true);
  });

  it("assignee can mark done", () => {
    expect(
      isTransitionAllowed("working_on_it", "done", "assignee").allowed
    ).toBe(true);
  });

  it("admin only can mark reviewed", () => {
    expect(isTransitionAllowed("done", "reviewed", "admin").allowed).toBe(true);
    expect(isTransitionAllowed("done", "reviewed", "assignee").allowed).toBe(false);
  });

  it("admin only can transition waiting_for_admin → working_on_it", () => {
    expect(
      isTransitionAllowed("waiting_for_admin", "working_on_it", "admin").allowed
    ).toBe(true);
    expect(
      isTransitionAllowed("waiting_for_admin", "working_on_it", "assignee").allowed
    ).toBe(false);
  });

  it("cancelled is terminal — no outgoing transitions", () => {
    const statuses: JobStatus[] = [
      "new", "assigned", "available", "taken", "working_on_it",
      "waiting_for_client", "waiting_for_admin", "done", "reviewed",
    ];
    for (const s of statuses) {
      expect(isTransitionAllowed("cancelled", s, "admin").allowed).toBe(false);
    }
  });

  it("reviewed can only reopen to working_on_it (admin only)", () => {
    expect(
      isTransitionAllowed("reviewed", "working_on_it", "admin").allowed
    ).toBe(true);
    expect(
      isTransitionAllowed("reviewed", "working_on_it", "assignee").allowed
    ).toBe(false);
    expect(
      isTransitionAllowed("reviewed", "done", "admin").allowed
    ).toBe(false);
  });
});

describe("resolveActorRelation", () => {
  const userId = "user-1";
  const otherId = "user-2";

  it("ceo is always admin", () => {
    expect(resolveActorRelation("ceo", userId, null)).toBe("admin");
  });

  it("cto is always admin", () => {
    expect(resolveActorRelation("cto", userId, otherId)).toBe("admin");
  });

  it("employee who is assignee is assignee", () => {
    expect(resolveActorRelation("employee", userId, userId)).toBe("assignee");
  });

  it("employee who is not assignee is eligible_taker", () => {
    expect(resolveActorRelation("employee", userId, otherId)).toBe("eligible_taker");
  });

  it("employee with no assignee is eligible_taker", () => {
    expect(resolveActorRelation("employee", userId, null)).toBe("eligible_taker");
  });
});

describe("isReopening", () => {
  it("done → working_on_it is a reopen", () => {
    expect(isReopening("done", "working_on_it")).toBe(true);
  });

  it("reviewed → working_on_it is a reopen", () => {
    expect(isReopening("reviewed", "working_on_it")).toBe(true);
  });

  it("assigned → working_on_it is NOT a reopen", () => {
    expect(isReopening("assigned", "working_on_it")).toBe(false);
  });
});
