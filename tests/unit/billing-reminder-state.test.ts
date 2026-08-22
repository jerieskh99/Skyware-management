import { describe, it, expect } from "vitest";
import type { PaymentReminderStatus } from "@prisma/client";
import {
  ALLOWED_REMINDER_TRANSITIONS,
  isAllowedReminderTransition,
  nextReminderStates,
  isTerminalReminderState,
} from "@/lib/billing/reminder-state";

const ALL_STATUSES: PaymentReminderStatus[] = [
  "scheduled",
  "admin_notified",
  "approved",
  "delayed",
  "cancelled",
  "sent",
  "send_failed",
  "bounced",
];

describe("ALLOWED_REMINDER_TRANSITIONS", () => {
  it("encodes the 9 transitions from the Wave-2 brief §4 + delayed-cancel escape hatch", () => {
    expect(ALLOWED_REMINDER_TRANSITIONS.length).toBe(9);
  });

  it("every rule references known statuses", () => {
    for (const rule of ALLOWED_REMINDER_TRANSITIONS) {
      expect(ALL_STATUSES).toContain(rule.from);
      expect(ALL_STATUSES).toContain(rule.to);
    }
  });
});

describe("isAllowedReminderTransition — allowed edges", () => {
  it("scheduled -> admin_notified (worker)", () => {
    expect(isAllowedReminderTransition("scheduled", "admin_notified")).toBe(true);
  });
  it("admin_notified -> approved", () => {
    expect(isAllowedReminderTransition("admin_notified", "approved")).toBe(true);
  });
  it("admin_notified -> delayed", () => {
    expect(isAllowedReminderTransition("admin_notified", "delayed")).toBe(true);
  });
  it("admin_notified -> cancelled", () => {
    expect(isAllowedReminderTransition("admin_notified", "cancelled")).toBe(true);
  });
  it("admin_notified -> sent (send-now or auto-send)", () => {
    expect(isAllowedReminderTransition("admin_notified", "sent")).toBe(true);
  });
  it("approved -> sent", () => {
    expect(isAllowedReminderTransition("approved", "sent")).toBe(true);
  });
  it("approved -> cancelled", () => {
    expect(isAllowedReminderTransition("approved", "cancelled")).toBe(true);
  });
  it("delayed -> admin_notified (re-notify when new date arrives)", () => {
    expect(isAllowedReminderTransition("delayed", "admin_notified")).toBe(true);
  });
  it("delayed -> cancelled (admin escape hatch)", () => {
    expect(isAllowedReminderTransition("delayed", "cancelled")).toBe(true);
  });
});

describe("isAllowedReminderTransition — disallowed edges", () => {
  it("rejects scheduled -> sent (must be reviewed first)", () => {
    expect(isAllowedReminderTransition("scheduled", "sent")).toBe(false);
  });
  it("rejects sent -> send_failed (failure is recorded at send attempt, not a transition)", () => {
    expect(isAllowedReminderTransition("sent", "send_failed")).toBe(false);
  });
  it("rejects scheduled -> approved (must go through admin_notified)", () => {
    expect(isAllowedReminderTransition("scheduled", "approved")).toBe(false);
  });
  it("rejects approved -> delayed", () => {
    expect(isAllowedReminderTransition("approved", "delayed")).toBe(false);
  });
  it("rejects cancelled -> anything", () => {
    for (const to of ALL_STATUSES) {
      expect(isAllowedReminderTransition("cancelled", to)).toBe(false);
    }
  });
  it("rejects no-op transitions (state -> same state)", () => {
    for (const s of ALL_STATUSES) {
      expect(isAllowedReminderTransition(s, s)).toBe(false);
    }
  });
});

describe("nextReminderStates", () => {
  it("scheduled has one edge (admin_notified)", () => {
    expect(nextReminderStates("scheduled")).toEqual(["admin_notified"]);
  });
  it("admin_notified has four edges", () => {
    const states = nextReminderStates("admin_notified");
    expect(states).toContain("approved");
    expect(states).toContain("delayed");
    expect(states).toContain("cancelled");
    expect(states).toContain("sent");
    expect(states.length).toBe(4);
  });
  it("approved has two edges (sent, cancelled)", () => {
    const states = nextReminderStates("approved");
    expect(states).toContain("sent");
    expect(states).toContain("cancelled");
    expect(states.length).toBe(2);
  });
  it("delayed has two edges (admin_notified, cancelled)", () => {
    const states = nextReminderStates("delayed");
    expect(states).toContain("admin_notified");
    expect(states).toContain("cancelled");
    expect(states.length).toBe(2);
  });
});

describe("isTerminalReminderState", () => {
  it("sent, send_failed, cancelled, bounced are terminal", () => {
    expect(isTerminalReminderState("sent")).toBe(true);
    expect(isTerminalReminderState("send_failed")).toBe(true);
    expect(isTerminalReminderState("cancelled")).toBe(true);
    expect(isTerminalReminderState("bounced")).toBe(true);
  });
  it("scheduled, admin_notified, approved, delayed are not terminal", () => {
    expect(isTerminalReminderState("scheduled")).toBe(false);
    expect(isTerminalReminderState("admin_notified")).toBe(false);
    expect(isTerminalReminderState("approved")).toBe(false);
    expect(isTerminalReminderState("delayed")).toBe(false);
  });
});
