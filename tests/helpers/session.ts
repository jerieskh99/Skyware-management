import type { SessionUser } from "@/lib/permissions";
import { __setMockSessionUser } from "../setup";

interface AdminOverrides extends Partial<SessionUser> {}

/** Build an admin (CEO) session user. */
export function makeAdminSession(overrides?: AdminOverrides): SessionUser {
  return {
    id: "admin-1",
    username: "admin.ceo",
    roleKey: "ceo",
    departmentKey: "global",
    isAdmin: true,
    languagePref: "en",
    ...(overrides ?? {}),
  };
}

interface EmployeeOpts {
  department: "helpdesk" | "it" | "rnd";
}

/** Build a non-admin employee session user in the given department. */
export function makeEmployeeSession(
  opts: EmployeeOpts,
  overrides?: Partial<SessionUser>
): SessionUser {
  return {
    id: `emp-${opts.department}-1`,
    username: `${opts.department}.demo`,
    roleKey: "employee",
    departmentKey: opts.department,
    isAdmin: false,
    languagePref: "en",
    ...(overrides ?? {}),
  };
}

/** Stub the next-auth `auth()` function to return the given user (or `null`). */
export function mockAuthAs(user: SessionUser | null): void {
  __setMockSessionUser(user);
}
