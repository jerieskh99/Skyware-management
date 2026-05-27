import { describe, it, expect } from "vitest";
import type { SessionUser } from "@/lib/permissions";
import {
  canArchive,
  canCreateArticle,
  canCreateFromJob,
  canCreateKindAs,
  canEditDraft,
  canHardDelete,
  canPublish,
  canReVerify,
  canRescind,
  canReview,
  canRunAiStructure,
  canSubmitForReview,
} from "@/lib/knowledge/permissions";

const admin: SessionUser = {
  id: "admin-1",
  username: "admin.ceo",
  roleKey: "ceo",
  departmentKey: "global",
  isAdmin: true,
  languagePref: "en",
};

const helpdeskEmp: SessionUser = {
  id: "emp-1",
  username: "helpdesk.demo",
  roleKey: "employee",
  departmentKey: "helpdesk",
  isAdmin: false,
  languagePref: "en",
};

const itEmp: SessionUser = {
  id: "emp-2",
  username: "it.demo",
  roleKey: "employee",
  departmentKey: "it",
  isAdmin: false,
  languagePref: "en",
};

describe("canCreateArticle", () => {
  it("admin can create", () => expect(canCreateArticle(admin)).toBe(true));
  it("employee can create", () => expect(canCreateArticle(helpdeskEmp)).toBe(true));
});

describe("canCreateKindAs", () => {
  it("employee can create how_to_guide", () => {
    expect(canCreateKindAs(helpdeskEmp, "how_to_guide")).toBe(true);
  });
  it("employee can create troubleshooting_note", () => {
    expect(canCreateKindAs(helpdeskEmp, "troubleshooting_note")).toBe(true);
  });
  it("employee CANNOT create process_policy_note", () => {
    expect(canCreateKindAs(helpdeskEmp, "process_policy_note")).toBe(false);
  });
  it("employee CANNOT create architecture_decision", () => {
    expect(canCreateKindAs(helpdeskEmp, "architecture_decision")).toBe(false);
  });
  it("admin can create any kind", () => {
    expect(canCreateKindAs(admin, "process_policy_note")).toBe(true);
    expect(canCreateKindAs(admin, "architecture_decision")).toBe(true);
  });
});

describe("canEditDraft", () => {
  it("admin can edit any draft", () => {
    expect(
      canEditDraft(admin, { authorUserId: "someone-else", status: "draft" }),
    ).toBe(true);
  });
  it("author can edit own draft", () => {
    expect(
      canEditDraft(helpdeskEmp, { authorUserId: helpdeskEmp.id, status: "draft" }),
    ).toBe(true);
  });
  it("author can edit own ai_structured", () => {
    expect(
      canEditDraft(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "ai_structured",
      }),
    ).toBe(true);
  });
  it("author CANNOT edit during pending_review", () => {
    expect(
      canEditDraft(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "pending_review",
      }),
    ).toBe(false);
  });
  it("other employee CANNOT edit author's draft", () => {
    expect(
      canEditDraft(itEmp, { authorUserId: helpdeskEmp.id, status: "draft" }),
    ).toBe(false);
  });
  it("author CANNOT edit published", () => {
    expect(
      canEditDraft(helpdeskEmp, { authorUserId: helpdeskEmp.id, status: "published" }),
    ).toBe(false);
  });
});

describe("canSubmitForReview", () => {
  it("author can submit own draft", () => {
    expect(
      canSubmitForReview(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "draft",
      }),
    ).toBe(true);
  });
  it("author can submit own ai_structured", () => {
    expect(
      canSubmitForReview(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "ai_structured",
      }),
    ).toBe(true);
  });
  it("author CANNOT submit if already in pending_review", () => {
    expect(
      canSubmitForReview(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "pending_review",
      }),
    ).toBe(false);
  });
  it("non-author employee CANNOT submit", () => {
    expect(
      canSubmitForReview(itEmp, {
        authorUserId: helpdeskEmp.id,
        status: "draft",
      }),
    ).toBe(false);
  });
});

