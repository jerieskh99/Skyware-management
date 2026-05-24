import { describe, it, expect } from "vitest";
import {
  isAdmin,
  isEmployee,
  canAccessDepartment,
  canReadJob,
  canTakeInHub,
  canPostInChannel,
  canAccessPage,
} from "@/lib/permissions";
import type { SessionUser } from "@/lib/permissions";

const adminUser: SessionUser = {
  id: "admin-1",
  username: "admin.ceo",
  roleKey: "ceo",
  departmentKey: "global",
  isAdmin: true,
  languagePref: "en",
};

const helpDeskUser: SessionUser = {
  id: "emp-1",
  username: "helpdesk.demo",
  roleKey: "employee",
  departmentKey: "helpdesk",
  isAdmin: false,
  languagePref: "en",
};

const itUser: SessionUser = {
  id: "emp-2",
  username: "it.demo",
  roleKey: "employee",
  departmentKey: "it",
  isAdmin: false,
  languagePref: "en",
};

describe("isAdmin / isEmployee", () => {
  it("ceo is admin", () => expect(isAdmin(adminUser)).toBe(true));
  it("employee is not admin", () => expect(isAdmin(helpDeskUser)).toBe(false));
  it("employee isEmployee", () => expect(isEmployee(helpDeskUser)).toBe(true));
});

describe("canAccessDepartment", () => {
  it("admin can access any department", () => {
    expect(canAccessDepartment(adminUser, "helpdesk")).toBe(true);
    expect(canAccessDepartment(adminUser, "rnd")).toBe(true);
  });

  it("employee can access own department", () => {
    expect(canAccessDepartment(helpDeskUser, "helpdesk")).toBe(true);
  });

  it("employee can access global", () => {
    expect(canAccessDepartment(helpDeskUser, "global")).toBe(true);
  });

  it("employee cannot access another department", () => {
    expect(canAccessDepartment(helpDeskUser, "it")).toBe(false);
    expect(canAccessDepartment(helpDeskUser, "rnd")).toBe(false);
  });
});

describe("canReadJob", () => {
  it("admin can read any job", () => {
    const job = { departmentKey: "rnd", assignedEmployeeId: null };
    expect(canReadJob(adminUser, job)).toBe(true);
  });

  it("employee can read own assigned job in another department", () => {
    const job = { departmentKey: "it", assignedEmployeeId: helpDeskUser.id };
    expect(canReadJob(helpDeskUser, job)).toBe(true);
  });

  it("employee can read job in own department", () => {
    const job = { departmentKey: "helpdesk", assignedEmployeeId: null };
    expect(canReadJob(helpDeskUser, job)).toBe(true);
  });

  it("employee can read global job", () => {
    const job = { departmentKey: "global", assignedEmployeeId: null };
    expect(canReadJob(helpDeskUser, job)).toBe(true);
  });

  it("employee cannot read unrelated job in another department", () => {
    const job = { departmentKey: "it", assignedEmployeeId: "other-user" };
    expect(canReadJob(helpDeskUser, job)).toBe(false);
  });
});

describe("canTakeInHub", () => {
  it("employee can take from own department hub", () => {
    expect(canTakeInHub(helpDeskUser, "helpdesk")).toBe(true);
  });

  it("employee can take from global hub", () => {
    expect(canTakeInHub(helpDeskUser, "global")).toBe(true);
  });

  it("employee cannot take from another department hub", () => {
    expect(canTakeInHub(helpDeskUser, "it")).toBe(false);
  });

  it("admin can take from any hub", () => {
    expect(canTakeInHub(adminUser, "rnd")).toBe(true);
  });
});

describe("canPostInChannel", () => {
  it("employee can post in global (null deptKey) channel", () => {
    expect(canPostInChannel(helpDeskUser, null)).toBe(true);
  });

  it("employee can post in own department channel", () => {
    expect(canPostInChannel(helpDeskUser, "helpdesk")).toBe(true);
  });

  it("employee cannot post in another department channel", () => {
    expect(canPostInChannel(helpDeskUser, "it")).toBe(false);
  });

  it("admin can post in any channel", () => {
    expect(canPostInChannel(adminUser, "rnd")).toBe(true);
  });
});

describe("canAccessPage", () => {
  it("admin can access billing", () => {
    expect(canAccessPage(adminUser, "billing")).toBe(true);
  });

  it("employee cannot access billing", () => {
    expect(canAccessPage(helpDeskUser, "billing")).toBe(false);
  });

  it("employee can access dashboard", () => {
    expect(canAccessPage(helpDeskUser, "dashboard")).toBe(true);
  });

  it("employee can access settings", () => {
    expect(canAccessPage(helpDeskUser, "settings")).toBe(true);
  });
});
