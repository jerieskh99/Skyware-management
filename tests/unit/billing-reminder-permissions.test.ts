import { describe, it, expect } from "vitest";
import {
  canManageReminders,
  canSendManualContact,
  canEditEmailTemplates,
} from "@/lib/billing/permissions";
import type { SessionUser } from "@/lib/permissions";

const admin: SessionUser = {
  id: "admin-1",
  username: "admin.ceo",
  roleKey: "ceo",
  departmentKey: "global",
  isAdmin: true,
  languagePref: "en",
};

const employee: SessionUser = {
  id: "emp-1",
  username: "emp.helpdesk",
  roleKey: "employee",
  departmentKey: "helpdesk",
  isAdmin: false,
  languagePref: "en",
};

describe("Wave-2 billing permissions", () => {
  it("admin can manage reminders; employee cannot", () => {
    expect(canManageReminders(admin)).toBe(true);
    expect(canManageReminders(employee)).toBe(false);
  });
  it("admin can send manual contact; employee cannot", () => {
    expect(canSendManualContact(admin)).toBe(true);
    expect(canSendManualContact(employee)).toBe(false);
  });
  it("admin can edit email templates; employee cannot", () => {
    expect(canEditEmailTemplates(admin)).toBe(true);
    expect(canEditEmailTemplates(employee)).toBe(false);
  });
});
