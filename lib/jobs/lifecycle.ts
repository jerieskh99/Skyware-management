import type { JobStatus, RoleKey } from "@prisma/client";

export type ActorRelation = "admin" | "assignee" | "eligible_taker";

interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

// Full transition table per spec Section 7.2 of 02-implementation-ready-spec.md.
const TRANSITIONS: Partial<
  Record<JobStatus, Partial<Record<JobStatus, ActorRelation[]>>>
> = {
  new: {
    assigned: ["admin"],
    available: ["admin"],
    cancelled: ["admin"],
  },
  assigned: {
    working_on_it: ["admin", "assignee"],
    waiting_for_client: ["admin", "assignee"],
    waiting_for_admin: ["admin", "assignee"],
    cancelled: ["admin"],
  },
  available: {
    taken: ["admin", "eligible_taker"],
    cancelled: ["admin"],
  },
  taken: {
    working_on_it: ["admin", "assignee"],
    waiting_for_client: ["admin", "assignee"],
    waiting_for_admin: ["admin", "assignee"],
    cancelled: ["admin"],
  },
  working_on_it: {
    done: ["admin", "assignee"],
    waiting_for_client: ["admin", "assignee"],
    waiting_for_admin: ["admin", "assignee"],
    cancelled: ["admin"],
  },
  waiting_for_client: {
    working_on_it: ["admin", "assignee"],
    cancelled: ["admin"],
  },
  waiting_for_admin: {
    working_on_it: ["admin"],
    cancelled: ["admin"],
  },
  done: {
    reviewed: ["admin"],
    working_on_it: ["admin", "assignee"], // reopen
    cancelled: ["admin"],
  },
  reviewed: {
    working_on_it: ["admin"], // reopen only by admin
  },
  cancelled: {
    // terminal — no outgoing transitions
  },
};

export function isTransitionAllowed(
  fromStatus: JobStatus,
  toStatus: JobStatus,
  actorRelation: ActorRelation
): TransitionResult {
  const allowed = TRANSITIONS[fromStatus]?.[toStatus];
  if (!allowed) {
    return {
      allowed: false,
      reason: `Transition ${fromStatus} → ${toStatus} is not permitted`,
    };
  }
  if (!allowed.includes(actorRelation)) {
    return {
      allowed: false,
      reason: `${actorRelation} cannot perform ${fromStatus} → ${toStatus}`,
    };
  }
  return { allowed: true };
}

export function resolveActorRelation(
  roleKey: RoleKey,
  userId: string,
  assignedEmployeeId: string | null
): ActorRelation {
  if (roleKey === "ceo" || roleKey === "cto") return "admin";
  if (userId === assignedEmployeeId) return "assignee";
  return "eligible_taker";
}

/** True when a transition back to working_on_it constitutes a reopen. */
export function isReopening(
  fromStatus: JobStatus,
  toStatus: JobStatus
): boolean {
  return (
    toStatus === "working_on_it" &&
    (fromStatus === "done" || fromStatus === "reviewed")
  );
}

/** Statuses that count as active (non-terminal, non-idle). */
export const ACTIVE_STATUSES: JobStatus[] = [
  "assigned",
  "taken",
  "working_on_it",
];

/** Statuses that count as waiting (paused). */
export const WAITING_STATUSES: JobStatus[] = [
  "waiting_for_client",
  "waiting_for_admin",
];

/** Terminal statuses. */
export const TERMINAL_STATUSES: JobStatus[] = ["reviewed", "cancelled"];
