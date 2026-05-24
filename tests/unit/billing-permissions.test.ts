import { describe, it, expect } from "vitest";
import {
  canManageBilling,
  canFinalizeReceipt,
  canAccessPage,
} from "@/lib/permissions";
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

describe("canManageBilling", () => {
  it("admin can manage billing", () => expect(canManageBilling(admin)).toBe(true));
  it("employee cannot manage billing", () => expect(canManageBilling(employee)).toBe(false));
});

describe("canFinalizeReceipt", () => {
  it("admin can finalize receipt", () => expect(canFinalizeReceipt(admin)).toBe(true));
  it("employee cannot finalize receipt", () => expect(canFinalizeReceipt(employee)).toBe(false));
});

describe("canAccessPage — admin-only pages", () => {
  const adminOnlyPages = [
    "clients",
    "billing",
    "receipts",
    "financial-documents",
    "statistics",
    "agent",
    "admin",
  ] as const;

  for (const page of adminOnlyPages) {
    it(`admin can access /${page}`, () => {
      expect(canAccessPage(admin, page)).toBe(true);
    });
    it(`employee cannot access /${page}`, () => {
      expect(canAccessPage(employee, page)).toBe(false);
    });
  }
});

describe("canAccessPage — employee-accessible pages", () => {
  const openPages = ["dashboard", "my-jobs", "department-jobs", "global-jobs", "hub", "communication", "settings"] as const;

  for (const page of openPages) {
    it(`employee can access /${page}`, () => {
      expect(canAccessPage(employee, page)).toBe(true);
    });
    it(`admin can access /${page}`, () => {
      expect(canAccessPage(admin, page)).toBe(true);
    });
  }
});
