import type { DepartmentKey } from "@prisma/client";

export interface SessionUser {
  id: string;
  username: string;
  roleKey: string;
  departmentKey: string;
  isAdmin: boolean;
  languagePref: string;
}

// ---- Role helpers ----

export function isAdmin(user: SessionUser): boolean {
  return user.isAdmin;
}

export function isEmployee(user: SessionUser): boolean {
  return !user.isAdmin;
}

// ---- Department scope ----

/** True if the user can see jobs/channels in the given department. */
export function canAccessDepartment(
  user: SessionUser,
  departmentKey: DepartmentKey | string
): boolean {
  if (isAdmin(user)) return true;
  return user.departmentKey === departmentKey || departmentKey === "global";
}

// ---- Job read ----

/** Employee can read a job if they're the assignee, it's in their dept, or it's Global. */
export function canReadJob(
  user: SessionUser,
  job: { departmentKey: string; assignedEmployeeId: string | null }
): boolean {
  if (isAdmin(user)) return true;
  return (
    job.assignedEmployeeId === user.id ||
    job.departmentKey === user.departmentKey ||
    job.departmentKey === "global"
  );
}

// ---- Job mutations ----

type ActorRelation = "admin" | "assignee" | "eligible_taker";

export function resolveActorRelation(
  user: SessionUser,
  assignedEmployeeId: string | null
): ActorRelation {
  if (isAdmin(user)) return "admin";
  if (assignedEmployeeId === user.id) return "assignee";
  return "eligible_taker";
}

// ---- Task Hub ----

/** Employee can take tasks in their own dept hub or the global hub. */
export function canTakeInHub(
  user: SessionUser,
  hubDepartmentKey: DepartmentKey | string
): boolean {
  if (isAdmin(user)) return true;
  return hubDepartmentKey === "global" || hubDepartmentKey === user.departmentKey;
}

// ---- Communication ----

export function canPostInChannel(
  user: SessionUser,
  channelDepartmentKey: string | null
): boolean {
  if (isAdmin(user)) return true;
  if (channelDepartmentKey === null) return true; // global
  return channelDepartmentKey === user.departmentKey;
}

// ---- Page access ----

type PortalPage =
  | "dashboard"
  | "my-jobs"
  | "department-jobs"
  | "global-jobs"
  | "hub"
  | "communication"
  | "clients"
  | "billing"
  | "receipts"
  | "financial-documents"
  | "statistics"
  | "agent"
  | "admin"
  | "settings";

const ADMIN_ONLY_PAGES: Set<PortalPage> = new Set([
  "clients",
  "billing",
  "receipts",
  "financial-documents",
  "statistics",
  "agent",
  "admin",
]);

export function canAccessPage(user: SessionUser, page: PortalPage): boolean {
  if (ADMIN_ONLY_PAGES.has(page)) return isAdmin(user);
  return true;
}

// ---- Billing / receipts ----

export function canManageBilling(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canFinalizeReceipt(user: SessionUser): boolean {
  return isAdmin(user);
}