describe("canReview", () => {
  it("admin can review pending_review where they are not author", () => {
    expect(
      canReview(admin, { authorUserId: helpdeskEmp.id, status: "pending_review" }),
    ).toBe(true);
  });
  it("admin CANNOT review own work (self-review guard)", () => {
    expect(
      canReview(admin, { authorUserId: admin.id, status: "pending_review" }),
    ).toBe(false);
  });
  it("employee CANNOT review in V1 (no senior-employee path yet)", () => {
    expect(
      canReview(helpdeskEmp, {
        authorUserId: itEmp.id,
        status: "pending_review",
      }),
    ).toBe(false);
  });
  it("admin CANNOT review when status is not pending_review", () => {
    expect(
      canReview(admin, { authorUserId: helpdeskEmp.id, status: "draft" }),
    ).toBe(false);
    expect(
      canReview(admin, { authorUserId: helpdeskEmp.id, status: "approved" }),
    ).toBe(false);
  });
});

describe("canPublish / canArchive / canRescind / canHardDelete", () => {
  it("admin can publish", () => expect(canPublish(admin)).toBe(true));
  it("employee CANNOT publish", () => expect(canPublish(helpdeskEmp)).toBe(false));
  it("admin can archive", () => expect(canArchive(admin)).toBe(true));
  it("admin can rescind", () => expect(canRescind(admin)).toBe(true));
  it("admin can hard-delete", () => expect(canHardDelete(admin)).toBe(true));
  it("employee CANNOT archive", () => expect(canArchive(helpdeskEmp)).toBe(false));
});

describe("canReVerify", () => {
  it("admin can re-verify published of any kind", () => {
    expect(
      canReVerify(admin, { kind: "process_policy_note", status: "published" }),
    ).toBe(true);
  });
  it("employee can re-verify published external_reference", () => {
    expect(
      canReVerify(helpdeskEmp, { kind: "external_reference", status: "published" }),
    ).toBe(true);
  });
  it("employee can re-verify published troubleshooting_note", () => {
    expect(
      canReVerify(helpdeskEmp, {
        kind: "troubleshooting_note",
        status: "published",
      }),
    ).toBe(true);
  });
  it("employee CANNOT re-verify process_policy_note", () => {
    expect(
      canReVerify(helpdeskEmp, {
        kind: "process_policy_note",
        status: "published",
      }),
    ).toBe(false);
  });
  it("cannot re-verify non-published", () => {
    expect(
      canReVerify(admin, { kind: "how_to_guide", status: "draft" }),
    ).toBe(false);
  });
});

describe("canRunAiStructure", () => {
  it("author can structure own draft", () => {
    expect(
      canRunAiStructure(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "draft",
      }),
    ).toBe(true);
  });
  it("author CANNOT structure once submitted", () => {
    expect(
      canRunAiStructure(helpdeskEmp, {
        authorUserId: helpdeskEmp.id,
        status: "pending_review",
      }),
    ).toBe(false);
  });
  it("other employee CANNOT structure author's draft", () => {
    expect(
      canRunAiStructure(itEmp, {
        authorUserId: helpdeskEmp.id,
        status: "draft",
      }),
    ).toBe(false);
  });
  it("admin can structure any draft", () => {
    expect(
      canRunAiStructure(admin, {
        authorUserId: helpdeskEmp.id,
        status: "draft",
      }),
    ).toBe(true);
  });
});

describe("canCreateFromJob", () => {
  it("admin can create from any reviewed job", () => {
    expect(
      canCreateFromJob(admin, { assignedEmployeeId: "anyone", status: "reviewed" }),
    ).toBe(true);
  });
  it("assignee can create from own done job", () => {
    expect(
      canCreateFromJob(helpdeskEmp, {
        assignedEmployeeId: helpdeskEmp.id,
        status: "done",
      }),
    ).toBe(true);
  });
  it("assignee can create from own reviewed job", () => {
    expect(
      canCreateFromJob(helpdeskEmp, {
        assignedEmployeeId: helpdeskEmp.id,
        status: "reviewed",
      }),
    ).toBe(true);
  });
  it("non-assignee employee CANNOT create", () => {
    expect(
      canCreateFromJob(itEmp, {
        assignedEmployeeId: helpdeskEmp.id,
        status: "done",
      }),
    ).toBe(false);
  });
  it("assignee CANNOT create from a still-open job", () => {
    expect(
      canCreateFromJob(helpdeskEmp, {
        assignedEmployeeId: helpdeskEmp.id,
        status: "working_on_it",
      }),
    ).toBe(false);
  });
});
